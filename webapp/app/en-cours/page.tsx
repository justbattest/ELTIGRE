'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

// ─── Types ────────────────────────────────────────────────────────────────────

type RunMeta = {
  id: string
  status: string
  runType: 'video' | 'studio' | 'scraping' | 'bulk_edit'
  modelSetting: string | null
  totalPosts: number | null
  completedPosts: number | null
  failedPosts: number | null
  createdAt: string
}

type Generation = {
  id: number
  sourceShortcode: string
  sourceRank: number | null
  generationStatus: string
  modelUsed: string | null
  generatedImageUrl: string | null
  sceneDescription: string | null
  promptUsed: string | null
  fallbackReason: string | null
}

type SSEPayload = {
  id: string
  status: string
  totalPosts: number
  completedPosts: number
  failedPosts: number
  generations: Generation[]
}

// Run en mémoire (metadata, carousel ou spoofer)
type BatchRunInfo = {
  runId: string
  runType: 'metadata' | 'carousel' | 'spoofer'
  done: boolean
  total: number
  completed: number
  characterName?: string
  level?: string
  totalFiles?: number
  variations?: number
  startedAt: number
}

const SPOOFER_LEVEL_LABELS: Record<string, string> = {
  light: '🟢 Light',
  medium: '🟡 Medium',
  aggressive: '🔴 Aggressive',
}

// ─── Prompt Bank Button ────────────────────────────────────────────────────────

function BankButton({ gen }: { gen: Generation }) {
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState('')

  const save = async () => {
    setSaving(true)
    try {
      await fetch('/api/video/prompt-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: gen.id, notes }),
      })
      setSaved(true)
      setShowNotes(false)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (saved) return <span className="text-[10px] text-emerald-400">✅ Saved</span>

  return (
    <div>
      {showNotes ? (
        <div className="flex gap-1 mt-1">
          <input
            autoFocus
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 text-[10px] bg-white border border-gray-300 rounded px-1.5 py-0.5 text-gray-900 placeholder-slate-400 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded hover:bg-violet-500 disabled:opacity-50 transition"
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            onClick={() => setShowNotes(false)}
            className="text-[10px] text-gray-800 px-1"
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          className="text-[10px] text-violet-600 hover:text-violet-700 transition"
          title="Save this prompt to the bank to improve future generations"
        >
          ✨ Keep this prompt
        </button>
      )}
    </div>
  )
}

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ gen }: { gen: Generation }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const isComplete = gen.generationStatus === 'complete'
  const isFailed = gen.generationStatus === 'failed'
  const rankDisplay = gen.sourceRank !== null ? gen.sourceRank + 1 : gen.id
  const scene = gen.sceneDescription || `Video #${rankDisplay}`

  const promptFormatted = (() => {
    if (!gen.promptUsed) return null
    try { return JSON.stringify(JSON.parse(gen.promptUsed), null, 2) }
    catch { return gen.promptUsed }
  })()

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-xl group">
      <div className="relative bg-white/80 aspect-[9/16]">
        {isComplete && gen.generatedImageUrl ? (
          <>
            <video
              ref={videoRef}
              src={gen.generatedImageUrl}
              autoPlay loop muted playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-end justify-center pb-3">
              <a
                href={gen.generatedImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs px-3 py-1.5 rounded-full hover:bg-white/20"
              >
                ↗ Open
              </a>
            </div>
          </>
        ) : isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
            <span className="text-3xl">❌</span>
            <span className="text-xs text-gray-800">Failed</span>
            {gen.fallbackReason && (
              <span className="text-[10px] text-red-600 text-center leading-tight">{gen.fallbackReason}</span>
            )}
          </div>
        ) : (
          <div className="w-full h-full relative flex flex-col items-center justify-center gap-3">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-violet-50 to-slate-100" />
            <div className="relative w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="relative text-xs text-gray-800">
              {gen.generationStatus === 'processing' ? 'Generating…' : 'Waiting…'}
            </span>
          </div>
        )}
        <div className="absolute top-2 left-2 bg-white/80 backdrop-blur-sm text-[10px] text-gray-900 px-1.5 py-0.5 rounded-md border border-gray-200">
          #{rankDisplay}
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-xs font-medium text-gray-900 truncate">{scene}</p>
        <p className="text-[10px] text-gray-800">{gen.modelUsed || 'seedance_2_0'}</p>
        {isComplete && promptFormatted && (
          <div>
            <button
              onClick={() => setShowPrompt(p => !p)}
              className="text-[10px] text-gray-800 hover:text-gray-800 transition"
            >
              {showPrompt ? '▲ Hide' : '👁 Prompt'}
            </button>
            {showPrompt && (
              <pre className="mt-1.5 text-[9px] text-gray-900 bg-white/80 border border-gray-200 rounded-lg p-2 overflow-auto max-h-40 whitespace-pre-wrap leading-relaxed">
                {promptFormatted}
              </pre>
            )}
          </div>
        )}
        {isComplete && gen.promptUsed && <BankButton gen={gen} />}
      </div>
    </div>
  )
}

