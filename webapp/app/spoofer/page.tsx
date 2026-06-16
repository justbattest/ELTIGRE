'use client'

import { useCallback, useRef, useState } from 'react'
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

type VariationResult = {
  file: string
  variation: number
  outputPath: string
  tiersApplied: string[]
}

type Level = 'aggressive'

// ── Constantes ────────────────────────────────────────────────────────────────

const UPLOAD_CHUNK_SIZE = 3
const UPLOAD_MAX_RETRIES = 2

const TIER_LABELS: Record<string, string> = {
  tier1: 'Géométrie',
  tier2: 'Couleur & texture',
  tier3: 'Protection IA',
  tier4: 'Variations vidéo',
  metadata: 'Métadonnées',
}

// ── Helper SSE ────────────────────────────────────────────────────────────────

type SSEHandlers = {
  onStart?: (total: number, level: string) => void
  onProgress?: (current: number, total: number) => void
  onVariation?: (r: VariationResult) => void
  onInfo?: (msg: string) => void
  onWarn?: (msg: string) => void
}

function waitForRun(runId: string, handlers: SSEHandlers, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/spoofer/events/${runId}`)
    const cleanup = () => es.close()
    signal.addEventListener('abort', () => { cleanup(); reject(new Error('Annulé')) }, { once: true })

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        switch (ev.type) {
          case 'start':
            handlers.onStart?.(ev.total_variations ?? 0, ev.level ?? '')
            break
          case 'progress':
            handlers.onProgress?.(ev.current ?? 0, ev.total ?? 0)
            break
          case 'variation_done':
            handlers.onVariation?.({
              file: ev.file,
              variation: ev.variation,
              outputPath: ev.output_path,
              tiersApplied: ev.tiers_applied || [],
            })
            break
          case 'info':
            handlers.onInfo?.(ev.msg || '')
            break
          case 'stderr':
            handlers.onWarn?.(ev.msg || '')
            break
          case 'done':
            cleanup(); resolve()
            break
          case 'error':
            cleanup(); reject(new Error(ev.message || ev.error || 'Erreur Python'))
            break
        }
      } catch { /* ignore malformed */ }
    }
    es.onerror = () => { cleanup(); reject(new Error('SSE perdu (serveur redémarré ?)')) }
  })
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SpooferPage() {
  useSession()

  const [entries,  setEntries]  = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [error,    setError]    = useState('')

  const level: Level = 'aggressive'
  const [variations, setVariations] = useState(5)
  const [noMirror,   setNoMirror]   = useState(false)

  // idle → compressing → uploading → processing → done
  const [phase,        setPhase]        = useState<'idle' | 'compressing' | 'uploading' | 'processing' | 'done'>('idle')
  const [uploadedFiles, setUploadedFiles] = useState(0)
  const [uploadTotal,   setUploadTotal]   = useState(0)

  const [total,     setTotal]     = useState(0)
  const [completed, setCompleted] = useState(0)
  const [results,   setResults]   = useState<VariationResult[]>([])
  const [infos,     setInfos]     = useState<string[]>([])

  const [runId, setRunId] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fichiers ────────────────────────────────────────────────────────────────

  const isVideoFile = (f: File) =>
    f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name)

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
    setUploadTotal(0)
    setTotal(0)
    setCompleted(0)
    setResults([])
    setInfos([])
    setRunId('')
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
  // Architecture 2 phases (mirror carousel/metadata) :
  //   Phase 1 — upload chunké vers /api/spoofer/upload (mêmes runId)
  //   Phase 2 — POST /api/spoofer/start { runId, level, variations }
  //             → subprocess pipeline.spoofer, SSE via /api/spoofer/events/[runId]
  //   Téléchargement — GET /api/spoofer/download/[runId] (ZIP) une fois `done`

  const launch = async () => {
    if (entries.length === 0) { setError('Ajoute au moins un fichier.'); return }

    setError('')
    setPhase('compressing')
    setUploadedFiles(0)
    setUploadTotal(entries.length)
    setTotal(0)
    setCompleted(0)
    setResults([])
    setInfos([])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Phase 0 — compression locale (images uniquement, vidéos intactes)
      const compressedEntries = await Promise.all(
        entries.map(async (e) => (e.isVideo ? e : { ...e, file: await compressImage(e.file) }))
      )

      if (abort.signal.aborted) return

      // Phase 1 — upload par chunks séquentiels
      setPhase('uploading')
      const newRunId = `spoofer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      setRunId(newRunId)

      const chunks: FileEntry[][] = []
      for (let i = 0; i < compressedEntries.length; i += UPLOAD_CHUNK_SIZE) {
        chunks.push(compressedEntries.slice(i, i + UPLOAD_CHUNK_SIZE))
      }

      for (const chunk of chunks) {
        if (abort.signal.aborted) break

        let lastError: Error | null = null
        for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
          if (abort.signal.aborted) break
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
          try {
            const form = new FormData()
            form.append('runId', newRunId)
            chunk.forEach(e => form.append('files', e.file))
            const res  = await fetch('/api/spoofer/upload', { method: 'POST', body: form, signal: abort.signal })
            const data = await res.json()
            if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
            setUploadedFiles(prev => prev + data.savedCount)
            lastError = null
            break
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e))
            if (abort.signal.aborted) break
            console.warn(`Chunk upload attempt ${attempt + 1} failed:`, lastError.message)
          }
        }
        if (lastError && !abort.signal.aborted) throw lastError
      }

      if (abort.signal.aborted) return

      // Phase 2 — démarrer le subprocess Python
      setPhase('processing')

      const startRes  = await fetch('/api/spoofer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: newRunId, level, variations, noMirror }),
        signal: abort.signal,
      })
      const startData = await startRes.json()
      if (!startRes.ok || startData.error) throw new Error(startData.error || 'Erreur démarrage')

      await waitForRun(newRunId, {
        onStart: (t) => setTotal(t),
        onProgress: (current, t) => { setCompleted(current); if (t) setTotal(t) },
        onVariation: (r) => setResults(prev => [...prev, r]),
        onInfo: (msg) => setInfos(prev => [...prev, msg]),
        onWarn: (msg) => setInfos(prev => [...prev, `⚠️ ${msg}`]),
      }, abort.signal)

      if (abort.signal.aborted) return
      setPhase('done')

    } catch (e) {
      if (abort.signal.aborted) return
      setError(String(e instanceof Error ? e.message : e))
      setPhase('done')
    }
  }

  const download = () => {
    if (!runId) return
    window.location.href = `/api/spoofer/download/${runId}`
  }

  // ── Calculs UI ───────────────────────────────────────────────────────────────

  const imgCount   = entries.filter(e => !e.isVideo).length
  const videoCount = entries.filter(e =>  e.isVideo).length

  const uploadPct  = uploadTotal > 0 ? Math.round((uploadedFiles / uploadTotal) * 100) : 0
  const processPct = total > 0 ? Math.round((completed / total) * 100) : 0

  const isRunning = phase === 'compressing' || phase === 'uploading' || phase === 'processing'
  const isDone    = phase === 'done'
  const hasOutput = isDone && !error && results.length > 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

        <div>
          <h1 className="text-xl font-semibold text-white">🔀 Spoofer 2.0</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Génère plusieurs variations visuellement quasi-identiques de chaque image/vidéo,
            mais techniquement différentes — pour échapper à la détection de duplicatas Instagram.
          </p>
        </div>

        {/* ── Config (idle uniquement) ────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Nombre de variations */}
            <div className="bg-zinc-900/60 backdrop-blur-sm border border-white/[0.07] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Variations par fichier</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">Chaque fichier source génère N variantes uniques — jamais deux fois la même combinaison.</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={variations}
                  onChange={e => setVariations(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-20 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-center text-white text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              <label className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06] cursor-pointer">
                <div>
                  <p className="text-xs text-zinc-300">🪞 Effet miroir (flip horizontal)</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    Activé par défaut. Décoche si tes photos/vidéos contiennent du texte à l&apos;écran
                    — le miroir le rendrait inversé et illisible.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={!noMirror}
                  onChange={e => setNoMirror(!e.target.checked)}
                  className="w-4 h-4 accent-violet-500 shrink-0"
                />
              </label>
            </div>

            {/* Zone drag & drop */}
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-violet-400 bg-violet-900/20' : 'border-white/[0.08] hover:border-white/[0.20] bg-zinc-900/40'
              }`}
            >
              <div className="text-4xl mb-3">🔀</div>
              <p className="text-zinc-300 font-medium">Glisse tes photos &amp; vidéos ici</p>
              <p className="text-zinc-500 text-sm mt-1">JPG · PNG · WebP · MP4 · MOV · plusieurs fichiers possibles</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.mov,.m4v,.webm"
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
                    <span className="text-zinc-600 ml-2">
                      → {entries.length * variations} fichier{entries.length * variations > 1 ? 's' : ''} en sortie
                    </span>
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

            {/* Pourquoi Spoofer 2.0 */}
            <div className="bg-gradient-to-br from-violet-950/40 to-zinc-900/60 backdrop-blur-sm border border-violet-800/30 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-violet-300">🏆 Pourquoi Spoofer 2.0 est différent</p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                La plupart des outils de spoofing se contentent d&apos;un seul petit changement (un recadrage,
                un filtre de couleur...) — une protection que les systèmes de détection actuels repèrent
                en quelques secondes, surtout dès qu&apos;ils reconnaissent plusieurs fichiers comme des
                variantes d&apos;une même source.
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Spoofer 2.0 combine <strong className="text-zinc-300">plusieurs couches de transformation
                indépendantes</strong> — apparence générale, détails fins, couleurs et textures, et même la
                manière dont une intelligence artificielle &laquo; comprend &raquo; une image ou une vidéo —
                pour que chaque variation soit reconnue comme un fichier neuf et indépendant, sur tous
                les plans à la fois.
              </p>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Chaque variation reçoit sa propre combinaison unique de réglages : jamais la même recette
                appliquée deux fois, même sur 15-20 versions d&apos;un seul fichier. Les informations internes
                du fichier (date, appareil, position...) sont elles aussi régénérées de façon réaliste,
                comme si chaque fichier provenait d&apos;un téléphone différent — un détail que les outils
                basiques n&apos;abordent généralement pas.
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Résultat : quasi identique à l&apos;original pour toi et ton audience, mais unique aux yeux
                des systèmes de détection — y compris les plus récents.
              </p>
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
                : `Lancer le spoofer — ${entries.length} fichier${entries.length > 1 ? 's' : ''} × ${variations} variation${variations > 1 ? 's' : ''}`}
            </button>
          </>
        )}

        {/* ── Progression (running + done) ────────────────────────────────── */}
        {(isRunning || isDone) && (
          <div className="space-y-5">
            <div className="bg-zinc-900/60 backdrop-blur-sm border border-white/[0.07] rounded-xl p-5 space-y-5">

              {phase === 'compressing' && (
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>🗜 Compression des images… (traitement local, quelques secondes)</span>
                </div>
              )}

              {phase !== 'compressing' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-zinc-400">
                      {phase === 'uploading' ? '⬆️ Envoi vers le serveur…' : '⬆️ Fichiers reçus'}
                    </span>
                    <span className="text-xs text-zinc-500">{uploadedFiles}/{uploadTotal}</span>
                  </div>
                  <div className="bg-white/[0.05] rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${phase === 'uploading' ? 'bg-blue-500' : 'bg-blue-800'}`}
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {(phase === 'processing' || isDone) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-zinc-400">
                      {isDone && !error ? '✅ Terminé !' : phase === 'processing' ? `🔀 Génération des variations… (${level})` : '❌ Erreur'}
                    </span>
                    <span className="text-xs text-zinc-500">{completed}/{total || '…'}</span>
                  </div>
                  <div className="bg-white/[0.05] rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${processPct}%` }}
                    />
                  </div>
                </div>
              )}

              {infos.length > 0 && (
                <div className="space-y-1">
                  {infos.map((msg, i) => (
                    <p key={i} className="text-[10px] text-amber-400/80 bg-amber-900/10 border border-amber-800/30 rounded-lg px-2.5 py-1.5">ℹ️ {msg}</p>
                  ))}
                </div>
              )}

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
                <div className="flex gap-2">
                  {hasOutput && (
                    <button onClick={download} className="flex-1 bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-medium rounded-lg py-2.5 transition">
                      ⬇️ Télécharger le ZIP ({results.length} fichier{results.length > 1 ? 's' : ''})
                    </button>
                  )}
                  <button onClick={resetAll} className="flex-1 bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm rounded-lg py-2.5 transition">
                    + Nouveau batch
                  </button>
                </div>
              )}
            </div>

            {/* Résultats variation par variation */}
            {results.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-zinc-400 mb-2">
                  Variations générées ({results.length}{total ? `/${total}` : ''})
                </h3>
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className="bg-zinc-900/60 border border-white/[0.07] rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">🔀</span>
                        <span className="text-xs text-zinc-300 truncate">{r.file} <span className="text-zinc-600">→ v{r.variation}</span></span>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        {r.tiersApplied.map(t => (
                          <span key={t} className="text-[9px] text-violet-400 bg-violet-900/20 border border-violet-800/30 rounded px-1.5 py-0.5">
                            {TIER_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
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
