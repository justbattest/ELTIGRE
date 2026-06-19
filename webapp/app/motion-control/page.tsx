'use client'

import { useEffect, useRef, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

// ─── Types communs ────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string; type?: string }
type SoulCharacter = { id: string; name: string; status?: string }

// ─── Types onglet "MC Prep" ───────────────────────────────────────────────────

type ExtractFrame = { index: number; timestamp: number; url: string }

type PrepEvent = {
  type: string
  step?: string
  status?: string
  url?: string
  drive_url?: string
  index?: number
  total?: number
  msg?: string
  files?: number
  folder?: string
}

/** Convertit un dataURL base64 en File object. */
function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, data] = dataUrl.split(',')
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], filename, { type: mimeType })
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function MotionControlPage() {
  // Données partagées (character selection)
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [soulCharacters, setSoulCharacters] = useState<SoulCharacter[]>([])
  const [selectedSoulId, setSelectedSoulId] = useState('')
  const [selectedSoulName, setSelectedSoulName] = useState('')

  // ── Onglet MC Prep ───────────────────────────────────────────────────────────
  const modelPhotoInputRef = useRef<HTMLInputElement>(null)
  const mcSseRef = useRef<EventSource | null>(null)

  const [mcModelPhotoPreview, setMcModelPhotoPreview] = useState<string | null>(null)
  const [mcModelPhotoName, setMcModelPhotoName] = useState<string>('model_reference.jpg')
  const [mcModelPhotoFile, setMcModelPhotoFile] = useState<File | null>(null)

  const [mcVideoUrl, setMcVideoUrl] = useState('')
  const [mcExtracting, setMcExtracting] = useState(false)
  const [mcExtractError, setMcExtractError] = useState('')
  const [mcExtractId, setMcExtractId] = useState<string | null>(null)
  const [mcFrames, setMcFrames] = useState<ExtractFrame[]>([])
  const [mcSelectedFrame, setMcSelectedFrame] = useState<number | null>(null)
  const [mcNumVariations, setMcNumVariations] = useState(4)

  const [mcGenerating, setMcGenerating] = useState(false)
  const [mcRunId, setMcRunId] = useState<string | null>(null)
  const [mcPrepEvents, setMcPrepEvents] = useState<PrepEvent[]>([])
  const [mcDriveUrl, setMcDriveUrl] = useState<string | null>(null)
  const [mcPrepError, setMcPrepError] = useState('')

  // Charger la photo modèle depuis localStorage
  useEffect(() => {
    try {
      const savedPhoto = localStorage.getItem('mcPrep_modelPhotoDataUrl')
      const savedName = localStorage.getItem('mcPrep_modelPhotoName')
      if (savedPhoto) {
        setMcModelPhotoPreview(savedPhoto)
        if (savedName) setMcModelPhotoName(savedName)
      }
    } catch {}
  }, [])

  const handleModelPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMcModelPhotoFile(file)
    setMcModelPhotoName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setMcModelPhotoPreview(dataUrl)
      try {
        localStorage.setItem('mcPrep_modelPhotoDataUrl', dataUrl)
        localStorage.setItem('mcPrep_modelPhotoName', file.name)
      } catch {}
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleExtractFrames = async () => {
    if (!mcVideoUrl.trim() || mcExtracting) return
    setMcExtracting(true)
    setMcExtractError('')
    setMcExtractId(null)
    setMcFrames([])
    setMcSelectedFrame(null)
    setMcPrepEvents([])
    setMcDriveUrl(null)
    setMcRunId(null)

    try {
      const res = await fetch('/api/mc-prep/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: mcVideoUrl.trim(), numFrames: 4 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
      setMcExtractId(data.extractId)
      setMcFrames(data.frames || [])
      if (data.frames?.length) setMcSelectedFrame(0) // sélectionner la 1ère par défaut
    } catch (err) {
      setMcExtractError(err instanceof Error ? err.message : 'Extraction error')
    } finally {
      setMcExtracting(false)
    }
  }

  const handleGenerate = async () => {
    if (!mcExtractId || mcSelectedFrame === null || mcGenerating) return
    if (!mcModelPhotoPreview && !mcModelPhotoFile) {
      setMcPrepError('Upload a model reference photo first.')
      return
    }

    setMcGenerating(true)
    setMcPrepError('')
    setMcPrepEvents([])
    setMcDriveUrl(null)

    try {
      // Préparer le fichier photo modèle
      const photoFile: File = mcModelPhotoFile
        || dataUrlToFile(mcModelPhotoPreview!, mcModelPhotoName)

      const fd = new FormData()
      fd.append('extractId', mcExtractId)
      fd.append('selectedFrameIndex', String(mcSelectedFrame))
      fd.append('modelPhoto', photoFile, mcModelPhotoName)
      fd.append('numVariations', String(mcNumVariations))
      fd.append('characterName', selectedSoulName || selectedElementName || '')

      const res = await fetch('/api/mc-prep/generate', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)

      const runId: string = data.runId
      setMcRunId(runId)

      // SSE
      mcSseRef.current?.close()
      const sse = new EventSource(`/api/mc-prep/events/${runId}`)
      mcSseRef.current = sse

      sse.onmessage = (e) => {
        try {
          const event: PrepEvent = JSON.parse(e.data)
          setMcPrepEvents(prev => [...prev, event])

          if (event.type === 'done') {
            setMcDriveUrl(event.drive_url || null)
            setMcGenerating(false)
            sse.close()
          }
          if (event.type === 'error') {
            setMcPrepError(event.msg || 'Unknown error')
            setMcGenerating(false)
            sse.close()
          }
        } catch { /* ignore parse */ }
      }

      sse.onerror = () => {
        setMcPrepError('SSE connection lost (server restarted?)')
        setMcGenerating(false)
        sse.close()
      }

      setTimeout(() => setMcGenerating(false), 20 * 60 * 1000)

    } catch (err) {
      setMcPrepError(err instanceof Error ? err.message : 'Generation error')
      setMcGenerating(false)
    }
  }

  // Helpers pour lire l'état des events MC Prep
  const mcSwapEvent = mcPrepEvents.find(e => e.type === 'step' && e.step === 'swap' && e.status === 'done')
  const mcSwapSkipped = mcPrepEvents.some(e => e.type === 'step' && e.step === 'swap' && e.status === 'skipped')
  const mcSwapStarted = mcPrepEvents.some(e => e.type === 'step' && e.step === 'swap' && e.status === 'started')
  const mcVariationsDone = mcPrepEvents.filter(e => e.type === 'variation')
  const mcUploadStarted = mcPrepEvents.some(e => e.type === 'step' && e.step === 'upload' && e.status === 'started')
  const mcUploadDone = mcPrepEvents.some(e => e.type === 'step' && e.step === 'upload' && e.status === 'done')
  const mcIsDone = mcPrepEvents.some(e => e.type === 'done')

  const mcSwapStatus = mcSwapEvent ? 'done' : mcSwapSkipped ? 'skipped' : mcSwapStarted ? 'running' : 'idle'
  const mcVariationsStatus = mcVariationsDone.length >= mcNumVariations ? 'done'
    : mcVariationsDone.length > 0 ? 'running'
    : (mcSwapEvent || mcSwapSkipped) ? 'running' : 'idle'
  const mcUploadStatus = mcUploadDone ? 'done' : mcUploadStarted ? 'running' : 'idle'

  const stepColor = (s: 'idle' | 'running' | 'done' | 'error' | 'skipped') =>
    s === 'done' ? 'text-emerald-500' : s === 'running' ? 'text-violet-600' : s === 'error' ? 'text-red-500' : s === 'skipped' ? 'text-amber-600' : 'text-gray-800'
  const stepIcon = (s: 'idle' | 'running' | 'done' | 'error' | 'skipped') =>
    s === 'done' ? '✅' : s === 'running' ? '⏳' : s === 'error' ? '❌' : s === 'skipped' ? '⚠️' : '○'

  // Fetch soul characters + reference elements on mount
  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const souls: SoulCharacter[] = data.soulCharacters || []
        setSoulCharacters(souls)
        if (souls.length) {
          setSelectedSoulId(souls[0].id)
          setSelectedSoulName(souls[0].name)
        }
        const els: RefElement[] = data.referenceElements || []
        setRefElements(els)
        if (els.length && !selectedElementId) {
          const preferred = els.find(e => e.type !== 'soul_2') || els[0]
          setSelectedElementId(preferred.id)
          setSelectedElementName(preferred.name)
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      mcSseRef.current?.close()
    }
  }, [])

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  const characterName = selectedSoulName || selectedElementName

  return (
    <div className="flex min-h-screen text-gray-900">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-2xl mx-auto px-8 py-10 space-y-8">

            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">🎭 Motion Control</h1>
              <p className="text-gray-700 text-sm mt-1">
                Prepare a Drive folder (video + frame + model swap + outfit variations) for manual Kling MC
              </p>
            </div>

            {/* Sélecteur de personnage */}
            {soulCharacters.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-800 uppercase tracking-wider">
                  Character <span className="normal-case font-normal text-gray-800">(Drive folder)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {soulCharacters.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedSoulId(s.id); setSelectedSoulName(s.name) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedSoulId === s.id
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : refElements.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-800 uppercase tracking-wider">Character</label>
                <div className="flex flex-wrap gap-2">
                  {refElements.map(el => (
                    <button
                      key={el.id}
                      onClick={() => { setSelectedElementId(el.id); setSelectedElementName(el.name) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedElementId === el.id
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      {el.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Tutorial video */}
            <TutorialVideo videoId="nO8e2riPWVY" title="MC Prep / Motion Control" />

            {/* Why MC Prep beats manual */}
            <div className="mb-6 bg-violet-50/80 backdrop-blur-sm rounded-2xl border border-violet-200/60 px-5 py-4">
              <h2 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <span>✨</span> Why MC Prep saves you time &amp; money
              </h2>
              <ul className="space-y-1.5 text-sm text-gray-700">
                <li>⚡ <span className="text-gray-900 font-medium">Fully automated</span> — frame extraction, AI face swap (Seedream 4.5 + InsightFace pixel transplant), N outfit variations, Drive upload in one click</li>
                <li>💰 <span className="text-gray-900 font-medium">Cheaper</span> — no manual credits wasted on wrong prompts compared to doing it yourself on Higgsfield</li>
                <li>👤 <span className="text-gray-900 font-medium">Better identity</span> — InsightFace pixel-perfect face transplant ensures Nina&apos;s exact face on every result, not an AI-generated lookalike</li>
                <li>🎭 <span className="text-gray-900 font-medium">8 distinct outfit styles</span> — sporty, party, casual, beach, elegant, lingerie, power, festival — cycled automatically per variation</li>
                <li>📁 <span className="text-gray-900 font-medium">Saves directly to Drive</span> — ready-to-use folder for Kling MC, no downloads or copy-pasting needed</li>
              </ul>
            </div>

            {/* ── MC Prep content ───────────────────────────────────────────────── */}
            <div className="space-y-5">

              {/* Étape 1 — Photo de référence du modèle */}
              <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">① Model reference photo</p>
                    <p className="text-xs text-gray-700 mt-0.5">Used by Nano Banana 2 to swap the person in the frame</p>
                  </div>
                  {mcModelPhotoPreview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mcModelPhotoPreview}
                      alt="Model reference"
                      className="w-14 h-14 rounded-xl object-cover border-2 border-violet-300 flex-shrink-0"
                    />
                  )}
                </div>

                <input
                  ref={modelPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleModelPhotoChange}
                />

                {mcModelPhotoPreview ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-emerald-600">✅ {mcModelPhotoName}</span>
                    <button
                      onClick={() => modelPhotoInputRef.current?.click()}
                      className="text-xs text-gray-800 hover:text-gray-900 transition underline"
                    >
                      Change photo
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => modelPhotoInputRef.current?.click()}
                    className="w-full py-3 rounded-xl text-sm border-2 border-dashed border-gray-200 text-gray-800 hover:border-violet-300 hover:text-gray-900 transition"
                  >
                    📷 Upload model reference photo
                  </button>
                )}
              </div>

              {/* Étape 2 — URL Instagram + extraction frames */}
              <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
                <p className="text-sm font-semibold text-gray-900">② Instagram Reel URL</p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={mcVideoUrl}
                    onChange={e => setMcVideoUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleExtractFrames() }}
                    placeholder="https://www.instagram.com/reel/..."
                    disabled={mcExtracting || mcGenerating}
                    className="flex-1 bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-800 outline-none focus:border-violet-400 transition disabled:opacity-50"
                  />
                  <button
                    onClick={handleExtractFrames}
                    disabled={!mcVideoUrl.trim() || mcExtracting || mcGenerating}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-white/80 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 transition flex-shrink-0 flex items-center gap-2"
                  >
                    {mcExtracting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                        Extracting…
                      </>
                    ) : '🎞 Extract frames'}
                  </button>
                </div>

                {mcExtractError && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    ❌ {mcExtractError}
                  </div>
                )}

                {/* Thumbnails de sélection de frame */}
                {mcFrames.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-700">Select a frame:</p>
                    <div className="grid grid-cols-4 gap-2">
                      {mcFrames.map(frame => (
                        <button
                          key={frame.index}
                          onClick={() => setMcSelectedFrame(frame.index)}
                          disabled={mcGenerating}
                          className={`relative rounded-xl overflow-hidden aspect-[9/16] border-2 transition ${
                            mcSelectedFrame === frame.index
                              ? 'border-violet-500 ring-2 ring-violet-500/30'
                              : 'border-gray-200 hover:border-slate-400'
                          } disabled:cursor-not-allowed`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={frame.url}
                            alt={`Frame at ${frame.timestamp}s`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center py-0.5">
                            <span className="text-[10px] text-white/80">{frame.timestamp}s</span>
                          </div>
                          {mcSelectedFrame === frame.index && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                              <span className="text-white text-[10px]">✓</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Étape 3 — Options */}
              {mcFrames.length > 0 && (
                <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
                  <p className="text-sm font-semibold text-gray-900">③ Options</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-xs text-gray-700 mb-1 block">Outfit variations</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={8}
                          value={mcNumVariations}
                          onChange={e => setMcNumVariations(parseInt(e.target.value))}
                          disabled={mcGenerating}
                          className="flex-1 accent-violet-500"
                        />
                        <span className="text-sm font-bold text-gray-900 w-4 text-center">{mcNumVariations}</span>
                      </div>
                    </div>
                    {characterName && (
                      <div className="text-xs text-gray-700">
                        Drive folder: <span className="text-gray-900">{characterName}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Erreur generate */}
              {mcPrepError && !mcGenerating && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  ❌ {mcPrepError}
                </div>
              )}

              {/* Progress */}
              {mcRunId && (
                <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
                  <p className="text-xs font-medium text-gray-800 uppercase tracking-wider mb-2">Progress</p>

                  {/* Swap */}
                  <div className="space-y-1">
                    <div className={`flex items-center gap-2 text-sm ${stepColor(mcSwapStatus)}`}>
                      <span className="w-5 text-center">{stepIcon(mcSwapStatus)}</span>
                      <span>Model swap (Seedream 4.5)</span>
                      {mcSwapEvent?.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mcSwapEvent.url} alt="Swap result" className="w-8 h-8 rounded-md object-cover ml-auto" />
                      )}
                    </div>
                    {mcSwapSkipped && (
                      <p className="text-xs text-amber-600 pl-7">
                        Swap skipped. Variations generated from original frame.
                      </p>
                    )}
                  </div>

                  {/* Variations */}
                  <div className={`flex items-center gap-2 text-sm ${stepColor(mcVariationsStatus)}`}>
                    <span className="w-5 text-center">{stepIcon(mcVariationsStatus)}</span>
                    <span>Outfit variations ({mcVariationsDone.length}/{mcNumVariations})</span>
                  </div>
                  {mcVariationsDone.length > 0 && (
                    <div className="flex gap-2 flex-wrap pl-7">
                      {mcVariationsDone.map(v => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={v.index}
                          src={v.url}
                          alt={`Outfit ${v.index}`}
                          className="w-14 h-14 rounded-lg object-cover border border-gray-200"
                        />
                      ))}
                      {mcVariationsDone.length < mcNumVariations && mcGenerating && (
                        <div className="w-14 h-14 rounded-lg bg-white/80 border border-gray-200 flex items-center justify-center">
                          <span className="text-gray-800 text-xs animate-pulse">⏳</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload */}
                  <div className={`flex items-center gap-2 text-sm ${stepColor(mcUploadStatus)}`}>
                    <span className="w-5 text-center">{stepIcon(mcUploadStatus)}</span>
                    <span>Uploading to Drive</span>
                  </div>

                  {/* Done */}
                  {mcIsDone && mcDriveUrl && (
                    <a
                      href={mcDriveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 mt-1 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition"
                    >
                      📂 Open Drive Folder ↗
                    </a>
                  )}

                  {/* Done but no drive URL (Drive not configured) */}
                  {mcIsDone && !mcDriveUrl && (
                    <div className="text-sm text-emerald-600 pt-1">
                      ✅ Generation complete (Drive not configured — connect it in Settings to auto-upload)
                    </div>
                  )}

                  {/* Error during generation */}
                  {mcPrepError && (
                    <div className="text-sm text-red-600 pt-1">❌ {mcPrepError}</div>
                  )}
                </div>
              )}

              {/* Bouton Generate */}
              {!mcIsDone && (
                <button
                  onClick={handleGenerate}
                  disabled={
                    !mcExtractId ||
                    mcSelectedFrame === null ||
                    (!mcModelPhotoPreview && !mcModelPhotoFile) ||
                    mcGenerating ||
                    mcExtracting
                  }
                  className="w-full py-4 rounded-xl font-semibold text-base transition
                    bg-gradient-to-br from-violet-600 to-violet-500 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] hover:from-violet-500 hover:to-violet-400 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {mcGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating prep folder…
                    </span>
                  ) : '🚀 Generate Prep Folder'}
                </button>
              )}

              {mcIsDone && (
                <button
                  onClick={() => {
                    setMcExtractId(null)
                    setMcFrames([])
                    setMcSelectedFrame(null)
                    setMcRunId(null)
                    setMcPrepEvents([])
                    setMcDriveUrl(null)
                    setMcPrepError('')
                    setMcVideoUrl('')
                  }}
                  className="w-full py-3 rounded-xl text-sm text-gray-800 hover:text-gray-900 transition"
                >
                  Prepare another reel
                </button>
              )}

              <p className="text-xs text-center text-gray-800">
                Seedream 4.5 (model swap) · Seedream 4.5 ({mcNumVariations} outfit variations) · Drive upload
              </p>
            </div>

          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
