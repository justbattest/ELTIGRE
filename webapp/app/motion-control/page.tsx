'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

// ─── Types communs ────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string; type?: string }
type SoulCharacter = { id: string; name: string; status?: string }

// ─── Types onglet "MC Prep" (batch mode) ─────────────────────────────────────

type BatchEvent = {
  type: string
  videoIndex?: number
  step?: string
  status?: string
  source?: string
  url?: string
  driveUrl?: string
  drive_url?: string
  index?: number
  total?: number
  msg?: string
  totalVideos?: number
  completed?: number
  failed?: number
  phase?: string
}

type VideoStatus = {
  source: string
  extract: 'idle' | 'running' | 'done' | 'error'
  swap: 'idle' | 'running' | 'done' | 'error'
  swapUrl?: string
  variationsDone: number
  variationsTotal: number
  variations: 'idle' | 'running' | 'done' | 'error'
  upload: 'idle' | 'running' | 'done' | 'error'
  driveUrl?: string
  error?: string
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

  // ── Onglet MC Prep (batch mode) ──────────────────────────────────────────────
  const modelPhotoInputRef = useRef<HTMLInputElement>(null)
  const batchSseRef = useRef<EventSource | null>(null)
  const videoDropRef = useRef<HTMLInputElement>(null)

  const [mcModelPhotoPreview, setMcModelPhotoPreview] = useState<string | null>(null)
  const [mcModelPhotoName, setMcModelPhotoName] = useState<string>('model_reference.jpg')
  const [mcModelPhotoFile, setMcModelPhotoFile] = useState<File | null>(null)
  const [mcNumVariations, setMcNumVariations] = useState(4)

  const [batchUrlText, setBatchUrlText] = useState('')
  const [batchFiles, setBatchFiles] = useState<{file: File, name: string}[]>([])
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [batchRunId, setBatchRunId] = useState<string | null>(null)
  const [batchEvents, setBatchEvents] = useState<BatchEvent[]>([])
  const [batchTotalItems, setBatchTotalItems] = useState(0)
  const [batchDone, setBatchDone] = useState(false)
  const [batchError, setBatchError] = useState('')

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

  // Derived state: per-video status computed from batch events
  const videoStatuses = useMemo(() => {
    const map: Record<number, VideoStatus> = {}
    for (const evt of batchEvents) {
      const vi = evt.videoIndex
      if (vi === undefined) continue
      if (!map[vi]) map[vi] = { source: '', extract: 'idle', swap: 'idle', swapUrl: undefined, variationsDone: 0, variationsTotal: mcNumVariations, variations: 'idle', upload: 'idle' }
      const s = map[vi]
      if (evt.type === 'extract') {
        if (evt.status === 'started') { s.extract = 'running'; s.source = evt.source || '' }
        else if (evt.status === 'done') s.extract = 'done'
        else if (evt.status === 'error') { s.extract = 'error'; s.error = evt.msg }
      }
      if (evt.type === 'step' && evt.step === 'swap') {
        if (evt.status === 'started') s.swap = 'running'
        else if (evt.status === 'done') { s.swap = 'done'; s.swapUrl = evt.url }
        else if (evt.status === 'error') s.swap = 'error'
      }
      if (evt.type === 'variation') {
        s.variations = 'running'
        s.variationsDone = Math.max(s.variationsDone, evt.index || 0)
      }
      if (evt.type === 'step' && evt.step === 'upload') {
        if (evt.status === 'started') s.upload = 'running'
        else if (evt.status === 'done') s.upload = 'done'
      }
      if (evt.type === 'video_complete') {
        s.variations = 'done'
        s.upload = 'done'
        s.driveUrl = evt.driveUrl || evt.drive_url
      }
    }
    return map
  }, [batchEvents, mcNumVariations])

  const dotColor = (s: string) =>
    s === 'done' ? 'text-emerald-500' : s === 'running' ? 'text-violet-500 animate-pulse' : s === 'error' ? 'text-red-400' : 'text-gray-300'

  const handleBatchGenerate = async () => {
    const urls = batchUrlText.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
    const totalItems = urls.length + batchFiles.length
    if (totalItems === 0) return
    if (!mcModelPhotoPreview && !mcModelPhotoFile) {
      setBatchError('Upload a model reference photo first.')
      return
    }

    setBatchGenerating(true)
    setBatchError('')
    setBatchEvents([])
    setBatchDone(false)
    setBatchTotalItems(totalItems)

    try {
      const photoFile = mcModelPhotoFile || dataUrlToFile(mcModelPhotoPreview!, mcModelPhotoName)

      const fd = new FormData()
      fd.append('urls', JSON.stringify(urls))
      fd.append('modelPhoto', photoFile, mcModelPhotoName)
      fd.append('numVariations', String(mcNumVariations))
      fd.append('characterName', selectedSoulName || selectedElementName || '')

      for (const item of batchFiles) {
        fd.append('videoFiles', item.file, item.name)
      }

      const res = await fetch('/api/mc-prep/batch', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)

      setBatchRunId(data.runId)
      setBatchTotalItems(data.totalItems || totalItems)

      // SSE
      batchSseRef.current?.close()
      const sse = new EventSource(`/api/mc-prep/events/${data.runId}`)
      batchSseRef.current = sse

      sse.onmessage = (e) => {
        try {
          const event: BatchEvent = JSON.parse(e.data)
          setBatchEvents(prev => [...prev, event])
          if (event.type === 'done') {
            setBatchDone(true)
            setBatchGenerating(false)
            sse.close()
          }
          if (event.type === 'error' && event.videoIndex === undefined) {
            setBatchError(event.msg || 'Unknown error')
            setBatchGenerating(false)
            sse.close()
          }
        } catch { /* ignore parse */ }
      }
      sse.onerror = () => {
        setBatchError('SSE connection lost (server restarted?)')
        setBatchGenerating(false)
        sse.close()
      }
      // Safety timeout: 45 min for large batches
      setTimeout(() => setBatchGenerating(false), 45 * 60 * 1000)
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Batch error')
      setBatchGenerating(false)
    }
  }

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
      batchSseRef.current?.close()
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

              {/* Étape 2 — Batch video input (URLs + file uploads) */}
              <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-3">
                <p className="text-sm font-semibold text-gray-900">② Add videos</p>

                {/* URL textarea */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-700">Instagram Reel URLs (one per line)</label>
                  <textarea
                    value={batchUrlText}
                    onChange={e => setBatchUrlText(e.target.value)}
                    disabled={batchGenerating}
                    placeholder={"https://www.instagram.com/reel/abc...\nhttps://www.instagram.com/reel/xyz..."}
                    rows={4}
                    className="w-full bg-white border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 transition disabled:opacity-50 resize-none font-mono"
                  />
                </div>

                {/* File drop zone */}
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-700">Or upload video files</label>
                  <input
                    ref={videoDropRef}
                    type="file"
                    accept="video/mp4,video/quicktime,.mp4,.mov"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || [])
                      setBatchFiles(prev => [...prev, ...files.map(f => ({ file: f, name: f.name }))])
                      e.target.value = ''
                    }}
                  />
                  <button
                    onClick={() => videoDropRef.current?.click()}
                    disabled={batchGenerating}
                    className="w-full py-3 rounded-xl text-sm border-2 border-dashed border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-600 transition disabled:opacity-50"
                  >
                    Click to select videos (.mp4, .mov)
                  </button>
                </div>

                {/* Items list */}
                {(() => {
                  const urls = batchUrlText.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
                  const total = urls.length + batchFiles.length
                  if (total === 0) return null
                  return (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-700 font-medium">{total} video{total > 1 ? 's' : ''} ready</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {urls.map((url, i) => (
                          <div key={`url-${i}`} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">
                            <span className="text-violet-500">🔗</span>
                            <span className="truncate flex-1">{url}</span>
                          </div>
                        ))}
                        {batchFiles.map((f, i) => (
                          <div key={`file-${i}`} className="flex items-center gap-2 text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5">
                            <span className="text-violet-500">🎬</span>
                            <span className="truncate flex-1">{f.name}</span>
                            <button onClick={() => setBatchFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 transition">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Étape 3 — Options */}
              {(batchUrlText.split('\n').some(l => l.trim().startsWith('http')) || batchFiles.length > 0) && !batchDone && (
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
                          disabled={batchGenerating}
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

              {/* Batch error */}
              {batchError && !batchGenerating && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                  {batchError}
                </div>
              )}

              {/* Batch progress */}
              {batchRunId && (
                <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] space-y-4">
                  {/* Overall progress */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-gray-800 uppercase tracking-wider">Batch Progress</p>
                    <span className="text-sm font-semibold text-gray-900">
                      {Object.values(videoStatuses).filter(v => v.driveUrl).length}/{batchTotalItems} complete
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-violet-600 rounded-full h-2 transition-all duration-500"
                      style={{ width: `${(Object.values(videoStatuses).filter(v => v.driveUrl).length / Math.max(batchTotalItems, 1)) * 100}%` }}
                    />
                  </div>

                  {/* Per-video rows */}
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(videoStatuses)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([idx, vs]) => (
                        <div key={idx} className="flex items-center gap-2 text-xs bg-gray-50/80 rounded-xl px-3 py-2">
                          <span className="text-gray-700 font-medium w-5 text-center">{Number(idx) + 1}</span>
                          <span className="truncate flex-1 text-gray-600" title={vs.source}>{vs.source ? (vs.source.length > 40 ? '...' + vs.source.slice(-37) : vs.source) : `Video ${Number(idx) + 1}`}</span>
                          {/* Status dots */}
                          <span title="Extract" className={dotColor(vs.extract)}>●</span>
                          <span title="Swap" className={dotColor(vs.swap)}>●</span>
                          <span title={`Variations ${vs.variationsDone}/${vs.variationsTotal}`} className={dotColor(vs.variations)}>
                            {vs.variations === 'running' ? `${vs.variationsDone}/${vs.variationsTotal}` : '●'}
                          </span>
                          <span title="Upload" className={dotColor(vs.upload)}>●</span>
                          {vs.driveUrl ? (
                            <a href={vs.driveUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-600">📂</a>
                          ) : vs.error ? (
                            <span title={vs.error} className="text-red-400">⚠</span>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Launch button */}
              {!batchDone && (
                <button
                  onClick={handleBatchGenerate}
                  disabled={
                    (batchUrlText.split('\n').every(l => !l.trim().startsWith('http')) && batchFiles.length === 0) ||
                    (!mcModelPhotoPreview && !mcModelPhotoFile) ||
                    batchGenerating
                  }
                  className="w-full py-4 rounded-xl font-semibold text-base transition
                    bg-gradient-to-br from-violet-600 to-violet-500 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] hover:from-violet-500 hover:to-violet-400 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {batchGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Processing batch...
                    </span>
                  ) : (() => {
                    const count = batchUrlText.split('\n').filter(l => l.trim().startsWith('http')).length + batchFiles.length
                    return `🚀 Generate ${count || ''} Prep Folder${count > 1 ? 's' : ''}`
                  })()}
                </button>
              )}

              {batchDone && (
                <button
                  onClick={() => {
                    setBatchUrlText('')
                    setBatchFiles([])
                    setBatchRunId(null)
                    setBatchEvents([])
                    setBatchDone(false)
                    setBatchError('')
                    setBatchTotalItems(0)
                  }}
                  className="w-full py-3 rounded-xl text-sm text-gray-600 hover:text-gray-900 transition"
                >
                  Prepare another batch
                </button>
              )}

              <p className="text-xs text-center text-gray-600">
                Seedream 4.5 (swap) · Seedream 4.5 ({mcNumVariations} outfit variations) · auto-upload to Drive
              </p>
            </div>

          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
