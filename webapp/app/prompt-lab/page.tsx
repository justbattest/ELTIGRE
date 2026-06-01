'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

// ─── Types ────────────────────────────────────────────────────────────────────

type HistoryEntry = {
  id: string
  timestamp: string   // HH:MM
  description: string
  analysisText: string
  promptJson: string  // JSON stringifié extrait du stream
  previews: string[]  // premières images (base64 thumbnails)
}

const CATEGORIES = [
  { key: 'conference', label: '🎓 Conférence' },
  { key: 'sport',      label: '🏃 Coach' },
  { key: 'golf',       label: '⛳ Golf' },
  { key: 'nurse',      label: '🏥 Vieux — Infirmière' },
  { key: 'restaurant', label: '🍽️ Vieux — Restaurant' },
  { key: 'meteo',      label: '📺 Météo' },
  { key: 'reporter',   label: '🌪️ Météo — Reporter' },
] as const

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PromptLabPage() {
  useSession()

  // ── Images ──
  const [images, setImages] = useState<{ file: File; preview: string; base64: string }[]>([])
  const [dragging, setDragging] = useState(false)

  // ── Description ──
  const [description, setDescription] = useState('')

  // ── Génération ──
  const [generating, setGenerating] = useState(false)
  const [analysisText, setAnalysisText] = useState('')
  const [promptJson, setPromptJson] = useState('')   // JSON extrait après ---JSON---
  const [error, setError] = useState('')
  const analysisRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // ── Historique session ──
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [viewingEntry, setViewingEntry] = useState<HistoryEntry | null>(null)

  // ── Dialog Save ──
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveAuthor, setSaveAuthor] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveCategoryKey, setSaveCategoryKey] = useState<string>('conference')
  const [customNiche, setCustomNiche] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')

  // ── Charger historique depuis localStorage ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('prompt-lab-history')
      if (raw) setHistory(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  const saveHistory = (entries: HistoryEntry[]) => {
    setHistory(entries)
    try { localStorage.setItem('prompt-lab-history', JSON.stringify(entries.slice(0, 20))) } catch { /* ignore */ }
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const toBase64 = (file: File): Promise<string> =>
    new Promise(res => {
      const reader = new FileReader()
      reader.onload = e => res(e.target?.result as string)
      reader.readAsDataURL(file)
    })

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    const newImages = await Promise.all(arr.map(async f => ({
      file: f,
      preview: URL.createObjectURL(f),
      base64: await toBase64(f),
    })))
    setImages(prev => [...prev, ...newImages].slice(0, 10))
  }, [])

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop      = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }

  const removeImage = (i: number) => setImages(prev => {
    URL.revokeObjectURL(prev[i].preview)
    return prev.filter((_, idx) => idx !== i)
  })

  // ── Génération streaming ───────────────────────────────────────────────────
  const generate = async () => {
    if (!images.length) return setError('Uploade au moins un screenshot.')
    if (!description.trim()) return setError('Décris la scène.')

    setError('')
    setAnalysisText('')
    setPromptJson('')
    setGenerating(true)
    setViewingEntry(null)

    const abort = new AbortController()
    abortRef.current = abort

    let fullText = ''
    let jsonStarted = false
    let jsonBuffer = ''

    try {
      const res = await fetch('/api/prompt-lab/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map(i => i.base64),
          description,
        }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const raw = decoder.decode(value)
        const lines = raw.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const chunk = JSON.parse(data)
            if (chunk.error) throw new Error(chunk.error)
            if (chunk.text) {
              fullText += chunk.text

              // Détecter la séparation ---JSON---
              if (!jsonStarted && fullText.includes('---JSON---')) {
                jsonStarted = true
                const parts = fullText.split('---JSON---')
                setAnalysisText(parts[0].trim())
                jsonBuffer = parts[1] || ''
              } else if (jsonStarted) {
                jsonBuffer += chunk.text
              } else {
                setAnalysisText(fullText)
              }

              // Auto-scroll
              if (analysisRef.current) {
                analysisRef.current.scrollTop = analysisRef.current.scrollHeight
              }
            }
          } catch (parseErr) {
            if ((parseErr as Error).message !== 'Unexpected end of JSON input') throw parseErr
          }
        }
      }

      // Extraire le JSON final
      if (jsonBuffer.trim()) {
        const jsonStr = jsonBuffer.trim()
        try {
          JSON.parse(jsonStr)  // Valider
          setPromptJson(jsonStr)

          // Ajouter à l'historique
          const entry: HistoryEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' }),
            description: description.slice(0, 80),
            analysisText: fullText.split('---JSON---')[0]?.trim() || '',
            promptJson: jsonStr,
            previews: images.slice(0, 3).map(i => i.preview),
          }
          saveHistory([entry, ...history])
        } catch {
          setError('Le JSON généré est invalide — réessaie.')
        }
      }

    } catch (e) {
      if (!abort.signal.aborted) setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setGenerating(false)
  }

  // ── Save dialog ────────────────────────────────────────────────────────────
  const openSaveDialog = (json?: string) => {
    const j = json || promptJson
    if (!j) return
    setPromptJson(j)
    setSaveDescription(description.slice(0, 80))
    setSaveSuccess('')
    setShowSaveDialog(true)
  }

  const saveToVideo = async () => {
    if (!saveAuthor.trim() || !saveDescription.trim() || !promptJson) return
    setSaving(true)
    try {
      const res = await fetch('/api/prompt-lab/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptJson,
          authorName: saveAuthor.trim(),
          userDescription: saveDescription.trim(),
          categoryKey: saveCategoryKey,
          customNiche: saveCategoryKey === 'custom' ? customNiche : undefined,
          customLabel: saveCategoryKey === 'custom' ? customLabel : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setSaveSuccess(`✅ "${data.title}" ajouté à l'onglet Vidéos !`)
      setTimeout(() => setShowSaveDialog(false), 2500)
    } catch (e) {
      setSaveSuccess(`❌ ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Revoir une entrée historique ───────────────────────────────────────────
  const reviewEntry = (entry: HistoryEntry) => {
    setViewingEntry(entry)
    setAnalysisText(entry.analysisText)
    setPromptJson(entry.promptJson)
    setGenerating(false)
  }

  const isRunning = generating

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-5">

        <div>
          <h1 className="text-xl font-bold">🧪 Prompt Lab</h1>
          <p className="text-zinc-400 text-sm mt-1">Upload des screenshots d&apos;une vidéo à reproduire + décris la scène → Claude génère le prompt Seedance parfait.</p>
        </div>

        {/* ── Upload screenshots ── */}
        <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07] space-y-3">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Screenshots de la vidéo <span className="text-zinc-600 font-normal normal-case">(1–10 frames, dans l&apos;ordre)</span></p>

          <div
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => document.getElementById('pl-file-input')?.click()}
            className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${dragging ? 'border-violet-500 bg-violet-900/10' : 'border-white/[0.08] hover:border-white/[0.20]'}`}
          >
            <input id="pl-file-input" type="file" multiple accept="image/*" className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files) }} />
            <p className="text-zinc-400 text-sm">
              {images.length > 0 ? `${images.length} frame${images.length > 1 ? 's' : ''} — clique ou glisse pour en ajouter` : 'Glisse tes screenshots ici ou clique'}
            </p>
            <p className="text-zinc-600 text-xs mt-1">JPG · PNG · WEBP · max 10 images</p>
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-0.5 left-1 text-xs text-white bg-black/50 rounded px-1">{i + 1}</div>
                  <button onClick={() => removeImage(i)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Description ── */}
        <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07]">
          <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wider">Description de la scène</p>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Décris ce qui se passe : tenue de la femme, actions, dialogue exact, réactions des autres personnes, ambiance (indoor/outdoor/nuit/jour), effets voulus (culotte visible, jupe qui se lève, distraction)..."
            rows={4}
            className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm resize-none"
          />
        </div>

        {/* ── Bouton générer ── */}
        <div className="flex gap-3">
          <button
            onClick={generate}
            disabled={isRunning || !images.length || !description.trim()}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {isRunning ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
              Analyse en cours...
            </span>
          ) : 'Analyser & Générer le prompt'}
          </button>
          {isRunning && (
            <button onClick={stopGeneration} className="px-5 py-3 rounded-xl font-semibold text-white bg-red-700 hover:bg-red-600 transition">Stop</button>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* ── Zone streaming / résultat ── */}
        {(analysisText || promptJson) && (
          <div className="space-y-4">
            {viewingEntry && (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2 text-xs text-amber-400">
                📋 Historique {viewingEntry.timestamp} — {viewingEntry.description.slice(0, 60)}
              </div>
            )}

            {/* Analyse */}
            {analysisText && (
              <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl border border-white/[0.07]">
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Analyse Claude</p>
                  {isRunning && <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse" />}
                </div>
                <div
                  ref={analysisRef}
                  className="px-5 pb-4 max-h-80 overflow-y-auto text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap"
                >
                  {analysisText}
                  {isRunning && !promptJson && <span className="inline-block w-1.5 h-4 bg-violet-400 ml-0.5 animate-pulse" />}
                </div>
              </div>
            )}

            {/* Prompt JSON */}
            {promptJson && (
              <div className="bg-gray-900 rounded-2xl border border-violet-800/50">
                <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs text-violet-400 font-medium uppercase tracking-wider">🎬 Prompt Seedance généré</p>
                  <button
                    onClick={() => { navigator.clipboard.writeText(promptJson) }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                  >
                    Copier
                  </button>
                </div>
                <pre className="px-5 pb-4 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                  {(() => { try { return JSON.stringify(JSON.parse(promptJson), null, 2) } catch { return promptJson } })()}
                </pre>
                <div className="px-5 pb-4">
                  <button
                    onClick={() => openSaveDialog()}
                    className="w-full py-2.5 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition text-sm"
                  >
                    💾 Save to Video
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Historique session ── */}
        {history.length > 0 && (
          <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07]">
            <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wider">Historique session ({history.length})</p>
            <div className="space-y-2">
              {history.map(entry => (
                <div key={entry.id} className="flex items-center gap-3 bg-black/40 rounded-xl px-3 py-2">
                  <div className="flex gap-1">
                    {entry.previews.slice(0, 3).map((p, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={p} alt="" className="w-8 h-8 rounded object-cover" />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate">{entry.description}</p>
                    <p className="text-xs text-zinc-600">{entry.timestamp}</p>
                  </div>
                  <button onClick={() => reviewEntry(entry)} className="text-xs text-violet-400 hover:text-violet-300 transition whitespace-nowrap">Revoir</button>
                  <button onClick={() => openSaveDialog(entry.promptJson)} className="text-xs text-emerald-400 hover:text-emerald-300 transition whitespace-nowrap">Sauvegarder</button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Dialog Save to Video ── */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900/90 border border-white/[0.08] rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="font-bold text-lg">💾 Save to Video</h2>
            <p className="text-xs text-zinc-500">Ce prompt apparaîtra dans l&apos;onglet Vidéos avec ton nom.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Ton prénom / pseudo</label>
                <input
                  type="text"
                  value={saveAuthor}
                  onChange={e => setSaveAuthor(e.target.value)}
                  placeholder="Alexandre"
                  className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Description courte du concept</label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={e => setSaveDescription(e.target.value.slice(0, 80))}
                  placeholder="Femme dos au public, culotte visible, copine réagit..."
                  className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm"
                />
                <p className="text-xs text-zinc-600 mt-0.5">{saveDescription.length}/80</p>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Catégorie</label>
                <select
                  value={saveCategoryKey}
                  onChange={e => setSaveCategoryKey(e.target.value)}
                  className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                  <option value="custom">➕ Nouvelle catégorie...</option>
                </select>
              </div>
            </div>

            {saveCategoryKey === 'custom' && (
              <div className="space-y-2 p-3 bg-black/40 rounded-xl">
                <input type="text" value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                  placeholder="Nom de la catégorie (ex: Cuisine, Voiture...)"
                  className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 text-sm" />
                <input type="text" value={customNiche} onChange={e => setCustomNiche(e.target.value)}
                  placeholder="Clé interne (ex: cuisine, voiture — sans espaces)"
                  className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 text-sm font-mono" />
              </div>
            )}

            {saveSuccess && (
              <p className={`text-sm ${saveSuccess.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>{saveSuccess}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2 rounded-xl text-sm text-zinc-400 bg-white/[0.05] hover:bg-white/[0.08] transition"
              >
                Annuler
              </button>
              <button
                onClick={saveToVideo}
                disabled={saving || !saveAuthor.trim() || !saveDescription.trim()}
                className="flex-1 py-2 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition text-sm"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                    Sauvegarde...
                  </span>
                ) : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
      </PageWrapper>
      </main>
    </div>
  )
}
