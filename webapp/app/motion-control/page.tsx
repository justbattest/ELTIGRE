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

// ─── Types onglet "Depuis URL" ────────────────────────────────────────────────

type ConceptStep = 'download' | 'frames' | 'swap' | 'outfits'
type StepStatus = 'idle' | 'running' | 'done' | 'error'

type BuildState = {
  runId: string
  steps: Record<ConceptStep, StepStatus>
  outfitUrls: string[]
  conceptImageUrl: string | null
  conceptId: string | null
  chosenFrameT: number | null
  error: string | null
  // Phase MC (auto-lancée après concept_done)
  mcLaunching: boolean
  mcLaunched: boolean
  mcError: string | null
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

// ─── Composant : indicateur d'étape ──────────────────────────────────────────

const STEP_LABELS: Record<ConceptStep, string> = {
  download: 'Downloading video',
  frames: 'Auto frame selection',
  swap: 'Person swap (soul_cinematic)',
  outfits: 'Generating 4 outfits',
}

function StepIndicator({ step, status, extra }: { step: ConceptStep; status: StepStatus; extra?: string }) {
  const icon = status === 'done' ? '✅' : status === 'running' ? '⏳' : status === 'error' ? '❌' : '○'
  return (
    <div className={`flex items-center gap-2 text-sm transition ${
      status === 'idle' ? 'text-zinc-600' :
      status === 'running' ? 'text-violet-300' :
      status === 'done' ? 'text-emerald-400' : 'text-red-400'
    }`}>
      <span className="w-5 text-center">{icon}</span>
      <span>{STEP_LABELS[step]}</span>
      {extra && <span className="text-zinc-500 text-xs ml-1">{extra}</span>}
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
      {/* Outfit grid 2×2 */}
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

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Name row */}
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
          <button
            onClick={() => setEditing(true)}
            className="text-zinc-600 hover:text-zinc-300 transition text-xs flex-shrink-0"
            title="Rename"
          >✎</button>
          <button
            onClick={onToggleFav}
            className={`text-sm flex-shrink-0 transition ${concept.isFavorite ? 'text-yellow-400' : 'text-zinc-600 hover:text-yellow-400'}`}
            title={concept.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >★</button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>📅 {createdDate}</span>
          {concept.viewCount > 0 && <span>👁 {concept.viewCount} run{concept.viewCount > 1 ? 's' : ''}</span>}
          {concept._count.runs > 0 && <span>🎬 {concept._count.runs} MC</span>}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onLaunch}
            className="flex-1 py-2 rounded-lg text-xs font-semibold bg-violet-600 hover:bg-violet-500 text-white transition"
          >▶ Launch MC</button>
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-lg text-xs text-zinc-500 hover:text-red-400 hover:bg-red-900/20 border border-white/[0.06] transition"
            title="Delete"
          >🗑</button>
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

  // Données partagées
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')

  // Soul characters pour le concept builder (soul_cinematic swap)
  const [soulCharacters, setSoulCharacters] = useState<SoulCharacter[]>([])
  const [selectedSoulId, setSelectedSoulId] = useState('')
  const [selectedSoulName, setSelectedSoulName] = useState('')

  // ── Onglet "Depuis URL" ──────────────────────────────────────────────────────
  const [videoUrl, setVideoUrl] = useState('')
  const [conceptName, setConceptName] = useState('')
  const [buildState, setBuildState] = useState<BuildState | null>(null)
  const [building, setBuilding] = useState(false)
  const [buildError, setBuildError] = useState('')
  const sseRef = useRef<EventSource | null>(null)

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
        // Soul characters → concept builder (soul_cinematic swap)
        const souls: SoulCharacter[] = data.soulCharacters || []
        setSoulCharacters(souls)
        if (souls.length) {
          setSelectedSoulId(souls[0].id)
          setSelectedSoulName(souls[0].name)
        }

        // Reference elements → upload manuel + bibliothèque (si besoin)
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
      sseRef.current?.close()
      manualConcepts.forEach(c => {
        if (c.imgPreview) URL.revokeObjectURL(c.imgPreview)
        if (c.vidPreview) URL.revokeObjectURL(c.vidPreview)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Onglet 1 : Concept builder ───────────────────────────────────────────────

  const handleBuild = async () => {
    if (!videoUrl.trim() || !selectedSoulId || building) return
    setBuildError('')
    setBuilding(true)
    setBuildState({
      runId: '',
      steps: { download: 'idle', frames: 'idle', swap: 'idle', outfits: 'idle' },
      outfitUrls: [],
      conceptImageUrl: null,
      conceptId: null,
      chosenFrameT: null,
      error: null,
      mcLaunching: false,
      mcLaunched: false,
      mcError: null,
    })

    try {
      const res = await fetch('/api/motion-concept/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          soulId: selectedSoulId,
          swapModel: 'soul_cinematic',
          conceptName: conceptName.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`)

      const runId: string = data.runId
      setBuildState(prev => prev ? { ...prev, runId } : null)

      // Ouvrir le SSE
      sseRef.current?.close()
      const sse = new EventSource(`/api/motion-concept/events/${runId}`)
      sseRef.current = sse

      sse.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)

          setBuildState(prev => {
            if (!prev) return prev

            if (event.type === 'concept_step') {
              const step = event.step as ConceptStep
              const status: StepStatus =
                event.status === 'started' ? 'running' :
                event.status === 'done' ? 'done' : 'error'
              return {
                ...prev,
                steps: { ...prev.steps, [step]: status },
                chosenFrameT: step === 'frames' && event.chosen_t !== undefined
                  ? (event.chosen_t as number) : prev.chosenFrameT,
              }
            }

            if (event.type === 'concept_outfit') {
              const url = event.image_url as string
              return { ...prev, outfitUrls: [...prev.outfitUrls.filter((_, i) => i < (event.index as number) - 1), url] }
            }

            if (event.type === 'concept_done') {
              // La route garantit que concept_id est toujours présent ici
              return {
                ...prev,
                conceptImageUrl: (event.concept_image_url as string) || prev.conceptImageUrl,
                outfitUrls: Array.isArray(event.outfit_urls) ? event.outfit_urls as string[] : prev.outfitUrls,
                conceptId: (event.concept_id as string) || null,
                steps: { download: 'done', frames: 'done', swap: 'done', outfits: 'done' },
              }
            }

            if (event.type === 'error') {
              return { ...prev, error: (event.message as string) || 'Unknown error' }
            }

            return prev
          })

          // Auto-lancer le MC dès que concept_done + concept_id reçu
          if (event.type === 'concept_done' && event.concept_id) {
            sse.close()
            setBuilding(false)
            launchMCForConcept(event.concept_id as string)
          }

          if (event.type === 'error') {
            sse.close()
            setBuilding(false)
          }
        } catch { /* ignore parse errors */ }
      }

      sse.onerror = () => {
        setBuildState(prev => {
          if (!prev) return prev
          if (prev.error) return prev  // garder l'erreur pipeline déjà reçue
          // Ne pas afficher une erreur SSE si les outfits sont déjà terminés
          // (on attendait juste le concept_id de la DB, c'est normal que le SSE ferme)
          if (prev.steps.outfits === 'done') return prev
          return { ...prev, error: 'SSE connection lost (server restarted?)' }
        })
        sse.close()
        setBuilding(false)
      }

      // Fin naturelle du SSE (state.done = true côté serveur)
      sse.addEventListener('close', () => setBuilding(false))

      // Fallback: marquer building=false après 15min
      setTimeout(() => setBuilding(false), 15 * 60 * 1000)

    } catch (err) {
      setBuildError(err instanceof Error ? err.message : 'Unknown error')
      setBuilding(false)
    }
  }

  const isBuildDone = buildState?.steps.outfits === 'done'

  // Lance le Motion Control pour un conceptId donné (appelé auto après concept_done)
  const launchMCForConcept = async (conceptId: string) => {
    setBuildState(prev => prev ? { ...prev, mcLaunching: true, mcError: null } : null)
    try {
      const res = await fetch('/api/motion-control/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId, characterName: selectedSoulName || selectedElementName }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `Error ${res.status}`)
      }
      setBuildState(prev => prev ? { ...prev, mcLaunching: false, mcLaunched: true } : null)
      await new Promise(r => setTimeout(r, 800))
      router.push('/en-cours')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'MC launch error'
      setBuildState(prev => prev ? { ...prev, mcLaunching: false, mcError: msg } : null)
    }
  }

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
      // Increment viewCount locally
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
    { key: 'url', label: '🔗 From URL' },
    { key: 'library', label: '🎬 My concepts' },
    { key: 'manual', label: '📁 Manual upload' },
  ]

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
                Full pipeline: Instagram URL → person swap → 4 outfits → 4 Kling 3.0 videos
              </p>
            </div>

            {/* Sélecteur de personnage — soul_cinematic (soul-id list) */}
            {soulCharacters.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Character <span className="normal-case font-normal text-zinc-600">(soul_cinematic)</span>
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
            ) : (
              <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-xs text-amber-400">
                ⚠️ No soul character detected. Make sure you have at least one Soul Character
                completed in Higgsfield (soul-id list).
              </div>
            )}

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

            {/* ── Onglet 1 : Depuis URL ────────────────────────────────────────── */}
            {tab === 'url' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Instagram Reel URL
                    </label>
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                      placeholder="https://www.instagram.com/reel/..."
                      disabled={building}
                      className="w-full bg-zinc-900/80 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                      Concept name <span className="normal-case font-normal text-zinc-600">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={conceptName}
                      onChange={e => setConceptName(e.target.value)}
                      placeholder="e.g. beach reel july"
                      disabled={building}
                      className="w-full bg-zinc-900/80 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-violet-500/50 transition disabled:opacity-50"
                    />
                  </div>
                </div>

                {buildError && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
                    ❌ {buildError}
                  </div>
                )}

                {/* Progress */}
                {buildState && (
                  <div className="bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-5 space-y-3">
                    <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1">Progress</p>
                    {(['download', 'frames', 'swap', 'outfits'] as ConceptStep[]).map(step => (
                      <StepIndicator
                        key={step}
                        step={step}
                        status={buildState.steps[step]}
                        extra={
                          step === 'frames' && buildState.chosenFrameT !== null
                            ? `frame selected: ${buildState.chosenFrameT}s`
                            : undefined
                        }
                      />
                    ))}

                    {/* Aperçu des outfits en cours de génération */}
                    {buildState.outfitUrls.length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs text-zinc-500 mb-2">Generated outfits:</p>
                        <div className="flex gap-2 flex-wrap">
                          {buildState.outfitUrls.map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={url} alt={`Outfit ${i + 1}`}
                              className="w-16 h-16 rounded-lg object-cover border border-white/[0.08]" />
                          ))}
                          {buildState.outfitUrls.length < 4 && buildState.steps.outfits === 'running' && (
                            <div className="w-16 h-16 rounded-lg bg-zinc-800 border border-white/[0.05] flex items-center justify-center">
                              <span className="text-zinc-600 text-xs animate-pulse">⏳</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {buildState.error && (
                      <div className="text-sm text-red-400 pt-1">❌ {buildState.error}</div>
                    )}

                    {/* Step 5 : lancement MC auto */}
                    {isBuildDone && (
                      <div className="pt-1 space-y-2">
                        {/* Status MC launch */}
                        <div className={`flex items-center gap-2 text-sm transition ${
                          buildState.mcLaunching ? 'text-violet-300' :
                          buildState.mcLaunched ? 'text-emerald-400' :
                          buildState.mcError ? 'text-red-400' :
                          !buildState.conceptId ? 'text-zinc-500' : 'text-zinc-600'
                        }`}>
                          <span className="w-5 text-center">
                            {buildState.mcLaunching ? '⏳' :
                             buildState.mcLaunched ? '✅' :
                             buildState.mcError ? '❌' :
                             !buildState.conceptId ? '⏳' : '○'}
                          </span>
                          <span>
                            {buildState.mcLaunching ? 'Launching Motion Control (4 videos)…' :
                             buildState.mcLaunched ? 'Motion Control launched — redirecting…' :
                             buildState.mcError ? `MC error: ${buildState.mcError}` :
                             !buildState.conceptId ? 'Saving concept…' :
                             'Motion Control (4 videos)'}
                          </span>
                        </div>

                        {/* Retry si erreur MC */}
                        {buildState.mcError && buildState.conceptId && (
                          <button
                            onClick={() => launchMCForConcept(buildState.conceptId!)}
                            className="w-full py-3 rounded-xl font-semibold text-sm bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white transition"
                          >
                            🔄 Retry MC launch
                          </button>
                        )}

                        {/* Créer un autre concept */}
                        {!buildState.mcLaunching && (
                          <button
                            onClick={() => { setBuildState(null); setVideoUrl(''); setConceptName(''); setBuilding(false) }}
                            className="w-full py-2 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 transition"
                          >
                            Create another concept
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton Analyser */}
                {!isBuildDone && (
                  <button
                    onClick={handleBuild}
                    disabled={!videoUrl.trim() || !selectedSoulId || building}
                    className="w-full py-4 rounded-xl font-semibold text-base transition
                      bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {building ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Analyzing…
                      </span>
                    ) : '🔍 Analyze video'}
                  </button>
                )}

                <p className="text-xs text-center text-zinc-600">
                  Automatic frame selection (OpenCV) · 0 API cost · ~10 min total
                </p>
              </div>
            )}

            {/* ── Onglet 2 : Mes concepts ──────────────────────────────────────── */}
            {tab === 'library' && (
              <div className="space-y-5">
                {/* Filtres */}
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
                    <p className="text-xs mt-1">Create your first concept from the &quot;From URL&quot; tab</p>
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

                {/* Modal de confirmation lancement MC */}
                {confirmConcept && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-900 border border-white/[0.10] rounded-2xl p-6 max-w-sm w-full space-y-4">
                      <h3 className="text-base font-semibold text-white">Launch Motion Control</h3>
                      <p className="text-sm text-zinc-400">
                        Launch 4 × Kling 3.0 Motion Control for concept
                        <strong className="text-white"> «&nbsp;{confirmConcept.name || confirmConcept.id.slice(0, 8)}&nbsp;»</strong>?
                        The Seedream phase will be skipped (outfits already generated).
                      </p>
                      {/* Aperçu 4 outfits */}
                      {(() => {
                        const outfits: string[] = Array.isArray(confirmConcept.outfitImages)
                          ? (confirmConcept.outfitImages as unknown[]).filter(x => typeof x === 'string') as string[]
                          : []
                        return outfits.length > 0 ? (
                          <div className="flex gap-1.5">
                            {outfits.slice(0, 4).map((url, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={url} alt={`Outfit ${i + 1}`}
                                className="flex-1 aspect-square rounded-lg object-cover" />
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
