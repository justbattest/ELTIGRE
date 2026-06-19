'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { compressImage } from '@/lib/compress-image'
import { TutorialVideo } from '@/components/TutorialVideo'

type CarouselEvent =
  | { type: 'info'; msg: string; image_count?: number }
  | { type: 'carousel_start'; total: number; image_count: number; combinations_possible: number }
  | { type: 'carousel'; n: number; total: number; drive_urls: string[]; errors: string[] | null }
  | { type: 'done'; run_id: string; total: number; finished_at: string }
  | { type: 'error'; message: string }
  | { type: 'stderr'; msg: string }

type SoulCharacter = { id: string; name: string; status?: string }

export default function CarouselPage() {
  useSession()
  const router = useRouter()

  // ── Onglet actif ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'mix' | 'variations'>('mix')

  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [maxCarousels, setMaxCarousels] = useState(200)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // ── Personnage ────────────────────────────────────────────────────────────
  const [refElements, setRefElements] = useState<{ id: string; name: string }[]>([])
  const [soulCharacters, setSoulCharacters] = useState<SoulCharacter[]>([])
  const [selectedCharacterName, setSelectedCharacterName] = useState('')
  const [selectedSoulId, setSelectedSoulId] = useState('') // UUID pour variations img2img
  const [loadingChars, setLoadingChars] = useState(false)

  // ── Variations — état spécifique ─────────────────────────────────────────
  const [varRunId, setVarRunId] = useState<string | null>(null)
  const [varTotal, setVarTotal] = useState(0)
  const [varCompleted, setVarCompleted] = useState(0)
  const [varLinks, setVarLinks] = useState<{ n: number; urls: string[] }[]>([])
  const [varDone, setVarDone] = useState(false)
  const [varError, setVarError] = useState('')

  const loadCharacters = async () => {
    setLoadingChars(true)
    try {
      await fetch('/api/characters/scan-elements', { method: 'POST' }).catch(() => {})
      const res = await fetch('/api/characters')
      const data = await res.json()
      const elements: { id: string; name: string }[] = data.referenceElements || []
      const souls: SoulCharacter[] = data.soulCharacters || []
      const all = [...elements, ...souls]
      setRefElements(all)
      setSoulCharacters(souls)
      if (all.length && !selectedCharacterName) setSelectedCharacterName(all[0].name)
      if (souls.length && !selectedSoulId) setSelectedSoulId(souls[0].id)
    } catch {
      // silencieux
    } finally {
      setLoadingChars(false)
    }
  }

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const elements: { id: string; name: string }[] = data.referenceElements || []
        const souls: SoulCharacter[] = data.soulCharacters || []
        const all = [...elements, ...souls]
        setRefElements(all)
        setSoulCharacters(souls)
        if (all.length) setSelectedCharacterName(all[0].name)
        if (souls.length) setSelectedSoulId(souls[0].id)
      })
      .catch(() => { /* silencieux si Higgsfield indisponible */ })
  }, [])

  // State du run en cours
  const [runId, setRunId] = useState<string | null>(null)
  const [totalCarousels, setTotalCarousels] = useState(0)
  const [completedCarousels, setCompletedCarousels] = useState(0)
  const [carouselDriveLinks, setCarouselDriveLinks] = useState<{ n: number; urls: string[] }[]>([])
  const [done, setDone] = useState(false)
  const [imageCount, setImageCount] = useState(0)
  const [combinationsPossible, setCombinationsPossible] = useState(0)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Gestion des fichiers ──────────────────────────────────────────────────

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles).filter(f =>
      f.type.startsWith('image/')
    )
    setFiles(prev => {
      const all = [...prev, ...arr]
      // Générer les previews
      arr.forEach(f => {
        const url = URL.createObjectURL(f)
        setPreviews(p => [...p, url])
      })
      return all
    })
  }, [])

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => {
      URL.revokeObjectURL(prev[idx])
      return prev.filter((_, i) => i !== idx)
    })
  }

  const resetAll = () => {
    previews.forEach(URL.revokeObjectURL)
    setFiles([])
    setPreviews([])
    setRunId(null)
    setTotalCarousels(0)
    setCompletedCarousels(0)
    setCarouselDriveLinks([])
    setDone(false)
    setError('')
    setImageCount(0)
    setCombinationsPossible(0)
  }

  const resetVariations = () => {
    previews.forEach(URL.revokeObjectURL)
    setFiles([])
    setPreviews([])
    setVarRunId(null)
    setVarTotal(0)
    setVarCompleted(0)
    setVarLinks([])
    setVarDone(false)
    setVarError('')
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  // ── Lancement ─────────────────────────────────────────────────────────────

  const launch = async () => {
    if (files.length < 4) {
      setError('At least 4 images are required to create carousels.')
      return
    }
    setError('')
    setUploading(true)

    // Compression client-side avant envoi (photos iPhone = 15-50MB → ~2MB après)
    const compressedFiles = await Promise.all(files.map(f => compressImage(f)))

    const form = new FormData()
    compressedFiles.forEach(f => form.append('images', f))
    form.append('maxCarousels', String(maxCarousels))
    if (selectedCharacterName) form.append('characterName', selectedCharacterName)

    try {
      const res = await fetch('/api/carousel/create', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Error during launch')
        setUploading(false)
        return
      }
      setRunId(data.runId)
      setUploading(false)
      // Le subprocess Python tourne côté serveur — on passe immédiatement sur En cours.
      router.push('/en-cours')
    } catch (e) {
      setError(String(e))
      setUploading(false)
    }
  }

  // ── Lancement Variations ──────────────────────────────────────────────────

  const launchVariations = async () => {
    if (files.length === 0) {
      setVarError('Add at least 1 reference photo.')
      return
    }
    if (!selectedSoulId) {
      setVarError('Select a Soul Character (required for generation).')
      return
    }
    setVarError('')
    setUploading(true)

    const compressedFiles = await Promise.all(files.map(f => compressImage(f)))

    const form = new FormData()
    compressedFiles.forEach(f => form.append('images', f))
    form.append('soulId', selectedSoulId)
    form.append('characterName', selectedCharacterName)
    form.append('quality', '2k')

    try {
      const res = await fetch('/api/carousel/generate-variations', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) {
        setVarError(data.error || 'Error during launch')
        setUploading(false)
        return
      }
      setVarRunId(data.runId)
      setUploading(false)
    } catch (e) {
      setVarError(String(e))
      setUploading(false)
    }
  }

  // ── SSE stream (variations) — avec reconnexion automatique ──────────────────

  useEffect(() => {
    if (!varRunId || varDone) return
    let es: EventSource | null = null
    let retries = 0
    const MAX_RETRIES = 20  // ~10 min de retries (20 × 30s)
    let closed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return
      es = new EventSource(`/api/carousel/events/${varRunId}`)
      es.onmessage = (e) => {
        retries = 0  // reset retry count on successful message
        let event: CarouselEvent & { type: string }
        try { event = JSON.parse(e.data) } catch { return }
        if (event.type === 'carousel_start') {
          setVarTotal((event as { total: number }).total)
        } else if (event.type === 'carousel') {
          setVarCompleted(prev => prev + 1)
          if ((event as { drive_urls: string[] }).drive_urls?.length) {
            setVarLinks(prev => [...prev, {
              n: (event as { n: number }).n,
              urls: (event as { drive_urls: string[] }).drive_urls
            }])
          }
        } else if (event.type === 'done') {
          closed = true
          setVarDone(true)
          es?.close()
        } else if (event.type === 'error') {
          const msg = (event as { message: string }).message || 'Unknown error'
          setVarError(msg)
          closed = true
          setVarDone(true)
          es?.close()
        }
      }
      es.onerror = () => {
        es?.close()
        if (closed) return
        if (retries >= MAX_RETRIES) {
          setVarError('Connection lost after multiple retries — check Drive for results.')
          setVarDone(true)
          return
        }
        retries++
        const delay = Math.min(5000 * retries, 30000)  // 5s, 10s, ... max 30s
        retryTimer = setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [varRunId, varDone])

  // ── SSE stream ────────────────────────────────────────────────────────────

  useEffect(() => {
    // Ne pas reconnecter si le run est déjà terminé (protège contre les hot-reloads)
    if (!runId || done) return

    const es = new EventSource(`/api/carousel/events/${runId}`)

    es.onmessage = (e) => {
      let event: CarouselEvent & { type: string; msg?: string }
      try {
        event = JSON.parse(e.data)
      } catch {
        return
      }

      if (event.type === 'carousel_start') {
        setTotalCarousels(event.total as number)
        setImageCount((event as { image_count: number }).image_count)
        setCombinationsPossible((event as { combinations_possible: number }).combinations_possible)
      } else if (event.type === 'carousel') {
        setCompletedCarousels(prev => prev + 1)
        if ((event as { drive_urls: string[] }).drive_urls?.length) {
          setCarouselDriveLinks(prev => [...prev, {
            n: (event as { n: number }).n,
            urls: (event as { drive_urls: string[] }).drive_urls
          }])
        }
      } else if (event.type === 'done') {
        setDone(true)
        es.close()
      } else if (event.type === 'error') {
        const msg = (event as { message: string }).message || 'Unknown error'
        // If the run is not found (server restarted), return cleanly to config
        if (msg.includes('introuvable')) {
          es.close()
          resetAll()
          setError('Session expired (server restarted). Start a new batch.')
          return
        }
        setError(msg)
        setDone(true)
        es.close()
      } else if (event.type === 'stderr') {
        console.warn('[carousel stderr]', event.msg)
      }
    }

    let retries = 0
    es.onerror = () => {
      es.close()
      if (retries >= 10) {
        setError('SSE connection lost — the server may have restarted.')
        setDone(true)
        return
      }
      retries++
      setTimeout(() => {
        if (!done) {
          const newEs = new EventSource(`/api/carousel/events/${runId}`)
          Object.assign(newEs, { onmessage: es.onmessage })
        }
      }, Math.min(5000 * retries, 30000))
    }
    return () => es.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, done])

  // ── UI ────────────────────────────────────────────────────────────────────

  const pct = totalCarousels > 0 ? Math.round((completedCarousels / totalCarousels) * 100) : 0

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

        <TutorialVideo videoId="iFVdktshEVQ" title="Carousels" />

        {/* ── Onglets ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 bg-white/40 backdrop-blur-sm border border-white/60 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('mix')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
              activeTab === 'mix'
                ? 'bg-violet-600 shadow-[0_4px_12px_rgba(109,40,217,0.35)] text-white border border-violet-500'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            🔀 Random mix
          </button>
          <button
            onClick={() => setActiveTab('variations')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition ${
              activeTab === 'variations'
                ? 'bg-violet-600 shadow-[0_4px_12px_rgba(109,40,217,0.35)] text-white border border-violet-500'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            🎨 Variations (img2img)
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── ONGLET VARIATIONS ─────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'variations' && !varRunId && (
          <>
            {/* Info */}
            <div className="bg-violet-50 border border-violet-300 rounded-xl p-4">
              <p className="text-sm text-violet-700 font-medium mb-1">🎨 Variations Mode — Image to Image</p>
              <p className="text-xs text-violet-700/70">
                For each uploaded photo, SoulCinema generates <strong className="text-violet-300">3 variations</strong> (same setting, different pose/angle).
                Result: 1 Drive carousel per photo = original + 3 consistent variations.
              </p>
            </div>

            {/* Soul Character (obligatoire pour img2img) */}
            <div className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-700">Soul Character <span className="text-red-500">*</span></p>
                <button onClick={loadCharacters} disabled={loadingChars} className="text-xs text-violet-600 hover:text-violet-700 transition disabled:opacity-50">
                  {loadingChars ? 'Loading...' : 'Refresh'}
                </button>
              </div>
              {soulCharacters.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {soulCharacters.map(s => (
                    <button key={s.id}
                      onClick={() => { setSelectedSoulId(s.id); setSelectedCharacterName(s.name) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedSoulId === s.id
                          ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                          : 'bg-white/60 border-gray-200 text-gray-700 hover:border-violet-500/50 hover:text-gray-900'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-700">No Soul Character found — connect Higgsfield in Settings.</p>
              )}
              {selectedSoulId && (
                <p className="text-[10px] text-gray-600 mt-2 font-mono">{selectedSoulId}</p>
              )}
            </div>

            {/* Zone drag & drop (même que mix) */}
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-violet-400 bg-violet-50/80' : 'border-gray-300 hover:border-gray-400 bg-white/40'
              }`}
            >
              <div className="text-4xl mb-3">📸</div>
              <p className="text-gray-800 font-medium">Drag your reference photos here</p>
              <p className="text-gray-600 text-sm mt-1">1 photo = 1 full carousel (original + 3 variations)</p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => e.target.files && addFiles(e.target.files)} />
            </div>

            {/* Previews */}
            {files.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-700">
                    {files.length} photo{files.length > 1 ? 's' : ''} → {files.length} carousel{files.length > 1 ? 's' : ''} of 4 images
                  </span>
                  <button onClick={resetVariations} className="text-xs text-gray-600 hover:text-red-500 transition">Clear all</button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover rounded-lg border border-violet-500/30" />
                      <div className="absolute bottom-0 left-0 right-0 bg-white/80 rounded-b-lg py-0.5 text-[8px] text-center text-violet-600">→ 4 imgs</div>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition">×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {varError && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-4">{varError}</div>
            )}

            <button
              onClick={launchVariations}
              disabled={files.length === 0 || !selectedSoulId || uploading}
              className="w-full bg-gradient-to-br from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3.5 transition text-sm"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                  Compressing + launching...
                </span>
              ) : files.length === 0
                ? 'Add reference photos'
                : `🎨 Generate ${files.length} carousel${files.length > 1 ? 's' : ''} (${files.length * 3} Higgsfield generations)`}
            </button>
          </>
        )}

        {/* Variations — Progression */}
        {activeTab === 'variations' && varRunId && (
          <div className="space-y-5">
            <div className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-gray-900">
                  {varDone && !varError ? '✅ Variations generated!' : varDone && varError ? '❌ Error' : '🎨 Generating variations...'}
                </h2>
                <span className="text-xs text-gray-700">{varCompleted}/{varTotal || '?'} carousels</span>
              </div>
              <div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-gradient-to-r from-violet-500 to-cyan-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: varTotal > 0 ? `${Math.round(varCompleted / varTotal * 100)}%` : '0%' }} />
                </div>
              </div>
              {varError && <div className="bg-red-50/90 backdrop-blur-sm border border-red-200 text-red-700 text-sm rounded-lg p-3">{varError}</div>}
              {varDone && (
                <button onClick={resetVariations}
                  className="w-full bg-white/60 hover:bg-white/80 text-gray-800 text-sm rounded-lg py-2.5 transition border border-gray-200">
                  + New session
                </button>
              )}
            </div>
            {varLinks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">Carousels created ({varLinks.length})</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {varLinks.map(({ n, urls }) => (
                    <div key={n} className="bg-white/75 backdrop-blur-sm border border-white/80 rounded-xl p-3 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-700 w-24">carousel_{n}</span>
                        <div className="flex gap-1">
                          {urls.map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-gray-400' : 'bg-violet-500'}`} />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-700">{urls.length} imgs (1 orig + {urls.length - 1} variants)</span>
                      </div>
                      <a href={urls[0]} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] text-violet-600 hover:text-violet-700 transition">View on Drive →</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ── ONGLET MIX ────────────────────────────────────────────────── */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'mix' && (
        <>
        {/* ── Config ─────────────────────────────────────────────────────── */}
        {!runId && (
          <>
            {/* Personnage (dossier Drive) — toujours visible */}
            <div className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-gray-700">Character (Drive folder)</p>
                <button
                  onClick={loadCharacters}
                  disabled={loadingChars}
                  className="text-xs text-violet-600 hover:text-violet-700 transition disabled:opacity-50"
                >
                  {loadingChars ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                      Scanning...
                    </span>
                  ) : 'Scan from Higgsfield'}
                </button>
              </div>
              {refElements.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {refElements.map(e => (
                    <button key={e.id} onClick={() => setSelectedCharacterName(e.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedCharacterName === e.name
                          ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                          : 'bg-white/60 border-gray-200 text-gray-700 hover:border-violet-500/50 hover:text-gray-900'
                      }`}>
                      {e.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <input
                    value={selectedCharacterName}
                    onChange={e => setSelectedCharacterName(e.target.value)}
                    placeholder="Drive folder name (e.g. EMMA)"
                    className="w-full bg-white/80 border border-gray-300 backdrop-blur-sm rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition"
                  />
                  <button
                    onClick={loadCharacters}
                    disabled={loadingChars}
                    className="w-full py-2.5 text-sm rounded-xl bg-white border border-gray-200 text-gray-700 hover:text-gray-900 hover:border-violet-500/40 hover:bg-violet-50 transition disabled:opacity-40"
                  >
                    {loadingChars ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                        Scanning...
                      </span>
                    ) : 'Load from Higgsfield'}
                  </button>
                  <p className="text-[10px] text-gray-700 text-center">
                    Or type a Drive folder name directly above
                  </p>
                </div>
              )}
            </div>

            {/* Zone drag & drop */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-violet-400 bg-violet-50/80'
                  : 'border-gray-300 hover:border-gray-400 bg-white/40'
              }`}
            >
              <div className="text-4xl mb-3">🖼️</div>
              <p className="text-gray-800 font-medium">Drag your images here</p>
              <p className="text-gray-600 text-sm mt-1">
                or click to select · JPG, PNG, WebP accepted
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Previews */}
            {files.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-700">
                    {files.length} image{files.length > 1 ? 's' : ''} selected
                    {files.length >= 4 && (
                      <span className="text-violet-600 ml-2">
                        → up to {Math.min(maxCarousels, (() => {
                          let n = files.length, k = 4
                          if (n < k) return 0
                          let r = 1
                          for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1)
                          return Math.floor(r)
                        })())} possible carousels
                      </span>
                    )}
                  </span>
                  <button
                    onClick={resetAll}
                    className="text-xs text-gray-600 hover:text-red-500 transition"
                  >
                    Clear all
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-7 gap-2">
                  {previews.map((url, i) => (
                    <div key={i} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-full h-full object-cover rounded-lg" />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Réglages */}
            <div className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-medium text-gray-900">Settings</h2>

              {/* Max carousels */}
              <div>
                <label className="text-[10px] text-gray-700 uppercase tracking-widest">
                  Max carousels
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxCarousels}
                    onChange={e => setMaxCarousels(Math.min(200, Math.max(1, Number(e.target.value))))}
                    className="w-16 bg-white/80 border border-gray-300 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-sm text-center focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30"
                  />
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={maxCarousels}
                    onChange={e => setMaxCarousels(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-gray-700 w-10 text-right">{maxCarousels} max</span>
                </div>
                <p className="text-[10px] text-gray-700 mt-1">
                  Each carousel = 4 photos · unique combinations · unique EXIF iPhone 17 Pro per instance
                </p>
              </div>

              {/* Infos */}
              <div className="bg-white/50 border border-white/60 backdrop-blur-sm rounded-lg p-3 space-y-1">
                <p className="text-[10px] text-gray-700">
                  ✅ EXIF stripped + fake iPhone 17 Pro (unique datetime + GPS + ISO per image/carousel)
                </p>
                <p className="text-[10px] text-gray-700">
                  ✅ Micro-crop + micro-noise per instance → no two binary files are identical
                </p>
                <p className="text-[10px] text-gray-700">
                  ✅ Organized upload to Drive: <code className="text-violet-600">carousel_N/1.jpg … 4.jpg</code>
                </p>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-4">
                {error}
              </div>
            )}

            {/* Bouton lancement */}
            <button
              onClick={launch}
              disabled={files.length < 4 || uploading}
              className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3.5 transition text-sm"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                  Compressing + uploading...
                </span>
              ) : files.length < 4
                ? `Add at least ${4 - files.length} more image${4 - files.length > 1 ? 's' : ''}`
                : `Generate ${maxCarousels > 0 ? `up to ${maxCarousels}` : ''} carousels`}
            </button>
          </>
        )}

        {/* ── Progression ────────────────────────────────────────────────── */}
        {runId && (
          <div className="space-y-5">
            <div className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-gray-900">
                  {done && !error ? '✅ Carousels generated!' : done && error ? '❌ Error' : '⏳ Generating...'}
                </h2>
                <span className="text-xs text-gray-700">
                  {imageCount} images · C({imageCount},4) = {combinationsPossible.toLocaleString()} possible combos
                </span>
              </div>

              {/* Barre de progression */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-700">
                    {completedCarousels} / {totalCarousels || '...'} carousels
                  </span>
                  <span className="text-xs text-gray-700">{pct}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-violet-500 to-cyan-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50/90 backdrop-blur-sm border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {error}
                </div>
              )}

              {done && (
                <div className="flex gap-3">
                  <button
                    onClick={resetAll}
                    className="flex-1 bg-white/60 hover:bg-white/80 text-gray-800 text-sm rounded-lg py-2.5 transition border border-gray-200"
                  >
                    + New batch
                  </button>
                </div>
              )}
            </div>

            {/* Liens Drive */}
            {carouselDriveLinks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Carousels ready ({carouselDriveLinks.length})
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {carouselDriveLinks.map(({ n, urls }) => (
                    <div
                      key={n}
                      className="bg-white/75 backdrop-blur-sm border border-white/80 shadow-[0_2px_8px_rgba(109,40,217,0.06)] rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-700 w-20">carousel_{n}</span>
                        <div className="flex gap-1">
                          {urls.map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-violet-500 opacity-80" />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-700">{urls.length} photos</span>
                      </div>
                      <a
                        href={urls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-violet-600 hover:text-violet-700 transition"
                      >
                        View on Drive →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        </>
        )}
        {/* ── Fin onglet Mix ──────────────────────────────────────────────── */}

      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
