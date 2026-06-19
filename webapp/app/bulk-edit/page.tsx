'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { compressImage } from '@/lib/compress-image'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

type FileEntry = { file: File; preview: string }
type RefElement = { id: string; name: string; type?: string }

const UPLOAD_CHUNK_SIZE = 10

export default function BulkEditPage() {
  useSession()
  const router = useRouter()

  // ── Images ──
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)

  // ── Personnages (pour dossier Drive uniquement) ──
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedCharName, setSelectedCharName] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)

  // ── Config ──
  const [prompt, setPrompt] = useState('')
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('high')

  // ── State lancement ──
  const [phase, setPhase] = useState<'idle' | 'compressing' | 'uploading' | 'launching'>('idle')
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
    if (!entries.length) return setError('Add at least one image.')
    if (!prompt.trim()) return setError('Enter a prompt.')

    setError('')
    setSuccess('')
    setPhase('compressing')
    setUploadedCount(0)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Phase 0 — compression locale (navigateur, ~2-5s)
      const compressedEntries = await Promise.all(
        entries.map(async (e) => ({ ...e, file: await compressImage(e.file) }))
      )

      if (abort.signal.aborted) return

      // Phase 1 — upload chunks en parallèle (safe après compression ~2MB/img)
      setPhase('uploading')
      const runId = `metadata_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const chunks: FileEntry[][] = []
      for (let i = 0; i < compressedEntries.length; i += UPLOAD_CHUNK_SIZE) {
        chunks.push(compressedEntries.slice(i, i + UPLOAD_CHUNK_SIZE))
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
          characterName: selectedCharName,
          quality,
        }),
        signal: abort.signal,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Launch error')
        setPhase('idle')
        return
      }

      setSuccess(`✓ ${data.imageCount} images sent for generation`)
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
    <div className="flex min-h-screen text-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-5">

        <div>
          <h1 className="text-xl font-bold">🖼 Bulk Edit — Seedream 4.5</h1>
          <p className="text-gray-700 text-sm mt-1">Drop your images, enter a prompt, and run Seedream on every photo at once.</p>
        </div>

        <TutorialVideo videoId="kA53iyKKKgM" title="Bulk Edit" />

        {/* ── Dossier Drive ── */}
        <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-5">
          <p className="text-xs text-gray-700 mb-1 font-medium uppercase tracking-wider">Drive Folder</p>
          <p className="text-xs text-gray-800 mb-3">Organizes results into the right Drive subfolder. No impact on generation.</p>
          {loadingChars ? (
            <p className="text-xs text-gray-800">Loading...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCharName('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  !selectedCharName ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-violet-500/50'
                }`}
              >
                None
              </button>
              {refElements.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedCharName(selectedCharName === e.name ? '' : e.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selectedCharName === e.name ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-900 hover:border-violet-500/50'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Prompt ── */}
        <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-5 space-y-3">
          <p className="text-xs text-gray-700 font-medium uppercase tracking-wider">Prompt (applied to all images)</p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ex: Ultra-realistic, soft natural light, keep the identity, improve skin texture..."
            rows={3}
            className="w-full bg-white/80 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition text-sm resize-none"
          />
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-800">Quality:</p>
            {(['low', 'medium', 'high'] as const).map(q => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  quality === q ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Drop zone ── */}
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-12 text-center transition cursor-pointer ${
            dragging ? 'border-violet-500 bg-violet-50' : 'border-gray-300 hover:border-slate-400 bg-white/60'
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
          <svg className="w-12 h-12 text-gray-800 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-gray-900 font-medium text-sm">
            {entries.length > 0
              ? `${entries.length} image${entries.length > 1 ? 's' : ''} selected — click or drag to add more`
              : 'Drop your images here or click to select'}
          </p>
          <p className="text-gray-800 text-xs mt-2">JPG · PNG · WEBP</p>
        </div>

        {/* ── Grid aperçu ── */}
        {entries.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
            {entries.map((e, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-white/80">
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

        {/* ── Compression locale ── */}
        {phase === 'compressing' && (
          <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-4 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-sm text-gray-900">🗜 Compressing images... (a few seconds)</p>
          </div>
        )}

        {/* ── Progress upload ── */}
        {phase === 'uploading' && (
          <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-900">⬆️ Uploading to server...</p>
              <p className="text-sm text-gray-700">{uploadedCount}/{entries.length}</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${entries.length ? (uploadedCount / entries.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {phase === 'launching' && (
          <div className="bg-white/75 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-4">
            <p className="text-sm text-gray-900">🚀 Launching batch...</p>
          </div>
        )}

        {/* ── Erreur / succès ── */}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-700 flex items-center gap-2">
            {success}
            <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ In progress</a>
          </p>
        )}

        {/* ── Bouton ── */}
        <div className="flex gap-3">
          <button
            onClick={launch}
            disabled={isRunning || !entries.length || !prompt.trim()}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
              In progress...
            </span>
          ) : `Run Seedream on ${entries.length} image${entries.length !== 1 ? 's' : ''}`}
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
      </PageWrapper>
      </main>
    </div>
  )
}