// ─── Image Card (studio/scraping) ─────────────────────────────────────────────

function ImageCard({ gen }: { gen: Generation }) {
  const isComplete = gen.generationStatus === 'complete'
  const isFailed = gen.generationStatus === 'failed'
  const rankDisplay = gen.sourceRank !== null ? gen.sourceRank + 1 : gen.id

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-xl group">
      <div className="relative bg-white/80 aspect-square">
        {isComplete && gen.generatedImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gen.generatedImageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-end justify-center pb-3">
              <a
                href={gen.generatedImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-all duration-200 bg-white/10 backdrop-blur-sm border border-white/20 text-white text-xs px-3 py-1.5 rounded-full hover:bg-white/20"
              >
                ↗ Open
              </a>
            </div>
          </>
        ) : isFailed ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl">❌</span>
          </div>
        ) : (
          <div className="w-full h-full relative flex items-center justify-center">
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-violet-50 to-slate-100" />
            <div className="relative w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute top-2 left-2 bg-white/80 backdrop-blur-sm text-[10px] text-gray-900 px-1.5 py-0.5 rounded-md border border-gray-200">
          #{rankDisplay}
        </div>
      </div>
      <div className="p-2">
        <p className="text-[10px] text-gray-800">{gen.modelUsed || '—'} · #{rankDisplay}</p>
      </div>
    </div>
  )
}

// ─── Run Card (DB-backed — video / studio / scraping) ─────────────────────────

