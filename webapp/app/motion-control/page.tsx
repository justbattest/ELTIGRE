'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

// ─── Types communs ────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string; type?: string }
type SoulCharacter = { id: string; name: string; status?: string }

// ─── Types onglet "Upload manuel" ─────────────────────────────────────────────

type ManualConcept = {
  id: string
  folderName: string
  image: File | null
  video: File | null
  imgPreview: string | null
  vidPreview: string | null
  status: 'pending' | 'submitting' | 'submitted' | 'error'
  errorMsg?: string
}

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

// ─── Types onglet "Mes concepts" ──────────────────────────────────────────────

type SavedConcept = {
  id: string
  name: string | null
  sourceVideoUrl: string | null
  conceptImageUrl: string | null
  outfitImages: string[]
  elementId: string | null
  notes: string | null
  viewCount: number
  isFavorite: boolean
  createdAt: string
  localVideoPath: string | null
  _count: { runs: number }
}

// ─── Helpers "Upload manuel" ──────────────────────────────────────────────────

const isImageFile = (f: File) => f.type.startsWith('image/')
const isVideoFile = (f: File) => f.type.startsWith('video/')

function readDirectoryFiles(entry: FileSystemDirectoryEntry): Promise<{ files: File[]; name: string }> {
  return new Promise((resolve) => {
    const reader = entry.createReader()
    const files: File[] = []
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) { resolve({ files, name: entry.name }); return }
        const promises = entries.map(e => {
          if (e.isFile) {
            return new Promise<File[]>(res => (e as FileSystemFileEntry).file(f => res([f]), () => res([])))
          }
          return Promise.resolve<File[]>([])
        })
        Promise.all(promises).then(results => { files.push(...results.flat()); readBatch() })
      })
    }
    readBatch()
  })
}

function extractImageVideo(files: File[]): { image: File | null; video: File | null } {
  return { image: files.find(isImageFile) || null, video: files.find(isVideoFile) || null }
}

function makeConcept(folderName: string, image: File | null, video: File | null): ManualConcept {
  return {
    id: `${Date.now()}_${Math.random()}`,
    folderName, image, video,
    imgPreview: image ? URL.createObjectURL(image) : null,
    vidPreview: video ? URL.createObjectURL(video) : null,
    status: 'pending',
  }
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

// ─── Composant : ConceptRow (upload manuel) ────────────────────────────────────

function ConceptRow({ concept, onRemove }: { concept: ManualConcept; onRemove: () => void }) {
  const ok = !!concept.image && !!concept.video
  const statusIcon = { pending: ok ? '✅' : '⚠️', submitting: '⏳', submitted: '🚀', error: '❌' }[concept.status]
  return (
    <div className={`flex items-center gap-3 bg-zinc-900/60 border rounded-xl p-3 transition ${
      concept.status === 'submitted' ? 'border-emerald-800' :
      concept.status === 'error' ? 'border-red-800' :
      ok ? 'border-white/[0.08]' : 'border-yellow-800/50'
    }`}>
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
        {concept.imgPreview
          ? <img src={concept.imgPreview} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
          : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">📷</div>}
      </div>
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
        {concept.vidPreview
          ? <video src={concept.vidPreview} className="w-full h-full object-cover" muted playsInline autoPlay loop />
          : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">🎬</div>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{concept.folderName}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {!concept.image && !concept.video ? '⚠️ Image + video missing'
           : !concept.image ? '⚠️ Image missing'
           : !concept.video ? '⚠️ Video missing'
           : concept.status === 'error' ? `❌ ${concept.errorMsg}`
           : concept.status === 'submitted' ? '🚀 Run started'
           : concept.status === 'submitting' ? '⏳ Uploading…'
           : '✅ Ready · 4 videos will be generated'}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-lg">{statusIcon}</span>
        {concept.status === 'pending' && (
          <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition text-lg leading-none" title="Delete">×</button>
        )}
      </div>
    </div>
  )
}

// ─── Composant : AddZone ──────────────────────────────────────────────────────

function AddZone({ onAdd, disabled }: { onAdd: (concepts: ManualConcept[]) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const processItems = useCallback(async (items: DataTransferItemList) => {
    const newConcepts: ManualConcept[] = []
    for (const item of Array.from(items)) {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        const { files, name } = await readDirectoryFiles(entry as FileSystemDirectoryEntry)
        const { image, video } = extractImageVideo(files)
        if (image || video) newConcepts.push(makeConcept(name, image, video))
      } else {
        const f = item.getAsFile()
        if (f && isImageFile(f)) newConcepts.push(makeConcept(f.name, f, null))
        else if (f && isVideoFile(f)) newConcepts.push(makeConcept(f.name, null, f))
      }
    }
    if (newConcepts.length) onAdd(newConcepts)
  }, [onAdd])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (disabled) return
    processItems(e.dataTransfer.items)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return
    const files = Array.from(e.target.files)
    const folderMap = new Map<string, File[]>()
    for (const f of files) {
      const parts = f.webkitRelativePath?.split('/') || []
      const folder = parts.length > 1 ? parts[0] : '__root__'
      if (!folderMap.has(folder)) folderMap.set(folder, [])
      folderMap.get(folder)!.push(f)
    }
    const newConcepts: ManualConcept[] = []
    folderMap.forEach((folderFiles, folderName) => {
      const { image, video } = extractImageVideo(folderFiles)
      if (image || video) newConcepts.push(makeConcept(folderName === '__root__' ? 'Concept' : folderName, image, video))
    })
    if (newConcepts.length) onAdd(newConcepts)
    e.target.value = ''
  }

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition select-none
        ${disabled ? 'opacity-40 cursor-not-allowed' : dragging ? 'border-violet-400 bg-violet-900/20' : 'border-white/[0.08] hover:border-white/[0.20] bg-zinc-900/40'}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" multiple
        // @ts-expect-error webkitdirectory non-standard
        webkitdirectory="" className="hidden" onChange={handleInputChange} />
      <p className="text-3xl mb-2">📁</p>
      <p className="text-sm font-medium text-zinc-300">Drop your folders here</p>
      <p className="text-xs text-zinc-500 mt-1">As many folders as you want — each folder = 1 image + 1 video = 4 videos generated</p>
      <p className="text-xs text-zinc-600 mt-1">or click to select</p>
    </div>
  )
}

