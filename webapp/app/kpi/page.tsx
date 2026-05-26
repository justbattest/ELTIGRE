'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

type Generation = {
  id: number
  sourceShortcode: string
  sourcePostUrl: string
  sourceLikes: number
  sourceComments: number
  sourceCaption: string
  sourceRank: number
  slideIndex: number
  localImagePath: string | null
  sceneDescription: string
  promptUsed: string
  modelUsed: string
  fallbackUsed: boolean
  generatedImageUrl: string
  generatedAt: string
}

type Run = {
  id: string
  status: string
  createdAt: string
  completedPosts: number
  failedPosts: number
  fallbackCount: number
  inputProfiles: string
}

type Summary = {
  total: number
  completed: number
  failed: number
  soulCinema: number
  seedream: number
  nanoBanana: number
  fallbacks: number
}

type KPIData = {
  runs: Run[]
  selectedRunId: string
  generations: Generation[]
  summary: Summary | null
}

const MODEL_BADGE: Record<string, { label: string; color: string }> = {
  soul_cinematic: { label: 'Soul Cinema', color: 'bg-violet-900 text-violet-300' },
  seedream_v4_5: { label: 'Seedream', color: 'bg-blue-900 text-blue-300' },
  nano_banana_2: { label: 'Nano Banana', color: 'bg-orange-900 text-orange-300' },
}

function BankButton({ genId }: { genId: number }) {
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
        body: JSON.stringify({ generationId: genId, notes }),
      })
      setSaved(true)
      setShowNotes(false)
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (saved) return <span className="text-xs text-emerald-400">✅ Sauvegardé dans la banque</span>

  return (
    <div className="mt-2">
      {showNotes ? (
        <div className="flex gap-1">
          <input
            autoFocus
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Note optionnelle"
            className="flex-1 text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white placeholder-gray-600 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && save()}
          />
          <button
            onClick={save}
            disabled={saving}
            className="text-xs bg-violet-600 text-white px-2 py-1 rounded hover:bg-violet-500 disabled:opacity-50"
          >
            {saving ? '…' : '✓'}
          </button>
          <button onClick={() => setShowNotes(false)} className="text-xs text-gray-500 px-1">✕</button>
        </div>
      ) : (
        <button
          onClick={() => setShowNotes(true)}
          className="text-xs text-violet-400 hover:text-violet-300 transition"
        >
          ✨ Garder ce prompt
        </button>
      )}
    </div>
  )
}

function SourceImage({ gen }: { gen: Generation }) {
  const [err, setErr] = useState(false)

  // Priorité : image locale (servie par API) > lien Instagram
  const localSrc = gen.localImagePath
    ? `/api/image?path=${encodeURIComponent(gen.localImagePath)}`
    : null

  if (err || !localSrc) {
    return (
      <a href={gen.sourcePostUrl} target="_blank" rel="noopener noreferrer">
        <div className="w-24 h-32 bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-700 transition cursor-pointer">
          <span className="text-xl">📸</span>
          <span className="text-xs">Source ↗</span>
        </div>
      </a>
    )
  }

  return (
    <a href={gen.sourcePostUrl} target="_blank" rel="noopener noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={localSrc}
        alt="source"
        className="w-24 h-32 object-cover rounded-lg hover:opacity-80 transition"
        onError={() => setErr(true)}
      />
    </a>
  )
}