function RunCard({ run }: { run: RunMeta }) {
  const [data, setData] = useState<SSEPayload | null>(null)
  const [done, setDone] = useState(run.status !== 'running' && run.status !== 'queued')
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    if (!confirm('Stop this run? Generations in progress will be lost.')) return
    setStopping(true)
    try {
      await fetch(`/api/run/${run.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      setDone(true)
    } catch { /* ignore */ } finally {
      setStopping(false)
    }
  }

  // Reconnect SSE si le run est encore actif
  useEffect(() => {
    if (done) return
    // Pas de SSE pour les runs en attente — on attend qu'ils passent à 'running' via le polling
    if ((data?.status ?? run.status) === 'queued') return
    const es = new EventSource(`/api/run/${run.id}/stream`)
    es.onmessage = (e) => {
      try {
        const payload: SSEPayload = JSON.parse(e.data)
        setData(payload)
        if (payload.status === 'completed' || payload.status === 'failed') {
          setDone(true)
          es.close()
        }
      } catch { /* ignore */ }
    }
    es.onerror = () => es.close()
    return () => es.close()
  }, [run.id, done, data?.status, run.status])

  const gens = data?.generations ?? []
  const total = data?.totalPosts ?? run.totalPosts ?? 0
  const completed = data?.completedPosts ?? run.completedPosts ?? 0
  const failed = data?.failedPosts ?? run.failedPosts ?? 0
  const status = data?.status ?? run.status
  const isRunning = status === 'running'
  const isQueued = status === 'queued'

  const isMotionControl = run.modelSetting === 'kling_motion_control'
  const typeIcon = run.runType === 'video' ? (isMotionControl ? '🎭' : '🎬') : run.runType === 'bulk_edit' ? '🖼' : run.runType === 'studio' ? '✨' : '🔄'
  const typeLabel = run.runType === 'video' ? (isMotionControl ? 'Motion Control' : 'Videos') : run.runType === 'bulk_edit' ? 'Bulk Edit' : run.runType === 'studio' ? 'Prompt Studio' : 'Scraping'
  const gridCols = run.runType === 'video'
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
    : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'

  const createdAt = new Date(run.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`relative rounded-2xl overflow-hidden ${(isRunning || isQueued) ? 'p-[1px] bg-gradient-to-br from-violet-500/30 via-transparent to-cyan-500/20' : 'border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)]'}`}>
      <div className={`rounded-[inherit] ${(isRunning || isQueued) ? 'bg-white/75 backdrop-blur-xl' : 'bg-white/75 backdrop-blur-xl'} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{typeIcon}</span>
          <span className="font-semibold text-gray-900 text-sm">{typeLabel}</span>
          <span className="text-xs text-gray-800">· {createdAt}</span>
        </div>
        <div className="flex items-center gap-2">
          {isQueued && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-full">
                Pending
              </span>
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-xs px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition disabled:opacity-50"
              >
                {stopping ? (
                  <svg className="w-3 h-3 animate-spin inline" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                ) : 'Cancel'}
              </button>
            </div>
          )}
          {isRunning && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-violet-700 bg-violet-100 border border-violet-300 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                In progress
              </span>
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-xs px-2 py-0.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition disabled:opacity-50"
              >
                {stopping ? (
                  <svg className="w-3 h-3 animate-spin inline" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                ) : '⏹ Stop'}
              </button>
            </div>
          )}
          {status === 'completed' && (
            <span className="text-[11px] font-medium text-green-700 bg-green-100 border border-green-300 px-2.5 py-1 rounded-full">
              Done
            </span>
          )}
          {status === 'failed' && (
            <span className="text-[11px] font-medium text-red-700 bg-red-100 border border-red-300 px-2.5 py-1 rounded-full">
              Failed
            </span>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-700">
          <span>
            {completed} / {total} · {failed > 0 ? `${failed} failure${failed > 1 ? 's' : ''}` : ''}
          </span>
          <span>{Math.round((completed / Math.max(total, 1)) * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              status === 'failed' ? 'bg-red-500' : 'bg-gradient-to-r from-violet-500 to-cyan-400'
            }`}
            style={{ width: `${(completed / Math.max(total, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Grid de cartes */}
      {gens.length > 0 && (
        <div className={`grid ${gridCols} gap-3`}>
          {gens.map(g =>
            run.runType === 'video'
              ? <VideoCard key={g.id} gen={g} />
              : <ImageCard key={g.id} gen={g} />
          )}
        </div>
      )}

      {/* Placeholders si aucune génération en DB */}
      {gens.length === 0 && isQueued && (
        <div className="flex items-center gap-3 text-sm text-gray-800">
          <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-500 rounded-full animate-spin" />
          Waiting for an available slot…
        </div>
      )}
      {gens.length === 0 && isRunning && (
        <div className="flex items-center gap-3 text-sm text-gray-800">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-slate-500 rounded-full animate-spin" />
          Preparing generations…
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Batch Run Card (en mémoire — metadata / carousel) ────────────────────────

function BatchRunCard({ run }: { run: BatchRunInfo }) {
  const [total, setTotal]       = useState(run.total)
  const [completed, setCompleted] = useState(run.completed)
  const [isDone, setIsDone]     = useState(run.done)
  const [hasError, setHasError] = useState(false)

  // Reconnexion SSE si le run est encore actif.
  // Les endpoints SSE bufférisent TOUS les events depuis le début (sentIndex = 0 à chaque
  // connexion), donc on récupère l'état complet même en arrivant en cours de route.
  useEffect(() => {
    if (isDone) return

    const sseUrl = run.runType === 'metadata'
      ? `/api/metadata/events/${run.runId}`
      : run.runType === 'carousel'
      ? `/api/carousel/events/${run.runId}`
      : `/api/spoofer/events/${run.runId}`

    const es = new EventSource(sseUrl)

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)

        if (run.runType === 'metadata') {
          if (ev.type === 'batch_start') setTotal(ev.total)
          if (ev.type === 'file')        { setCompleted(ev.n); if (!ev.total) return; setTotal(ev.total) }
          if (ev.type === 'done')        { setTotal(ev.total); setCompleted(ev.total); setIsDone(true); es.close() }
          if (ev.type === 'error')       { setHasError(true); setIsDone(true); es.close() }
        } else if (run.runType === 'carousel') {
          if (ev.type === 'carousel_start') setTotal(ev.total)
          if (ev.type === 'carousel')       { setCompleted(ev.n); if (ev.total) setTotal(ev.total) }
          if (ev.type === 'done')           { setTotal(ev.total); setCompleted(ev.total); setIsDone(true); es.close() }
          if (ev.type === 'error')          { setHasError(true); setIsDone(true); es.close() }
        } else {
          // spoofer
          if (ev.type === 'start')    setTotal(ev.total_variations ?? 0)
          if (ev.type === 'progress') { setCompleted(ev.current ?? 0); if (ev.total) setTotal(ev.total) }
          if (ev.type === 'done')     { setTotal(ev.total_outputs ?? 0); setCompleted(ev.total_outputs ?? 0); setIsDone(true); es.close() }
          if (ev.type === 'error')    { setHasError(true); setIsDone(true); es.close() }
        }
      } catch { /* ignore */ }
    }

    es.onerror = () => es.close()
    return () => es.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.runId, run.runType, isDone])

  const pct      = total > 0 ? Math.round((completed / total) * 100) : 0
  const timeStr  = run.startedAt
    ? new Date(run.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : ''

  const icon  = run.runType === 'metadata' ? '🧹' : run.runType === 'carousel' ? '🃏' : '🔀'
  const label = run.runType === 'metadata' ? 'Metadata Opti' : run.runType === 'carousel' ? 'Carousels' : 'Spoofer'
  const barColor  = run.runType === 'metadata' ? 'bg-cyan-500'   : run.runType === 'carousel' ? 'bg-violet-500'   : 'bg-fuchsia-500'
  const dotColor  = run.runType === 'metadata' ? 'bg-cyan-400'   : run.runType === 'carousel' ? 'bg-violet-400'   : 'bg-fuchsia-400'
  const textColor = run.runType === 'metadata' ? 'text-cyan-400' : run.runType === 'carousel' ? 'text-violet-400' : 'text-fuchsia-400'

  const subLabel = run.runType === 'spoofer'
    ? [
        run.totalFiles ? `${run.totalFiles} file${run.totalFiles > 1 ? 's' : ''}` : null,
        run.level ? (SPOOFER_LEVEL_LABELS[run.level] || run.level) : null,
      ].filter(Boolean).join(' · ')
    : run.characterName

  return (
    <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span>{icon}</span>
          <span className="font-semibold text-gray-900 text-sm">{label}</span>
          {subLabel && (
            <span className="text-xs text-gray-800 truncate">· {subLabel}</span>
          )}
          {timeStr && (
            <span className="text-xs text-gray-800 shrink-0">· {timeStr}</span>
          )}
        </div>
        <div className="shrink-0 ml-2">
          {hasError ? (
            <span className="text-xs text-red-400">❌ Error</span>
          ) : isDone ? (
            <span className="text-xs text-emerald-400">✅ Done</span>
          ) : (
            <span className={`flex items-center gap-1 text-xs ${textColor}`}>
              <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
              Running
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-700">
          <span>{completed} / {total || '?'} files</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${hasError ? 'bg-red-500' : barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {run.runType === 'spoofer' && isDone && !hasError && (
        <a
          href={`/api/spoofer/download/${run.runId}`}
          className="inline-flex items-center gap-1.5 text-xs bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white font-medium rounded-lg px-3 py-1.5 transition"
        >
          ⬇️ Download ZIP
        </a>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EnCoursPage() {
  const [runs,      setRuns]      = useState<RunMeta[]>([])
  const [batchRuns, setBatchRuns] = useState<BatchRunInfo[]>([])
  const [loading,   setLoading]   = useState(true)

  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    try {
      const [runsRes, metaRes, carouselRes, spooferRes] = await Promise.all([
        fetch('/api/runs?status=recent'),
        fetch('/api/metadata/runs'),
        fetch('/api/carousel/runs'),
        fetch('/api/spoofer/runs'),
      ])
      const runsData     = await runsRes.json()
      const metaData     = await metaRes.json()
      const carouselData = await carouselRes.json()
      const spooferData  = await spooferRes.json()

      setRuns(runsData.runs || [])

      // Fusionner metadata + carousel + spoofer, trier par date desc
      const combined: BatchRunInfo[] = [
        ...(metaData.runs     || []).map((r: BatchRunInfo) => ({ ...r, runType: 'metadata'  as const })),
        ...(carouselData.runs || []).map((r: BatchRunInfo) => ({ ...r, runType: 'carousel' as const })),
        ...(spooferData.runs  || []).map((r: BatchRunInfo) => ({ ...r, runType: 'spoofer'  as const })),
      ].sort((a, b) => b.startedAt - a.startedAt)

      setBatchRuns(combined)
    } catch { /* ignore */ }
    setLoading(false)
  }

  // Polling queue — déclenche le démarrage des runs en attente
  const queuePollInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    load()
    refreshInterval.current = setInterval(load, 10_000)

    // Vérifie la queue toutes les 20s — démarre les runs queued si slot libre + heal zombies
    const pollQueue = () => fetch('/api/queue/check').catch(() => {})
    pollQueue() // check immédiat au montage
    queuePollInterval.current = setInterval(pollQueue, 20_000)

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current)
      if (queuePollInterval.current) clearInterval(queuePollInterval.current)
    }
  }, [])

  const activeRuns  = runs.filter(r => r.status === 'running' || r.status === 'queued')
  const recentRuns  = runs.filter(r => r.status !== 'running' && r.status !== 'queued')
  const activeBatch = batchRuns.filter(r => !r.done)
  const doneBatch   = batchRuns.filter(r =>  r.done)

  return (
    <div className="flex min-h-screen text-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <TutorialVideo videoId="ihQJvJnV3cY" title="Results" />
        {loading && (
          <div className="flex items-center gap-3 text-gray-800">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-violet-500 rounded-full animate-spin" />
            Loading...
          </div>
        )}

        {!loading && runs.length === 0 && batchRuns.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <p className="text-gray-800 text-lg">No recent generations.</p>
            <div className="flex justify-center gap-4">
              <Link href="/video" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition">
                🎬 Generate videos
              </Link>
              <Link href="/studio" className="px-4 py-2 bg-white/80 hover:bg-gray-200 text-gray-900 rounded-lg text-sm font-medium transition">
                ✨ Prompt Studio
              </Link>
            </div>
          </div>
        )}

        {/* Batch actifs (metadata + carousel en mémoire) */}
        {activeBatch.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-800 uppercase tracking-wider">Active processes</h2>
            {activeBatch.map(r => <BatchRunCard key={r.runId} run={r} />)}
          </div>
        )}

        {/* Runs actifs DB (vidéos / studio / scraping) */}
        {activeRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-800 uppercase tracking-wider">Active</h2>
            {activeRuns.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        )}

        {/* Batch terminés récents */}
        {doneBatch.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-800 uppercase tracking-wider">Recent processes</h2>
            {doneBatch.map(r => <BatchRunCard key={r.runId} run={r} />)}
          </div>
        )}

        {/* Runs récents terminés DB */}
        {recentRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-800 uppercase tracking-wider">Recent (2h)</h2>
            {recentRuns.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        )}
      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
