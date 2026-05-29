'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type RunMeta = {
  id: string
  status: string
  runType: 'video' | 'studio' | 'scraping'
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

// Run en mémoire (metadata ou carousel)
type BatchRunInfo = {
  runId: string
  runType: 'metadata' | 'carousel'
  done: boolean
  total: number
  completed: number
  characterName: string
  startedAt: number
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

  if (saved) return <span className="text-[10px] text-emerald-400">✅ Sauvegardé</span>

  return (
    <div>
      {showNotes ? (
        <div className="flex gap-1 mt-1">
          <input
            autoFocus
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note (optionnel)"
            className="flex-1 text-[10px] bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-white placeholder-gray-600 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-[10px] bg-violet-600 text-white px-2 py-0.5 rounded hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            onClick={() => setShowNotes(false)}
            className="text-[10px] text-gray-500 px-1"
          >✕</button>
        </div>
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          className="text-[10px] text-violet-400 hover:text-violet-300 transition"
          title="Sauvegarder ce prompt dans la banque pour améliorer les futures générations"
        >
          ✨ Garder ce prompt
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
  const scene = gen.sceneDescription || `Vidéo #${rankDisplay}`

  // Formater le prompt JSON pour l'affichage
  const promptFormatted = (() => {
    if (!gen.promptUsed) return null
    try { return JSON.stringify(JSON.parse(gen.promptUsed), null, 2) }
    catch { return gen.promptUsed }
  })()

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
      <div className="relative bg-gray-950 aspect-[9/16]">
        {isComplete && gen.generatedImageUrl ? (
          <video
            ref={videoRef}
            src={gen.generatedImageUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : isFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
            <span className="text-3xl">❌</span>
            <span className="text-xs text-gray-500">Échec</span>
            {gen.fallbackReason && (
              <span className="text-[10px] text-red-400 text-center leading-tight">
                {gen.fallbackReason}
              </span>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-500">
              {gen.generationStatus === 'processing' ? 'Génération...' : 'En attente...'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-xs font-medium text-white truncate">{scene}</p>
        <p className="text-[10px] text-gray-500">{gen.modelUsed || 'kling_motion_control'} · #{rankDisplay}</p>
        {isComplete && gen.generatedImageUrl && (
          <a
            href={gen.generatedImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-violet-400 hover:text-violet-300 transition"
          >
            ↗ Ouvrir
          </a>
        )}
        {isComplete && promptFormatted && (
          <div>
            <button
              onClick={() => setShowPrompt(p => !p)}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition"
            >
              {showPrompt ? '▲ Masquer prompt' : '👁 Voir prompt'}
            </button>
            {showPrompt && (
              <pre className="mt-1.5 text-[9px] text-gray-400 bg-gray-950 border border-gray-800 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap leading-relaxed">
                {promptFormatted}
              </pre>
            )}
          </div>
        )}
        {isComplete && gen.promptUsed && (
          <BankButton gen={gen} />
        )}
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
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
      <div className="relative bg-gray-950 aspect-square">
        {isComplete && gen.generatedImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={gen.generatedImageUrl} alt="" className="w-full h-full object-cover" />
        ) : isFailed ? (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl">❌</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      <div className="p-2">
        <p className="text-[10px] text-gray-500">{gen.modelUsed || '—'} · #{rankDisplay}</p>
      </div>
    </div>
  )
}

// ─── Run Card (DB-backed — video / studio / scraping) ─────────────────────────

function RunCard({ run }: { run: RunMeta }) {
  const [data, setData] = useState<SSEPayload | null>(null)
  const [done, setDone] = useState(run.status !== 'running')
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    if (!confirm('Arrêter ce run ? Les générations en cours seront perdues.')) return
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
  }, [run.id, done])

  const gens = data?.generations ?? []
  const total = data?.totalPosts ?? run.totalPosts ?? 0
  const completed = data?.completedPosts ?? run.completedPosts ?? 0
  const failed = data?.failedPosts ?? run.failedPosts ?? 0
  const status = data?.status ?? run.status
  const isRunning = status === 'running'

  const isMotionControl = run.modelSetting === 'kling_motion_control'
  const typeIcon = run.runType === 'video' ? (isMotionControl ? '🎭' : '🎬') : run.runType === 'studio' ? '✨' : '🔄'
  const typeLabel = run.runType === 'video' ? (isMotionControl ? 'Motion Control' : 'Vidéos') : run.runType === 'studio' ? 'Prompt Studio' : 'Scraping'
  const gridCols = run.runType === 'video'
    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
    : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6'

  const createdAt = new Date(run.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{typeIcon}</span>
          <span className="font-semibold text-white text-sm">{typeLabel}</span>
          <span className="text-xs text-gray-500">· {createdAt}</span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-violet-400">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                En cours
              </span>
              <button
                onClick={handleStop}
                disabled={stopping}
                className="text-xs px-2 py-0.5 rounded-md bg-red-900/40 hover:bg-red-800/60 text-red-400 border border-red-800/50 transition disabled:opacity-50"
              >
                {stopping ? '⏳' : '⏹ Stop'}
              </button>
            </div>
          )}
          {status === 'completed' && (
            <span className="text-xs text-emerald-400">✅ Terminé</span>
          )}
          {status === 'failed' && (
            <span className="text-xs text-red-400">❌ Échec</span>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>
            {completed} / {total} · {failed > 0 ? `${failed} échec${failed > 1 ? 's' : ''}` : ''}
          </span>
          <span>{Math.round((completed / Math.max(total, 1)) * 100)}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === 'failed' ? 'bg-red-500' : 'bg-violet-500'
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
      {gens.length === 0 && isRunning && (
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          Préparation des générations…
        </div>
      )}
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
      : `/api/carousel/events/${run.runId}`

    const es = new EventSource(sseUrl)

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)

        if (run.runType === 'metadata') {
          if (ev.type === 'batch_start') setTotal(ev.total)
          if (ev.type === 'file')        { setCompleted(ev.n); if (!ev.total) return; setTotal(ev.total) }
          if (ev.type === 'done')        { setTotal(ev.total); setCompleted(ev.total); setIsDone(true); es.close() }
          if (ev.type === 'error')       { setHasError(true); setIsDone(true); es.close() }
        } else {
          if (ev.type === 'carousel_start') setTotal(ev.total)
          if (ev.type === 'carousel')       { setCompleted(ev.n); if (ev.total) setTotal(ev.total) }
          if (ev.type === 'done')           { setTotal(ev.total); setCompleted(ev.total); setIsDone(true); es.close() }
          if (ev.type === 'error')          { setHasError(true); setIsDone(true); es.close() }
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

  const icon  = run.runType === 'metadata' ? '🧹' : '🃏'
  const label = run.runType === 'metadata' ? 'Metadata Opti' : 'Carousels'
  const barColor = run.runType === 'metadata' ? 'bg-cyan-500' : 'bg-violet-500'
  const dotColor = run.runType === 'metadata' ? 'bg-cyan-400' : 'bg-violet-400'
  const textColor = run.runType === 'metadata' ? 'text-cyan-400' : 'text-violet-400'

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span>{icon}</span>
          <span className="font-semibold text-white text-sm">{label}</span>
          {run.characterName && (
            <span className="text-xs text-gray-500 truncate">· {run.characterName}</span>
          )}
          {timeStr && (
            <span className="text-xs text-gray-500 shrink-0">· {timeStr}</span>
          )}
        </div>
        <div className="shrink-0 ml-2">
          {hasError ? (
            <span className="text-xs text-red-400">❌ Erreur</span>
          ) : isDone ? (
            <span className="text-xs text-emerald-400">✅ Terminé</span>
          ) : (
            <span className={`flex items-center gap-1 text-xs ${textColor}`}>
              <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
              En cours
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-400">
          <span>{completed} / {total || '?'} fichiers</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${hasError ? 'bg-red-500' : barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
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
      const [runsRes, metaRes, carouselRes] = await Promise.all([
        fetch('/api/runs?status=recent'),
        fetch('/api/metadata/runs'),
        fetch('/api/carousel/runs'),
      ])
      const runsData     = await runsRes.json()
      const metaData     = await metaRes.json()
      const carouselData = await carouselRes.json()

      setRuns(runsData.runs || [])

      // Fusionner metadata + carousel, trier par date desc
      const combined: BatchRunInfo[] = [
        ...(metaData.runs     || []).map((r: BatchRunInfo) => ({ ...r, runType: 'metadata'  as const })),
        ...(carouselData.runs || []).map((r: BatchRunInfo) => ({ ...r, runType: 'carousel' as const })),
      ].sort((a, b) => b.startedAt - a.startedAt)

      setBatchRuns(combined)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Recheck toutes les 10s pour capter les nouveaux runs lancés depuis d'autres onglets
    refreshInterval.current = setInterval(load, 10_000)
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current)
    }
  }, [])

  const activeRuns  = runs.filter(r => r.status === 'running')
  const recentRuns  = runs.filter(r => r.status !== 'running')
  const activeBatch = batchRuns.filter(r => !r.done)
  const doneBatch   = batchRuns.filter(r =>  r.done)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-20">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐯</span>
          <span className="font-semibold text-white">EL TIGRE FACTORY</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/kpi" className="text-gray-400 hover:text-white transition text-sm">📊 KPI</Link>
          <Link href="/settings" className="text-gray-400 hover:text-white transition text-sm">⚙️ Settings</Link>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6 bg-gray-950 sticky top-[57px] z-10">
        <div className="flex gap-0 -mb-px">
          <Link href="/" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🔄 Scraping
          </Link>
          <Link href="/studio" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            ✨ Prompt Studio
          </Link>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🃏 Carousels
          </Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🎬 Vidéos
          </Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🎭 Motion Control
          </Link>
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500 flex items-center gap-2">
            ⏳ En cours
            {(activeRuns.length + activeBatch.length) > 0 && (
              <span className="bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeRuns.length + activeBatch.length}
              </span>
            )}
          </div>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🧹 Metadata Opti
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {loading && (
          <div className="flex items-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-gray-600 border-t-violet-500 rounded-full animate-spin" />
            Chargement...
          </div>
        )}

        {!loading && runs.length === 0 && batchRuns.length === 0 && (
          <div className="text-center py-20 space-y-4">
            <p className="text-gray-500 text-lg">Aucune génération récente.</p>
            <div className="flex justify-center gap-4">
              <Link href="/video" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition">
                🎬 Générer des vidéos
              </Link>
              <Link href="/studio" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition">
                ✨ Prompt Studio
              </Link>
            </div>
          </div>
        )}

        {/* Batch actifs (metadata + carousel en mémoire) */}
        {activeBatch.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Traitements actifs</h2>
            {activeBatch.map(r => <BatchRunCard key={r.runId} run={r} />)}
          </div>
        )}

        {/* Runs actifs DB (vidéos / studio / scraping) */}
        {activeRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Actifs</h2>
            {activeRuns.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        )}

        {/* Batch terminés récents */}
        {doneBatch.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Traitements récents</h2>
            {doneBatch.map(r => <BatchRunCard key={r.runId} run={r} />)}
          </div>
        )}

        {/* Runs récents terminés DB */}
        {recentRuns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Récents (2h)</h2>
            {recentRuns.map(r => <RunCard key={r.id} run={r} />)}
          </div>
        )}
      </div>
    </div>
  )
}
