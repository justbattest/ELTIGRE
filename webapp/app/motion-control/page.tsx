'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Types ────────────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string }

type Concept = {
  id: string          // unique key client-side
  folderName: string
  image: File | null
  video: File | null
  imgPreview: string | null
  vidPreview: string | null
  status: 'pending' | 'submitting' | 'submitted' | 'error'
  errorMsg?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
        Promise.all(promises).then(results => {
          files.push(...results.flat())
          readBatch()
        })
      })
    }
    readBatch()
  })
}

function extractImageVideo(files: File[]): { image: File | null; video: File | null } {
  return {
    image: files.find(isImageFile) || null,
    video: files.find(isVideoFile) || null,
  }
}

function makeConcept(folderName: string, image: File | null, video: File | null): Concept {
  return {
    id: `${Date.now()}_${Math.random()}`,
    folderName,
    image,
    video,
    imgPreview: image ? URL.createObjectURL(image) : null,
    vidPreview: video ? URL.createObjectURL(video) : null,
    status: 'pending',
  }
}

// ─── Concept Row ──────────────────────────────────────────────────────────────

function ConceptRow({ concept, onRemove }: { concept: Concept; onRemove: () => void }) {
  const ok = !!concept.image && !!concept.video
  const statusIcon = {
    pending: ok ? '✅' : '⚠️',
    submitting: '⏳',
    submitted: '🚀',
    error: '❌',
  }[concept.status]

  return (
    <div className={`flex items-center gap-3 bg-gray-900 border rounded-xl p-3 transition ${
      concept.status === 'submitted' ? 'border-emerald-800' :
      concept.status === 'error' ? 'border-red-800' :
      ok ? 'border-gray-700' : 'border-yellow-800/50'
    }`}>
      {/* Image preview */}
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
        {concept.imgPreview
          ? <img src={concept.imgPreview} alt="" className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">📷</div>
        }
      </div>

      {/* Video preview */}
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
        {concept.vidPreview
          ? <video src={concept.vidPreview} className="w-full h-full object-cover" muted playsInline autoPlay loop />
          : <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">🎬</div>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{concept.folderName}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {!concept.image && !concept.video ? '⚠️ Image + vidéo manquantes'
           : !concept.image ? '⚠️ Image manquante'
           : !concept.video ? '⚠️ Vidéo manquante'
           : concept.status === 'error' ? `❌ ${concept.errorMsg}`
           : concept.status === 'submitted' ? '🚀 Run lancé'
           : concept.status === 'submitting' ? '⏳ Envoi…'
           : '✅ Prêt · 4 vidéos seront générées'}
        </p>
      </div>

      {/* Status + remove */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-lg">{statusIcon}</span>
        {concept.status === 'pending' && (
          <button
            onClick={onRemove}
            className="text-gray-600 hover:text-red-400 transition text-lg leading-none"
            title="Supprimer"
          >×</button>
        )}
      </div>
    </div>
  )
}

// ─── Add Zone ─────────────────────────────────────────────────────────────────

function AddZone({ onAdd, disabled }: { onAdd: (concepts: Concept[]) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const processItems = useCallback(async (items: DataTransferItemList) => {
    const newConcepts: Concept[] = []
    const itemArray = Array.from(items)

    for (const item of itemArray) {
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
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    processItems(e.dataTransfer.items)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || disabled) return
    const files = Array.from(e.target.files)
    // Group files by their parent folder (webkitRelativePath)
    const folderMap = new Map<string, File[]>()
    for (const f of files) {
      const parts = f.webkitRelativePath?.split('/') || []
      const folder = parts.length > 1 ? parts[0] : '__root__'
      if (!folderMap.has(folder)) folderMap.set(folder, [])
      folderMap.get(folder)!.push(f)
    }
    const newConcepts: Concept[] = []
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
        ${disabled ? 'opacity-40 cursor-not-allowed' : dragging ? 'border-violet-400 bg-violet-900/20' : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Hidden input — multiple folders */}
      <input
        ref={inputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory non-standard
        webkitdirectory=""
        className="hidden"
        onChange={handleInputChange}
      />
      <p className="text-3xl mb-2">📁</p>
      <p className="text-sm font-medium text-gray-300">Glisse tes dossiers ici</p>
      <p className="text-xs text-gray-500 mt-1">Autant de dossiers que tu veux — chaque dossier = 1 image + 1 vidéo</p>
      <p className="text-xs text-gray-600 mt-1">ou clique pour sélectionner</p>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MotionControlPage() {
  const router = useRouter()

  const [concepts, setConcepts] = useState<Concept[]>([])
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [launching, setLaunching] = useState(false)
  const [submitProgress, setSubmitProgress] = useState<{ done: number; total: number } | null>(null)
  const [globalError, setGlobalError] = useState('')

  // Fetch reference elements on mount
  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const els: RefElement[] = data.referenceElements || []
        setRefElements(els)
        if (els.length) { setSelectedElementId(els[0].id); setSelectedElementName(els[0].name) }
      })
      .catch(() => {})
  }, [])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      concepts.forEach(c => {
        if (c.imgPreview) URL.revokeObjectURL(c.imgPreview)
        if (c.vidPreview) URL.revokeObjectURL(c.vidPreview)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = useCallback((newConcepts: Concept[]) => {
    setConcepts(prev => [...prev, ...newConcepts])
  }, [])

  const handleRemove = (id: string) => {
    setConcepts(prev => {
      const removed = prev.find(c => c.id === id)
      if (removed?.imgPreview) URL.revokeObjectURL(removed.imgPreview)
      if (removed?.vidPreview) URL.revokeObjectURL(removed.vidPreview)
      return prev.filter(c => c.id !== id)
    })
  }

  const readyConcepts = concepts.filter(c => c.image && c.video && c.status === 'pending')
  const canLaunch = readyConcepts.length > 0 && !launching
  const totalVideos = readyConcepts.length * 4

  const handleLaunch = async () => {
    if (!canLaunch) return
    setLaunching(true)
    setGlobalError('')
    setSubmitProgress({ done: 0, total: readyConcepts.length })

    let done = 0
    for (const concept of readyConcepts) {
      // Mark as submitting
      setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'submitting' } : c))

      try {
        const fd = new FormData()
        fd.append('image', concept.image!)
        fd.append('video', concept.video!)
        if (selectedElementName) fd.append('characterName', selectedElementName)

        const res = await fetch('/api/motion-control/start', { method: 'POST', body: fd })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Erreur ${res.status}`)
        }

        // Mark as submitted
        setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'submitted' } : c))
        done++
        setSubmitProgress({ done, total: readyConcepts.length })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erreur inconnue'
        setConcepts(prev => prev.map(c => c.id === concept.id ? { ...c, status: 'error', errorMsg: msg } : c))
      }
    }

    // All submitted → go to En cours after short pause
    await new Promise(r => setTimeout(r, 800))
    router.push('/en-cours')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Top nav */}
      <nav className="sticky top-0 z-20 bg-gray-950 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
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
        <div className="flex gap-0 -mb-px overflow-x-auto">
          <Link href="/" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            🔄 Scraping
          </Link>
          <Link href="/studio" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            ✨ Prompt Studio
          </Link>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            🃏 Carousels
          </Link>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            🎬 Vidéos
          </Link>
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500 whitespace-nowrap">
            🎭 Motion Control
          </div>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            ⏳ En cours
          </Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition whitespace-nowrap">
            🧹 Metadata Opti
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-white">🎭 Motion Control — Batch</h1>
          <p className="text-gray-400 text-sm mt-1">
            Seedream v4.5 → 4 variantes d&apos;outfit · Kling 3.0 Motion Control · Tout s&apos;exécute en arrière-plan
          </p>
        </div>

        {/* Character selector */}
        {refElements.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Personnage <span className="text-gray-600 normal-case font-normal">(dossier Drive)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {refElements.map(e => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                  disabled={launching}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selectedElementId === e.id
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                  } disabled:opacity-50`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Concepts <span className="text-gray-600 normal-case font-normal">(1 dossier = 1 image + 1 vidéo = 4 vidéos générées)</span>
          </label>
          <AddZone onAdd={handleAdd} disabled={launching} />
        </div>

        {/* Concept list */}
        {concepts.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {concepts.length} concept{concepts.length > 1 ? 's' : ''} · {readyConcepts.length} prêt{readyConcepts.length > 1 ? 's' : ''}
              </span>
              {!launching && (
                <button
                  onClick={() => {
                    concepts.forEach(c => {
                      if (c.imgPreview) URL.revokeObjectURL(c.imgPreview)
                      if (c.vidPreview) URL.revokeObjectURL(c.vidPreview)
                    })
                    setConcepts([])
                  }}
                  className="text-xs text-gray-600 hover:text-red-400 transition"
                >
                  Tout supprimer
                </button>
              )}
            </div>
            <div className="space-y-2">
              {concepts.map(c => (
                <ConceptRow key={c.id} concept={c} onRemove={() => handleRemove(c.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Submit progress */}
        {submitProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Soumission des runs…</span>
              <span>{submitProgress.done}/{submitProgress.total}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-300"
                style={{ width: `${(submitProgress.done / submitProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Global error */}
        {globalError && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
            ❌ {globalError}
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={handleLaunch}
          disabled={!canLaunch}
          className="w-full py-4 rounded-xl font-semibold text-base transition
            bg-violet-600 hover:bg-violet-500 text-white
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {launching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Lancement {submitProgress ? `${submitProgress.done}/${submitProgress.total}` : ''}…
            </span>
          ) : readyConcepts.length === 0 ? (
            'Glisse des dossiers pour démarrer'
          ) : (
            `▶ Générer ${totalVideos} vidéos (${readyConcepts.length} batch${readyConcepts.length > 1 ? 'es' : ''} × 4) →`
          )}
        </button>

        {/* Info */}
        {readyConcepts.length > 0 && !launching && (
          <p className="text-xs text-center text-gray-600">
            Chaque batch génère 4 outfits via Seedream + 4 vidéos via Kling · Tout tourne en arrière-plan
          </p>
        )}

      </div>
    </div>
  )
}
