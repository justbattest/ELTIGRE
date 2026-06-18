'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type RunState = {
  id: string
  status: string
  totalPosts: number
  completedPosts: number
  failedPosts: number
  fallbackCount: number
  activeJobs: number
  soulCount: number
  seedreamCount: number
  nanoBananaCount: number
  generations: Array<{
    id: number
    sourceShortcode: string
    sourceRank: number
    sourceLikes: number
    generationStatus: string
    modelUsed: string
    fallbackUsed: boolean
    generatedImageUrl: string
    promptUsed: string | null
  }>
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-200 rounded-full h-2">
        <div
          className="bg-violet-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 w-10 text-right">{pct}%</span>
    </div>
  )
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

const MODEL_BADGE: Record<string, { label: string; cls: string }> = {
  soul_cinematic: { label: 'Soul', cls: 'bg-violet-600' },
  seedream_v4_5:  { label: 'Seedream', cls: 'bg-teal-600' },
  nano_banana_2:  { label: 'Nano', cls: 'bg-orange-600' },
}

export default function MonitoringPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [run, setRun] = useState<RunState | null>(null)
  const [stopping, setStopping] = useState(false)
  const [phase, setPhase] = useState<'scraping' | 'analyzing' | 'generating'>('scraping')
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  const stopRun = useCallback(async () => {
    if (!confirm('Stop this run?')) return
    setStopping(true)
    await fetch(`/api/run/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    })
    router.push('/')
  }, [id, router])

  useEffect(() => {
    const es = new EventSource(`/api/run/${id}/stream`)

    es.onmessage = (e) => {
      const data = JSON.parse(e.data) as RunState
      setRun(data)

      // Détecter la phase courante
      if (data.generations?.length === 0 && data.totalPosts === 0) {
        setPhase('scraping')
      } else if (data.completedPosts === 0 && data.totalPosts > 0) {
        setPhase('analyzing')
      } else {
        setPhase('generating')
      }

      if (data.status === 'completed' || data.status === 'failed') {
        es.close()
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [id])

  const statusColor = {
    running: 'text-amber-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
    paused: 'text-slate-400',
  }

  const statusLabel = {
    running: '⏳ In progress',
    completed: '✅ Completed',
    failed: '❌ Failed',
    paused: '⏸ Paused',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <nav className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-slate-500 hover:text-slate-900 transition text-sm">
          ← New Run
        </Link>
        <Link href="/kpi" className="text-slate-500 hover:text-slate-900 transition text-sm">
          📊 KPI →
        </Link>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {!run ? (
          <div className="text-center py-20 text-slate-400">⏳ Connecting to run...</div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Run #{id.substring(0, 8)}</h1>
                <span
                  className={`text-sm ${
                    statusColor[run.status as keyof typeof statusColor] || 'text-slate-400'
                  }`}
                >
                  {statusLabel[run.status as keyof typeof statusLabel] || run.status}
                </span>
              </div>
              {run.status === 'running' && (
                <button
                  onClick={stopRun}
                  disabled={stopping}
                  className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2 transition"
                >
                  {stopping ? '⏳' : '✋'} Stop
                </button>
              )}
              {run.status === 'completed' && (
                <Link
                  href="/kpi"
                  className="bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg px-4 py-2 transition"
                >
                  View results →
                </Link>
              )}
            </div>

            {/* Phases */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-sm">
              {/* Scraping */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span
                      className={
                        phase === 'scraping' && run.status === 'running'
                          ? 'text-amber-400'
                          : run.totalPosts > 0
                          ? 'text-green-400'
                          : 'text-slate-400'
                      }
                    >
                      ①
                    </span>
                    Scraping
                  </span>
                  <span className="text-xs text-slate-400">
                    {run.totalPosts > 0 ? `${run.totalPosts} posts` : '—'}
                  </span>
                </div>
                <ProgressBar value={run.totalPosts > 0 ? 1 : 0} total={1} />
              </div>

              {/* Analyse */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span
                      className={
                        phase === 'analyzing' && run.status === 'running'
                          ? 'text-amber-400'
                          : run.completedPosts > 0
                          ? 'text-green-400'
                          : 'text-slate-400'
                      }
                    >
                      ②
                    </span>
                    Claude Analysis
                  </span>
                  <span className="text-xs text-slate-400">
                    {run.totalPosts > 0
                      ? `${run.generations?.length || 0}/${run.totalPosts} prompts`
                      : '—'}
                  </span>
                </div>
                <ProgressBar
                  value={run.generations?.length || 0}
                  total={run.totalPosts}
                />
              </div>

              {/* Génération */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span
                      className={
                        phase === 'generating' && run.status === 'running'
                          ? 'text-amber-400'
                          : run.status === 'completed'
                          ? 'text-green-400'
                          : 'text-slate-400'
                      }
                    >
                      ③
                    </span>
                    Higgsfield Generation
                  </span>
                  <span className="text-xs text-slate-400">
                    {run.totalPosts > 0
                      ? `${run.completedPosts}/${run.totalPosts}`
                      : '—'}
                  </span>
                </div>
                <ProgressBar value={run.completedPosts} total={run.totalPosts} />
              </div>

              {/* Détails génération */}
              {run.totalPosts > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-400">
                    Active jobs: <span className="text-slate-900">{run.activeJobs}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Fallbacks: <span className="text-amber-400">{run.fallbackCount}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Soul Cinema: <span className="text-green-400">{run.soulCount} ✓</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Seedream: <span className="text-blue-400">{run.seedreamCount}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Failed: <span className="text-red-400">{run.failedPosts}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    Nano Banana: <span className="text-orange-400">{run.nanoBananaCount}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Résultats — images + prompts */}
            {run.generations?.filter((g) => g.generatedImageUrl).length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-slate-500 mb-3">
                  Results ({run.generations.filter((g) => g.generatedImageUrl).length} images)
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {run.generations
                    .filter((g) => g.generatedImageUrl)
                    .map((g) => {
                      const badge = MODEL_BADGE[g.modelUsed] ?? { label: g.modelUsed, cls: 'bg-gray-600' }
                      const isExpanded = expandedPrompt === g.id
                      const wasCopied = copied === g.id
                      return (
                        <div key={g.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                          {/* Image */}
                          <div className="relative aspect-[2/3]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={g.generatedImageUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            {/* Model badge */}
                            <div className="absolute top-2 right-2">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${badge.cls}`}>
                                {badge.label}
                                {g.fallbackUsed && ' ↩'}
                              </span>
                            </div>
                          </div>

                          {/* Prompt */}
                          {g.promptUsed ? (
                            <div className="p-3 space-y-2 border-t border-slate-200">
                              <p className={`text-xs text-slate-700 leading-relaxed ${isExpanded ? '' : 'line-clamp-4'}`}>
                                {g.promptUsed}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setExpandedPrompt(isExpanded ? null : g.id)}
                                  className="text-xs text-slate-400 hover:text-slate-600 transition"
                                >
                                  {isExpanded ? '▲' : '▼ tout voir'}
                                </button>
                                <button
                                  onClick={() => {
                                    copyToClipboard(g.promptUsed!)
                                    setCopied(g.id)
                                    setTimeout(() => setCopied(null), 2000)
                                  }}
                                  className={`ml-auto text-xs px-2 py-0.5 rounded transition font-medium ${
                                    wasCopied
                                      ? 'bg-green-50 text-green-700 border border-green-200'
                                      : 'bg-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-200 border border-slate-200'
                                  }`}
                                >
                                  {wasCopied ? '✓ Copied' : '📋 Copy'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="p-3 border-t border-slate-200">
                              <p className="text-xs text-slate-400 italic">Prompt not available</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
