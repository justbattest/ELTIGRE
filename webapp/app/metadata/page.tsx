'use client'

import { useCallback, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { compressImage } from '@/lib/compress-image'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

// ── Types ─────────────────────────────────────────────────────────────────────

type FileEntry = {
  file: File
  preview: string | null  // objectURL pour images, null pour vidéos
  isVideo: boolean
}

type FileResult = {
  filename: string
  isVideo: boolean
  driveUrl: string | null
  error: string | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

/**
 * Compression client-side → les photos passent de 30MB à ~2MB avant l'envoi.
 * CHUNK_SIZE=10 est safe après compression (10 × 2MB = 20MB par requête).
 * Promise.all sur tous les chunks = vitesse maximale, identique à Bulk Edit.
 */
const UPLOAD_CHUNK_SIZE = 10

// ── Helper SSE ────────────────────────────────────────────────────────────────

function waitForRun(
  runId: string,
  onFile: (r: FileResult) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/metadata/events/${runId}`)
    const cleanup = () => es.close()
    signal.addEventListener('abort', () => { cleanup(); reject(new Error('Annulé')) }, { once: true })

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        if (ev.type === 'file') {
          onFile({ filename: ev.filename, isVideo: ev.is_video, driveUrl: ev.drive_url, error: ev.error })
        } else if (ev.type === 'done') {
          cleanup(); resolve()
        } else if (ev.type === 'error') {
          cleanup(); reject(new Error(ev.message || 'Erreur Python'))
        }
      } catch { /* ignore malformed */ }
    }
    es.onerror = () => { cleanup(); reject(new Error('SSE perdu (serveur redémarré ?)')) }
  })
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function MetadataPage() {
  useSession()
  const router = useRouter()

  const [entries,  setEntries]  = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [error,    setError]    = useState('')

  // ── Personnage ──────────────────────────────────────────────────────────────
  const [characters,            setCharacters]            = useState<{ id: string; name: string }[]>([])
  const [selectedCharacterName, setSelectedCharacterName] = useState('')

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const all = [...(data.referenceElements || []), ...(data.soulCharacters || [])]
        setCharacters(all)
        if (all.length) setSelectedCharacterName(all[0].name)
      })
      .catch(() => {})
  }, [])

  // ── État du run ─────────────────────────────────────────────────────────────

  // Phase 1 — envoi des fichiers sur le serveur
  const [phase,        setPhase]        = useState<'idle' | 'compressing' | 'uploading' | 'processing' | 'done'>('idle')
  const [uploadedFiles, setUploadedFiles] = useState(0)   // fichiers arrivés sur serveur

  // Phase 2 — traitement Python + upload Drive
  const [total,      setTotal]      = useState(0)          // total fichiers à traiter
  const [completed,  setCompleted]  = useState(0)          // fichiers traités par Python
  const [results,    setResults]    = useState<FileResult[]>([])

  const abortRef = useRef<AbortController | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fichiers ────────────────────────────────────────────────────────────────

  const isVideoFile = (f: File) =>
    f.type.startsWith('video/') || /\.(mp4|mov|m4v|avi|mkv)$/i.test(f.name)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    Array.from(newFiles)
      .filter(f => f.type.startsWith('image/') || isVideoFile(f))
      .forEach(f => {
        setEntries(prev => [...prev, {
          file: f,
          preview: isVideoFile(f) ? null : URL.createObjectURL(f),
          isVideo: isVideoFile(f),
        }])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeEntry = (idx: number) => {
    setEntries(prev => {
      const e = prev[idx]
      if (e.preview) URL.revokeObjectURL(e.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const resetAll = () => {
    abortRef.current?.abort()
    entries.forEach(e => { if (e.preview) URL.revokeObjectURL(e.preview) })
    setEntries([])
    setPhase('idle')
    setUploadedFiles(0)
    setTotal(0)
    setCompleted(0)
    setResults([])
    setError('')
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files)
  }

  // ── Lancement ───────────────────────────────────────────────────────────────
  //
  // Architecture 2 phases :
  //
  // Phase 1 — Upload chunks (HTTP)
  //   • Envoie les fichiers par paquets de UPLOAD_CHUNK_SIZE vers /api/metadata/upload
  //   • Chaque paquet est une requête ~150 MB max → pas d'OOM Node.js
  //   • Tous les chunks partagent le même runId → 1 seul dossier tmp sur le serveur
  //   • Montre une barre de progression "envoi X/N fichiers"
  //
  // Phase 2 — Processing (1 seul subprocess)
  //   • POST /api/metadata/start → lance 1 seul subprocess Python sur TOUS les fichiers
  //   • Python lit l'unique dossier tmp, traite tout, uploade dans 1 dossier Drive
  //   • SSE stream : 1 event par fichier → barre de progression live
  //
  // Résultat Drive : <PERSO>/metadata/<run_id>/ avec TOUS les fichiers dedans

  const launch = async () => {
    if (entries.length === 0) { setError('Ajoute au moins un fichier.'); return }

    setError('')
    setPhase('compressing')
    setUploadedFiles(0)
    setTotal(entries.length)
    setCompleted(0)
    setResults([])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // ── Phase 0 : compression locale (100% dans le navigateur, ~2-5s) ──────────
      // Réduit chaque image de 20-50MB à ~2MB. Qualité JPEG 92% + max 4096px.
      // Visuellement identique, mais ÷10 à ÷20 en taille → plus d'OOM sur Railway.
      const compressedEntries = await Promise.all(
        entries.map(async (e) => ({ ...e, file: await compressImage(e.file) }))
      )

      if (abort.signal.aborted) return

      // ── Phase 1 : upload de tous les fichiers par chunks EN PARALLÈLE ─────────
      setPhase('uploading')
      const runId = `metadata_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

      // Enregistrer immédiatement le run en mémoire → visible dans En cours dès maintenant
      await fetch('/api/metadata/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, fileCount: compressedEntries.length }),
      }).catch(() => {}) // fire-and-forget, pas bloquant

      const chunks: FileEntry[][] = []
      for (let i = 0; i < compressedEntries.length; i += UPLOAD_CHUNK_SIZE) {
        chunks.push(compressedEntries.slice(i, i + UPLOAD_CHUNK_SIZE))
      }

      // Tous les chunks en parallèle — après compression ~20MB max simultané, safe
      await Promise.all(chunks.map(async (chunk) => {
        if (abort.signal.aborted) return
        const form = new FormData()
        form.append('runId', runId)
        chunk.forEach(e => form.append('files', e.file))
        const res  = await fetch('/api/metadata/upload', { method: 'POST', body: form, signal: abort.signal })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
        setUploadedFiles(prev => prev + data.savedCount)
      }))

      if (abort.signal.aborted || !runId) return

      // ── Phase 2 : démarrer le subprocess Python (1 seul pour tous les fichiers) ──
      setPhase('processing')

      const startRes  = await fetch('/api/metadata/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, characterName: selectedCharacterName }),
        signal: abort.signal,
      })
      const startData = await startRes.json()
      if (!startRes.ok || startData.error) throw new Error(startData.error || 'Erreur démarrage')

      // Le subprocess Python tourne indépendamment côté serveur.
      // On redirige vers En cours qui se reconnecte au SSE et affiche la progression.
      router.push('/en-cours')

    } catch (e) {
      if (abort.signal.aborted) return
      setError(String(e))
      setPhase('done')
    }
  }

  // ── Calculs UI ───────────────────────────────────────────────────────────────

  const imgCount   = entries.filter(e => !e.isVideo).length
  const videoCount = entries.filter(e =>  e.isVideo).length
  const nChunks    = Math.ceil(entries.length / UPLOAD_CHUNK_SIZE)

  const uploadPct  = total > 0 ? Math.round((uploadedFiles  / total) * 100) : 0
  const processPct = total > 0 ? Math.round((completed      / total) * 100) : 0

  const isRunning = phase === 'compressing' || phase === 'uploading' || phase === 'processing'
  const isDone    = phase === 'done'

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

        {/* ── Config (idle uniquement) ────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Sélecteur personnage */}
            {characters.length > 0 && (
              <div className="bg-zinc-900/60 backdrop-blur-sm border border-white/[0.07] rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-2">Personnage (dossier Drive)</p>
                <div className="flex flex-wrap gap-2">
                  {characters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCharacterName(c.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedCharacterName === c.name
                          ? 'bg-gradient-to-br from-violet-600 to-violet-500 border-violet-500 text-white'
                          : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:border-violet-500/50'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zone drag & drop */}
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-violet-400 bg-violet-900/20' : 'border-white/[0.08] hover:border-white/[0.20] bg-zinc-900/40'
              }`}
            >
              <div className="text-4xl mb-3">🧹</div>
              <p className="text-zinc-300 font-medium">Glisse tes photos &amp; vidéos ici</p>
              <p className="text-zinc-500 text-sm mt-1">JPG · PNG · WebP · MP4 · MOV · quantité illimitée · tout arrive dans 1 seul dossier Drive</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.mov,.mkv,.avi"
                multiple
                className="hidden"
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Previews */}
            {entries.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-zinc-400">
                    {imgCount > 0 && <span>{imgCount} photo{imgCount > 1 ? 's' : ''}</span>}
                    {imgCount > 0 && videoCount > 0 && <span className="mx-1">·</span>}
                    {videoCount > 0 && <span>{videoCount} vidéo{videoCount > 1 ? 's' : ''}</span>}
                    {entries.length > UPLOAD_CHUNK_SIZE && (
                      <span className="text-zinc-600 ml-2">
                        · envoyé en {nChunks} tranches de {UPLOAD_CHUNK_SIZE}, dans 1 dossier Drive
                      </span>
                    )}
                  </span>
                  <button onClick={resetAll} className="text-xs text-gray-600 hover:text-red-400 transition">
                    Tout effacer
                  </button>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1">
                  {entries.map((entry, i) => (
                    <div key={i} className="relative group aspect-square">
                      {entry.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.preview} alt="" className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <div className="w-full h-full bg-black/40 rounded-md flex items-center justify-center">
                          <span className="text-lg">🎬</span>
                        </div>
                      )}
                      <button
                        onClick={ev => { ev.stopPropagation(); removeEntry(i) }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-3.5 h-3.5 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Infos */}
            <div className="bg-zinc-900/60 backdrop-blur-sm border border-white/[0.07] rounded-xl p-4 space-y-1.5">
              <p className="text-[10px] text-zinc-500">🖼️ <strong className="text-zinc-400">Images</strong> — EXIF iPhone 17 Pro (iOS 26.x, GPS, ISO uniques) · ICC Display P3 · DQT Apple</p>
              <p className="text-[10px] text-zinc-500">🎬 <strong className="text-zinc-400">Vidéos</strong> — com.apple.quicktime.* · handler Core Media Video · strip Kling/Lavf</p>
              <p className="text-[10px] text-zinc-500">📂 <strong className="text-zinc-400">Drive</strong> — <code className="text-violet-400">{selectedCharacterName || '…'}/metadata/&lt;run_id&gt;/</code> — 1 seul dossier, tous les fichiers dedans</p>
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-xl p-4">{error}</div>
            )}

            <button
              onClick={launch}
              disabled={entries.length === 0}
              className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3.5 transition text-sm"
            >
              {entries.length === 0
                ? 'Ajoute des fichiers pour commencer'
                : `Nettoyer et uploader ${entries.length} fichier${entries.length > 1 ? 's' : ''} — 1 dossier Drive`}
            </button>
          </>
        )}

        {/* ── Progression (running + done) ────────────────────────────────── */}
        {(isRunning || isDone) && (
          <div className="space-y-5">
            <div className="bg-zinc-900/60 backdrop-blur-sm border border-white/[0.07] rounded-xl p-5 space-y-5">

              {/* Phase 0 — compression locale */}
              {phase === 'compressing' && (
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>🗜 Compression des images… (traitement local, quelques secondes)</span>
                </div>
              )}

              {/* Phase 1 — envoi serveur */}
              {phase !== 'compressing' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-zinc-400">
                    {phase === 'uploading' ? '⬆️ Envoi vers le serveur…' : '⬆️ Fichiers reçus'}
                  </span>
                  <span className="text-xs text-zinc-500">{uploadedFiles}/{total}</span>
                </div>
                <div className="bg-white/[0.05] rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${phase === 'uploading' ? 'bg-blue-500' : 'bg-blue-800'}`}
                    style={{ width: `${uploadPct}%` }}
                  />
                </div>
              </div>
              )}

              {/* Phase 2 — nettoyage + Drive */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-zinc-400">
                    {phase === 'uploading'   ? '⏳ En attente…'
                    : isDone && !error       ? '✅ Nettoyage terminé !'
                    : phase === 'processing' ? '🧹 Nettoyage + upload Drive…'
                    : '❌ Erreur'}
                  </span>
                  <span className="text-xs text-zinc-500">{completed}/{total}</span>
                </div>
                <div className="bg-white/[0.05] rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${processPct}%` }}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg p-3">{error}</div>
              )}

              {isRunning && (
                <button
                  onClick={() => { abortRef.current?.abort(); resetAll() }}
                  className="w-full bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-400 hover:text-red-300 text-sm rounded-lg py-2.5 transition"
                >
                  ✕ Annuler
                </button>
              )}

              {isDone && (
                <button onClick={resetAll} className="w-full bg-white/[0.08] hover:bg-white/[0.08] text-white text-sm rounded-lg py-2.5 transition">
                  + Nouveau batch
                </button>
              )}
            </div>

            {/* Résultats fichier par fichier */}
            {results.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">
                  Fichiers traités ({results.length}/{total})
                </h3>
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`bg-zinc-900/60 border rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                        r.error ? 'border-red-900/50' : 'border-white/[0.07]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">{r.isVideo ? '🎬' : '🖼️'}</span>
                        <span className="text-xs text-zinc-300 truncate">{r.filename}</span>
                      </div>
                      {r.error ? (
                        <span className="text-[10px] text-red-400 shrink-0 ml-2">❌ {r.error.slice(0, 40)}</span>
                      ) : r.driveUrl ? (
                        <a href={r.driveUrl} target="_blank" rel="noopener noreferrer"
                           className="text-[10px] text-violet-400 hover:text-violet-300 transition shrink-0 ml-2">
                          Drive →
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