// ─── Composant : carte concept (bibliothèque) ─────────────────────────────────

function ConceptCard({
  concept,
  onLaunch,
  onToggleFav,
  onRename,
  onDelete,
}: {
  concept: SavedConcept
  onLaunch: () => void
  onToggleFav: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(concept.name || '')
  const inputRef = useRef<HTMLInputElement>(null)

  const outfits: string[] = Array.isArray(concept.outfitImages)
    ? (concept.outfitImages as unknown[]).filter(x => typeof x === 'string') as string[]
    : []

  const createdDate = new Date(concept.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })

  const handleRenameSubmit = () => {
    const name = editName.trim()
    if (name && name !== concept.name) onRename(name)
    setEditing(false)
  }

  return (
    <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl overflow-hidden hover:border-white/[0.15] transition group">
      <div className="grid grid-cols-2 gap-0.5 bg-black aspect-square">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-zinc-950 overflow-hidden">
            {outfits[i]
              ? <img src={outfits[i]} alt={`Outfit ${i + 1}`} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
              : concept.conceptImageUrl
                ? <img src={concept.conceptImageUrl} alt="concept" className="w-full h-full object-cover opacity-40" /> // eslint-disable-line @next/next/no-img-element
                : <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">📷</div>
            }
          </div>
        ))}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <input
              ref={inputRef}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setEditing(false) }}
              autoFocus
              className="flex-1 bg-zinc-800 border border-violet-500 rounded px-2 py-0.5 text-sm text-white outline-none"
            />
          ) : (
            <p className="flex-1 text-sm font-medium text-white truncate">
              {concept.name || <span className="text-zinc-500">{createdDate}</span>}
            </p>
          )}
          <button onClick={() => setEditing(true)} className="text-zinc-600 hover:text-zinc-300 transition text-xs flex-shrink-0" title="Rename">✎</button>
          <button
            onClick={onToggleFav}
            className={`text-sm flex-shrink-0 transition ${concept.isFavorite ? 'text-yellow-400' : 'text-zinc-600 hover:text-yellow-400'}`}
            title={concept.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >★</button>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>📅 {createdDate}</span>
          {concept.viewCount > 0 && <span>👁 {concept.viewCount} run{concept.viewCount > 1 ? 's' : ''}</span>}
          {concept._count.runs > 0 && <span>🎬 {concept._count.runs} MC</span>}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onLaunch} className="flex-1 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition">▶ Launch MC</button>
          <button onClick={onDelete} className="px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-red-400 hover:bg-red-900/20 border border-white/[0.06] transition" title="Delete">🗑</button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

