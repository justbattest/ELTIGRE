'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

type FileEntry = { file: File; preview: string }
type RefElement = { id: string; name: string; type?: string }

const UPLOAD_CHUNK_SIZE = 10

export default function BulkEditPage() {
  useSession()
  const router = useRouter()

  // ── Images ──
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)

  // ── Personnages ──
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)

  // ── Config ──
  const [prompt, setPrompt] = useState('')
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high')
  const [unlimitedMode, setUnlimitedMode] = useState(false)

  // ── State lancement ──
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'launching'>('idle')
  const [uploadedCount, setUploadedCount] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const abortRef = useRef<AbortController | null>(null)

  // ── Charger personnages soul_cinematic ──────────────────────────────────
  useEffect(() => {
    setLoadingChars(true)
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const all: RefElement[] = data.referenceElements || []
        setRefElements(all)
      })
      .catch(() => {})
      .finally(() => setLoadingChars(false))
  }, [])

  // ── Drag & drop ────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .forEach(f => {
        setEntries(prev => [...prev, { file: f, preview: URL.createObjectURL(f) }])
      })
  }, [])

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files)
  }
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files)
  }

  const removeEntry = (idx: number) => {
    setEntries(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  // ── Launch ─────────────────────────────────────────────────────────────
  const launch = async () => {
    if (!entries.length) return setError('Ajoute au moins une image.')
    if (!prompt.trim()) return setError('Saisis un prompt.')

    setError('')
    setSuccess('')
    setPhase('uploading')
    setUploadedCount(0)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Phase 1 — upload chunks en parallèle
      const runId = `metadata_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const chunks: FileEntry[][] = []
      for (let i = 0; i < entries.length; i += UPLOAD_CHUNK_SIZE) {
        chunks.push(entries.slice(i, i + UPLOAD_CHUNK_SIZE))
      }

      await Promise.all(chunks.map(async (chunk) => {
        if (abort.signal.aborted) return
        const form = new FormData()
        form.append('runId', runId)
        chunk.forEach(e => form.append('files', e.file))
        const res = await fetch('/api/metadata/upload', { method: 'POST', body: form, signal: abort.signal })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || `Upload error ${res.status}`)
        setUploadedCount(prev => prev + data.savedCount)
      }))

      if (abort.signal.aborted) return

      // Phase 2 — lancer le subprocess
      setPhase('launching')
      const res = await fetch('/api/bulk-edit/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadRunId: runId,
          prompt: prompt.trim(),
          elementId: selectedElementId,
          quality,
          concurrency: unlimitedMode ? 8 : 1,
        }),
        signal: abort.signal,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Erreur au lancement')
        setPhase('idle')
        return
      }

      setSuccess(`✓ ${data.imageCount} images envoyées en génération`)
      setTimeout(() => router.push('/en-cours'), 1500)

    } catch (e) {
      if (!abort.signal.aborted) {
        setError(String(e))
        setPhase('idle')
      }
    }
  }

  const stop = () => {
    abortRef.current?.abort()
    setPhase('idle')
  }

  const isRunning = phase !== 'idle'

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Nav ── */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-20">
        <div className="flex items-center gap-4">
          <span className="text-violet-400 font-bold text-lg">🐯 EL TIGRE FACTORY</span>
        </div>
        <div className="flex gap-3 items-center text-sm">
          <Link href="/kpi" className="text-gray-400 hover:text-white transition text-sm">📊 KPI</Link>
          <Link href="/settings" className="text-gray-400 hover:text-white transition text-sm">⚙️ Settings</Link>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex gap-0 -mb-px overflow-x-auto">
          <Link href="/" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🔄 Scraping</Link>
          <Link href="/studio" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">✨ Prompt Studio</Link>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🃏 Carousels</Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🎬 Vidéos</Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🎭 Motion Control</Link>
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500 whitespace-nowrap">🖼 Bulk Edit</div>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">⏳ En cours</Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">🧹 Metadata Opti</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        <div>
          <h1 className="text-xl font-bold">🖼 Bulk Edit — Seedream 4.5</h1>
          <p className="text-gray-400 text-sm mt-1">Glisse tes images, entre un prompt, et relance Seedream sur chaque photo d&apos;un coup.</p>
        </div>

        {/* ── Personnage (optionnel) ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wider">
            Personnage <span className="text-gray-600 font-normal normal-case">(optionnel — préfixe :::id::: dans le prompt)</span>
          </p>
          {loadingChars ? (
            <p className="text-xs text-gray-500">Chargement...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedElementId('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  !selectedElementId ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-violet-600'
                }`}
              >
                Aucun
              </button>
              {refElements.filter(e => !e.type || e.type === 'soul_cinematic').map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedElementId(selectedElementId === e.id ? '' : e.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selectedElementId === e.id ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Prompt ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-3">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Prompt (appliqué à toutes les images)</p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ex: Ultra-realistic, soft natural light, keep the identity, improve skin texture..."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition text-sm resize-none"
          />
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-gray-500">Qualité :</p>
            {(['low', 'medium', 'high'] as const).map(q => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  quality === q ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {q}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setUnlimitedMode(v => !v)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  unlimitedMode
                    ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600'
                }`}
              >
                <span>⚡ Unlimited</span>
                <span className={`w-7 h-4 rounded-full relative transition-colors ${unlimitedMode ? 'bg-yellow-500' : 'bg-gray-600'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${unlimitedMode ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </span>
              </button>
              {unlimitedMode && (
                <span className="text-xs text-yellow-400/70">8 simultanés · plan Unlimited requis</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Drop zone ── */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
            dragging ? 'border-violet-500 bg-violet-900/10' : 'border-gray-700 hover:border-gray-600'
          }`}
          onClick={() => document.getElementById('bulk-file-input')?.click()}
        >
          <input
            id="bulk-file-input"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={onFileInput}
          />
          <p className="text-gray-400 text-sm">
            {entries.length > 0
              ? `${entries.length} image${entries.length > 1 ? 's' : ''} sélectionnée${entries.length > 1 ? 's' : ''} — clique ou glisse pour en ajouter`
              : 'Glisse tes images ici ou clique pour sélectionner'}
          </p>
          <p className="text-gray-600 text-xs mt-1">JPG, PNG, WEBP</p>
        </div>

        {/* ── Grid aperçu ── */}
        {entries.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {entries.map((e, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeEntry(i)}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Progress upload ── */}
        {phase === 'uploading' && (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-300">⬆️ Envoi vers le serveur...</p>
              <p className="text-sm text-gray-400">{uploadedCount}/{entries.length}</p>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${entries.length ? (uploadedCount / entries.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'launching' && (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <p className="text-sm text-gray-300">🚀 Lancement du batch...</p>
          </div>
        )}

        {/* ── Erreur / succès ── */}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            {success}
            <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ En cours</a>
          </p>
        )}

        {/* ── Bouton ── */}
        <div className="flex gap-3">
          <button
            onClick={launch}
            disabled={isRunning || !entries.length || !prompt.trim()}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isRunning ? '⏳ En cours...' : `🖼 Lancer Seedream sur ${entries.length} image${entries.length !== 1 ? 's' : ''}`}
          </button>
          {isRunning && (
            <button
              onClick={stop}
              className="px-5 py-3 rounded-xl font-semibold text-white bg-red-700 hover:bg-red-600 transition"
            >
              Stop
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