export default function KPIPage() {
  const [data, setData] = useState<KPIData | null>(null)
  const [selectedRunId, setSelectedRunId] = useState('')
  const [sortBy, setSortBy] = useState('likes')
  const [filterModel, setFilterModel] = useState('all')
  const [loading, setLoading] = useState(true)
  const [expandedPrompt, setExpandedPrompt] = useState<number | null>(null)

  const load = useCallback(async (runId?: string, sort?: string, model?: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (runId) params.set('runId', runId)
    params.set('sortBy', sort || sortBy)
    params.set('model', model || filterModel)

    const res = await fetch(`/api/kpi?${params}`)
    const d = await res.json()
    setData(d)
    if (d.selectedRunId) setSelectedRunId(d.selectedRunId)
    setLoading(false)
  }, [sortBy, filterModel])

  useEffect(() => { load() }, [load])

  const handleRunChange = (id: string) => {
    setSelectedRunId(id)
    load(id, sortBy, filterModel)
  }

  const exportCSV = () => {
    if (!data?.generations) return
    const rows = [
      ['shortcode', 'likes', 'comments', 'model', 'fallback', 'scene', 'prompt', 'image_url', 'source_url'].join(','),
      ...data.generations.map((g) =>
        [
          g.sourceShortcode,
          g.sourceLikes,
          g.sourceComments,
          g.modelUsed,
          g.fallbackUsed,
          `"${(g.sceneDescription || '').replace(/"/g, '""')}"`,
          `"${(g.promptUsed || '').replace(/"/g, '""')}"`,
          g.generatedImageUrl,
          g.sourcePostUrl,
        ].join(',')
      ),
    ].join('\n')

    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `emma-kpi-${selectedRunId.substring(0, 8)}.csv`
    a.click()
  }

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-gray-400 hover:text-white transition text-sm">
          ← Nouveau Run
        </Link>
        <Link href="/settings" className="text-gray-400 hover:text-white transition text-sm">
          ⚙️ Settings
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">📊 Résultats</h1>
          <button
            onClick={exportCSV}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 transition"
          >
            📥 Export CSV
          </button>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={selectedRunId}
            onChange={(e) => handleRunChange(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 transition"
          >
            {data?.runs.map((r) => (
              <option key={r.id} value={r.id}>
                Run #{r.id.substring(0, 8)} — {formatDate(r.createdAt)} — {r.completedPosts} imgs
              </option>
            ))}
          </select>

          <select
            value={filterModel}
            onChange={(e) => { setFilterModel(e.target.value); load(selectedRunId, sortBy, e.target.value) }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 transition"
          >
            <option value="all">Tous modèles</option>
            <option value="soul_cinematic">Soul Cinema</option>
            <option value="seedream_v4_5">Seedream 4.5</option>
            <option value="nano_banana_2">Nano Banana</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); load(selectedRunId, e.target.value, filterModel) }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-violet-500 transition"
          >
            <option value="likes">Trier : likes ↓</option>
            <option value="comments">Trier : comments ↓</option>
            <option value="rank">Trier : rang ↑</option>
            <option value="generated">Trier : plus récents</option>
          </select>
        </div>

        {/* Summary */}
        {data?.summary && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total', value: data.summary.completed, sub: `${data.summary.failed} failed` },
              { label: 'Soul Cinema', value: data.summary.soulCinema, sub: 'primaire' },
              { label: 'Fallbacks', value: data.summary.fallbacks, sub: 'Seedream + Nano Banana' },
              {
                label: 'Taux succès',
                value: `${data.summary.total > 0 ? Math.round((data.summary.completed / data.summary.total) * 100) : 0}%`,
                sub: `${data.summary.total} posts`
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-gray-500 text-xs">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                <p className="text-gray-600 text-xs mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Résultats */}
        {loading ? (
          <div className="text-center py-20 text-gray-500">⏳ Chargement...</div>
        ) : !data?.generations?.length ? (
          <div className="text-center py-20 text-gray-500">
            Aucune génération complétée pour ce run.
          </div>
        ) : (
          <div className="space-y-3">
            {data.generations.map((g) => {
              const badge = MODEL_BADGE[g.modelUsed] || { label: g.modelUsed, color: 'bg-gray-800 text-gray-400' }
              return (
                <div
                  key={g.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                >
                  <div className="flex gap-4">
                    {/* ── Comparaison images : Source → Généré ── */}
                    <div className="flex items-start gap-2 flex-shrink-0">
                      {/* Image source (Instagram original) */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-600">Original</span>
                        <SourceImage gen={g} />
                      </div>

                      {/* Flèche */}
                      <div className="flex items-center h-32 text-gray-600 text-lg">→</div>

                      {/* Image générée (Higgsfield) */}
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-600">Généré</span>
                        {g.generatedImageUrl ? (
                          <a href={g.generatedImageUrl} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={g.generatedImageUrl}
                              alt="generated"
                              className="w-24 h-32 object-cover rounded-lg hover:opacity-80 transition"
                            />
                          </a>
                        ) : (
                          <div className="w-24 h-32 bg-gray-800 rounded-lg flex items-center justify-center text-gray-600 text-xs">
                            —
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Métadonnées ── */}
                    <div className="flex-1 min-w-0">
                      {/* Header : badge modèle + stats engagement */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>
                          {g.fallbackUsed && (
                            <span className="text-xs bg-amber-900/40 text-amber-400 px-2 py-0.5 rounded-full">
                              fallback
                            </span>
                          )}
                          {g.sourceRank && (
                            <span className="text-xs text-gray-500">#{g.sourceRank}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-shrink-0">
                          {/* Engagement du post source */}
                          <span className="text-red-400 font-medium">
                            ❤️ {(g.sourceLikes || 0).toLocaleString('fr-FR')}
                          </span>
                          <span className="text-gray-500">
                            💬 {(g.sourceComments || 0).toLocaleString('fr-FR')}
                          </span>
                          {g.sourcePostUrl && (
                            <a
                              href={g.sourcePostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-violet-400 hover:text-violet-300"
                            >
                              Post ↗
                            </a>
                          )}
                        </div>
                      </div>

                      {g.sceneDescription && (
                        <p className="text-gray-300 text-sm mb-2">{g.sceneDescription}</p>
                      )}

                      {g.promptUsed && (
                        <div>
                          <button
                            onClick={() => setExpandedPrompt(expandedPrompt === g.id ? null : g.id)}
                            className="text-xs text-gray-500 hover:text-gray-300 transition mb-1"
                          >
                            {expandedPrompt === g.id ? '▲ Masquer prompt' : '▼ Voir prompt'}
                          </button>
                          {expandedPrompt === g.id && (
                            <p className="text-xs text-gray-400 bg-gray-800 rounded-lg p-3 font-mono leading-relaxed">
                              {g.promptUsed}
                            </p>
                          )}
                          <BankButton genId={g.id} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