type Tab = 'url' | 'library' | 'manual'

export default function MotionControlPage() {
  const router = useRouter()

  // Onglet actif
  const [tab, setTab] = useState<Tab>('url')

  // Données partagées (character selection)
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [soulCharacters, setSoulCharacters] = useState<SoulCharacter[]>([])
  const [selectedSoulId, setSelectedSoulId] = useState('')
  const [selectedSoulName, setSelectedSoulName] = useState('')

  // ── Onglet MC Prep (url) ─────────────────────────────────────────────────────
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
    s === 'done' ? 'text-emerald-400' : s === 'running' ? 'text-violet-300' : s === 'error' ? 'text-red-400' : s === 'skipped' ? 'text-amber-400' : 'text-zinc-600'
  const stepIcon = (s: 'idle' | 'running' | 'done' | 'error' | 'skipped') =>
    s === 'done' ? '✅' : s === 'running' ? '⏳' : s === 'error' ? '❌' : s === 'skipped' ? '⚠️' : '○'

  // ── Onglet "Mes concepts" ────────────────────────────────────────────────────
  const [concepts, setConcepts] = useState<SavedConcept[]>([])
  const [libLoading, setLibLoading] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [libFavOnly, setLibFavOnly] = useState(false)
  const [launchingConceptId, setLaunchingConceptId] = useState<string | null>(null)
  const [confirmConcept, setConfirmConcept] = useState<SavedConcept | null>(null)

  // ── Onglet "Upload manuel" ───────────────────────────────────────────────────
  const [manualConcepts, setManualConcepts] = useState<ManualConcept[]>([])
  const [launching, setLaunching] = useState(false)
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null)

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

  // Charger la bibliothèque quand on passe sur l'onglet library
  useEffect(() => {
    if (tab !== 'library') return
    loadLibrary()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const loadLibrary = useCallback(() => {
    setLibLoading(true)
    const params = new URLSearchParams()
    if (libSearch) params.set('search', libSearch)
    if (libFavOnly) params.set('favorite', 'true')
    fetch(`/api/motion-concept/list?${params}`)
      .then(r => r.json())
      .then(data => setConcepts(data.concepts || []))
      .catch(() => {})
      .finally(() => setLibLoading(false))
  }, [libSearch, libFavOnly])

  // Cleanup SSE + object URLs
  useEffect(() => {
    return () => {
      mcSseRef.current?.close()
      manualConcepts.forEach(c => {
        if (c.imgPreview) URL.revokeObjectURL(c.imgPreview)
        if (c.vidPreview) URL.revokeObjectURL(c.vidPreview)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Onglet 2 : Bibliothèque ───────────────────────────────────────────────

  const handleToggleFav = async (concept: SavedConcept) => {
    await fetch(`/api/motion-concept/${concept.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !concept.isFavorite }),
    })
    setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, isFavorite: !c.isFavorite } : c))
  }

  const handleRename = async (concept: SavedConcept, name: string) => {
    await fetch(`/api/motion-concept/${concept.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, name } : c))
  }

  const handleDelete = async (concept: SavedConcept) => {
    if (!confirm(`Delete concept "${concept.name || concept.id}"?`)) return
    await fetch(`/api/motion-concept/${concept.id}`, { method: 'DELETE' })
    setConcepts(prev => prev.filter(c => c.id !== concept.id))
  }

  const handleLaunchFromLibrary = async (concept: SavedConcept) => {
    setConfirmConcept(null)
    setLaunchingConceptId(concept.id)
    try {
      const res = await fetch('/api/motion-control/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id, characterName: selectedSoulName || selectedElementName }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`)
      setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, viewCount: c.viewCount + 1 } : c))
      await new Promise(r => setTimeout(r, 600))
      router.push('/en-cours')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'MC launch error')
      setLaunchingConceptId(null)
    }
  }

  const filteredConcepts = concepts.filter(c => {
    if (libFavOnly && !c.isFavorite) return false
    if (libSearch && !(c.name || '').toLowerCase().includes(libSearch.toLowerCase())) return false
    return true
  })

  // ── Onglet 3 : Upload manuel ─────────────────────────────────────────────────

  const handleAdd = useCallback((newConcepts: ManualConcept[]) => {
    setManualConcepts(prev => [...prev, ...newConcepts])
  }, [])

  const handleRemove = (id: string) => {
    setManualConcepts(prev => {
      const removed = prev.find(c => c.id === id)
      if (removed?.imgPreview) URL.revokeObjectURL(removed.imgPreview)
      if (removed?.vidPreview) URL.revokeObjectURL(removed.vidPreview)
      return prev.filter(c => c.id !== id)
    })
  }

  const readyConcepts = manualConcepts.filter(c => c.image && c.video && c.status === 'pending')
  const canLaunch = readyConcepts.length > 0 && !launching

  const handleLaunchManual = async () => {
    if (!canLaunch) return
    setLaunching(true)
    setSubmitProgress({ done: 0, total: readyConcepts.length })
    let done = 0
    for (const concept of readyConcepts) {
      setManualConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'submitting' } : c))
      try {
        const fd = new FormData()
        fd.append('image', concept.image!)
        fd.append('video', concept.video!)
        const charName = selectedSoulName || selectedElementName
        if (charName) fd.append('characterName', charName)
        const res = await fetch('/api/motion-control/start', { method: 'POST', body: fd })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Error ${res.status}`)
        }
        setManualConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'submitted' } : c))
        done++
        setSubmitProgress({ done, total: readyConcepts.length })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unknown error'
        setManualConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'error', errorMsg: msg } : c))
      }
    }
    await new Promise(r => setTimeout(r, 800))
    router.push('/en-cours')
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────────

  const TAB_LABELS: { key: Tab; label: string }[] = [
    { key: 'url', label: '🔧 MC Prep' },
    { key: 'library', label: '🎬 My concepts' },
    { key: 'manual', label: '📁 Manual upload' },
  ]

  const characterName = selectedSoulName || selectedElementName

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-2xl mx-auto px-8 py-10 space-y-8">

            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-white">🎭 Motion Control</h1>
              <p className="text-zinc-400 text-sm mt-1">
                Prepare a Drive folder (video + frame + model swap + outfit variations) for manual Kling MC
              </p>
            </div>

            {/* Sélecteur de personnage — partagé entre tous les onglets */}
            {soulCharacters.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Character <span className="normal-case font-normal text-zinc-600">(Drive folder)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {soulCharacters.map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedSoulId(s.id); setSelectedSoulName(s.name) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedSoulId === s.id
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:border-white/[0.20]'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : refElements.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Character</label>
                <div className="flex flex-wrap gap-2">
                  {refElements.map(el => (
                    <button
                      key={el.id}
                      onClick={() => { setSelectedElementId(el.id); setSelectedElementName(el.name) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedElementId === el.id
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:border-white/[0.20]'
                      }`}
                    >
                      {el.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Onglets */}
            <div className="flex gap-1 bg-zinc-900/60 border border-white/[0.06] rounded-xl p-1">
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                    tab === key
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Onglet 1 : MC Prep ───────────────────────────────────────────── */}
            {tab === 'url' && (
              <div className="space-y-5">

                {/* Étape 1 — Photo de référence du modèle */}
                <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">① Model reference photo</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Used by Nano Banana 2 to swap the person in the frame</p>
                    </div>
                    {mcModelPhotoPreview && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mcModelPhotoPreview}
                        alt="Model reference"
                        className="w-14 h-14 rounded-xl object-cover border-2 border-violet-500/60 flex-shrink-0"
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
                      <span className="text-xs text-emerald-400">✅ {mcModelPhotoName}</span>
                      <button
                        onClick={() => modelPhotoInputRef.current?.click()}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition underline"
                      >
                        Change photo
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => modelPhotoInputRef.current?.click()}
                      className="w-full py-3 rounded-xl text-sm border-2 border-dashed border-white/[0.12] text-zinc-400 hover:border-violet-500/50 hover:text-zinc-200 transition"
                    >
                      📷 Upload model reference photo
                    </button>
                  )}
                </div>

                {/* Étape 2 — URL Instagram + extraction frames */}
                <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-white">② Instagram Reel URL</p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={mcVideoUrl}
                      onChange={e => setMcVideoUrl(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleExtractFrames() }}
                      placeholder="https://www.instagram.com/reel/..."
                      disabled={mcExtracting || mcGenerating}
                      className="flex-1 bg-zinc-800/80 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition disabled:opacity-50"
                    />
                    <button
                      onClick={handleExtractFrames}
                      disabled={!mcVideoUrl.trim() || mcExtracting || mcGenerating}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition flex-shrink-0 flex items-center gap-2"
                    >
                      {mcExtracting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Extracting…
                        </>
                      ) : '🎞 Extract frames'}
                    </button>
                  </div>

                  {mcExtractError && (
                    <div className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2">
                      ❌ {mcExtractError}
                    </div>
                  )}

                  {/* Thumbnails de sélection de frame */}
                  {mcFrames.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500">Select a frame:</p>
                      <div className="grid grid-cols-4 gap-2">
                        {mcFrames.map(frame => (
                          <button
                            key={frame.index}
                            onClick={() => setMcSelectedFrame(frame.index)}
                            disabled={mcGenerating}
                            className={`relative rounded-xl overflow-hidden aspect-[9/16] border-2 transition ${
                              mcSelectedFrame === frame.index
                                ? 'border-violet-500 ring-2 ring-violet-500/30'
                                : 'border-white/[0.08] hover:border-white/[0.30]'
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
                  <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-semibold text-white">③ Options</p>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="text-xs text-zinc-500 mb-1 block">Outfit variations</label>
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
                          <span className="text-sm font-bold text-white w-4 text-center">{mcNumVariations}</span>
                        </div>
                      </div>
                      {characterName && (
                        <div className="text-xs text-zinc-500">
                          Drive folder: <span className="text-zinc-300">{characterName}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Erreur generate */}
                {mcPrepError && !mcGenerating && (
                  <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
                    ❌ {mcPrepError}
                  </div>
                )}

                {/* Progress */}
                {mcRunId && (
                  <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-5 space-y-3">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Progress</p>

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
                        <p className="text-xs text-amber-500/80 pl-7">
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
                            className="w-14 h-14 rounded-lg object-cover border border-white/[0.08]"
                          />
                        ))}
                        {mcVariationsDone.length < mcNumVariations && mcGenerating && (
                          <div className="w-14 h-14 rounded-lg bg-zinc-800 border border-white/[0.05] flex items-center justify-center">
                            <span className="text-zinc-600 text-xs animate-pulse">⏳</span>
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
                        className="flex items-center justify-center gap-2 w-full py-3 mt-1 rounded-xl font-semibold text-sm bg-emerald-700 hover:bg-emerald-600 text-white transition"
                      >
                        📂 Open Drive Folder ↗
                      </a>
                    )}

                    {/* Done but no drive URL (Drive not configured) */}
                    {mcIsDone && !mcDriveUrl && (
                      <div className="text-sm text-emerald-400 pt-1">
                        ✅ Generation complete (Drive not configured — connect it in Settings to auto-upload)
                      </div>
                    )}

                    {/* Error during generation */}
                    {mcPrepError && (
                      <div className="text-sm text-red-400 pt-1">❌ {mcPrepError}</div>
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
                      bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white
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
                    className="w-full py-3 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 transition"
                  >
                    Prepare another reel
                  </button>
                )}

                <p className="text-xs text-center text-zinc-600">
                  Seedream 4.5 (model swap) · Seedream 4.5 ({mcNumVariations} outfit variations) · Drive upload
                </p>
              </div>
            )}

            {/* ── Onglet 2 : Mes concepts ──────────────────────────────────────── */}
            {tab === 'library' && (
              <div className="space-y-5">
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={libSearch}
                    onChange={e => setLibSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadLibrary() }}
                    placeholder="Search…"
                    className="flex-1 bg-zinc-900/80 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition"
                  />
                  <button
                    onClick={() => { setLibFavOnly(!libFavOnly) }}
                    className={`px-3 py-2.5 rounded-xl text-sm border transition ${
                      libFavOnly
                        ? 'bg-yellow-600/20 border-yellow-500/50 text-yellow-400'
                        : 'bg-white/[0.05] border-white/[0.08] text-zinc-400 hover:border-white/[0.20]'
                    }`}
                    title="Favorites only"
                  >★</button>
                  <button
                    onClick={loadLibrary}
                    className="px-3 py-2.5 rounded-xl text-sm border border-white/[0.08] bg-white/[0.05] text-zinc-400 hover:text-white transition"
                  >🔄</button>
                </div>

                {libLoading ? (
                  <div className="text-center text-zinc-500 py-12">Loading…</div>
                ) : filteredConcepts.length === 0 ? (
                  <div className="text-center text-zinc-600 py-12">
                    <p className="text-4xl mb-3">🎬</p>
                    <p className="text-sm">No concepts yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {filteredConcepts.map(concept => (
                      <ConceptCard
                        key={concept.id}
                        concept={concept}
                        onLaunch={() => setConfirmConcept(concept)}
                        onToggleFav={() => handleToggleFav(concept)}
                        onRename={name => handleRename(concept, name)}
                        onDelete={() => handleDelete(concept)}
                      />
                    ))}
                  </div>
                )}

                {confirmConcept && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-white/[0.10] rounded-2xl p-6 max-w-sm w-full space-y-4">
                      <h3 className="text-base font-semibold text-white">Launch Motion Control</h3>
                      <p className="text-sm text-zinc-400">
                        Launch 4 × Kling 3.0 Motion Control for concept
                        <strong className="text-white"> «&nbsp;{confirmConcept.name || confirmConcept.id.slice(0, 8)}&nbsp;»</strong>?
                        The Seedream phase will be skipped.
                      </p>
                      {(() => {
                        const outfits: string[] = Array.isArray(confirmConcept.outfitImages)
                          ? (confirmConcept.outfitImages as unknown[]).filter(x => typeof x === 'string') as string[]
                          : []
                        return outfits.length > 0 ? (
                          <div className="flex gap-1.5">
                            {outfits.slice(0, 4).map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={url} alt={`Outfit ${i + 1}`} className="flex-1 aspect-square rounded-lg object-cover" />
                            ))}
                          </div>
                        ) : null
                      })()}
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => setConfirmConcept(null)}
                          className="flex-1 py-2.5 rounded-xl text-sm border border-white/[0.08] text-zinc-400 hover:text-white transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleLaunchFromLibrary(confirmConcept)}
                          disabled={launchingConceptId === confirmConcept.id}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
                        >
                          {launchingConceptId === confirmConcept.id ? '⏳ Launching…' : '▶ Launch'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Onglet 3 : Upload manuel ─────────────────────────────────────── */}
            {tab === 'manual' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Concepts <span className="text-gray-600 normal-case font-normal">(1 folder = 1 image + 1 video = 4 videos generated)</span>
                  </label>
                  <AddZone onAdd={handleAdd} disabled={launching} />
                </div>

                {manualConcepts.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                        {manualConcepts.length} concept{manualConcepts.length > 1 ? 's' : ''} · {readyConcepts.length} ready
                      </span>
                      {!launching && (
                        <button
                          onClick={() => {
                            manualConcepts.forEach(c => {
                              if (c.imgPreview) URL.revokeObjectURL(c.imgPreview)
                              if (c.vidPreview) URL.revokeObjectURL(c.vidPreview)
                            })
                            setManualConcepts([])
                          }}
                          className="text-xs text-gray-600 hover:text-red-400 transition"
                        >
                          Delete all
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {manualConcepts.map(c => (
                        <ConceptRow key={c.id} concept={c} onRemove={() => handleRemove(c.id)} />
                      ))}
                    </div>
                  </div>
                )}

                {submitProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Submitting runs…</span>
                      <span>{submitProgress.done}/{submitProgress.total}</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handleLaunchManual}
                  disabled={!canLaunch}
                  className="w-full py-4 rounded-xl font-semibold text-base transition
                    bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {launching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Launching {submitProgress ? `${submitProgress.done}/${submitProgress.total}` : ''}…
                    </span>
                  ) : readyConcepts.length === 0 ? (
                    'Drop folders to get started'
                  ) : (
                    `Generate ${readyConcepts.length * 4} videos (${readyConcepts.length} batch${readyConcepts.length > 1 ? 'es' : ''} × 4)`
                  )}
                </button>

                {readyConcepts.length > 0 && !launching && (
                  <p className="text-xs text-center text-zinc-600">
                    Each batch generates 4 outfits via Seedream + 4 videos via Kling · Everything runs in the background
                  </p>
                )}
              </div>
            )}

          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
