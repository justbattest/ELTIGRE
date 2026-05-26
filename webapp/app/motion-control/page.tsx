'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Outfit preview ────────────────────────────────────────────────────────────

const OUTFIT_STYLES = [
  { key: 'casual', label: 'Casual Streetwear', emoji: '🧢', description: 'Crop top, jeans ou shorts, sneakers' },
  { key: 'sport', label: 'Athletic Sportswear', emoji: '🏃', description: 'Sports bra, leggings, training sneakers' },
  { key: 'party', label: 'Evening Party', emoji: '💃', description: 'Bodycon ou cocktail dress, high heels' },
  { key: 'chic', label: 'Smart Chic', emoji: '👔', description: 'Blazer ou top chic, mini skirt, heels' },
]

const isImageFile = (f: File) => f.type.startsWith('image/')
const isVideoFile = (f: File) => f.type.startsWith('video/')

// ─── Folder / multi-file drop zone ────────────────────────────────────────────

function ConceptDropZone({
  conceptImage,
  conceptVideo,
  onFiles,
}: {
  conceptImage: File | null
  conceptVideo: File | null
  onFiles: (img: File | null, vid: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [vidPreview, setVidPreview] = useState<string | null>(null)

  useEffect(() => {
    if (conceptImage) {
      const url = URL.createObjectURL(conceptImage)
      setImgPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setImgPreview(null)
    }
  }, [conceptImage])

  useEffect(() => {
    if (conceptVideo) {
      const url = URL.createObjectURL(conceptVideo)
      setVidPreview(url)
      return () => URL.revokeObjectURL(url)
    } else {
      setVidPreview(null)
    }
  }, [conceptVideo])

  const processFiles = (files: File[]) => {
    let img = conceptImage
    let vid = conceptVideo
    for (const f of files) {
      if (isImageFile(f)) img = f
      else if (isVideoFile(f)) vid = f
    }
    onFiles(img, vid)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)

    // Try folder via DataTransferItem entries API
    const items = Array.from(e.dataTransfer.items)
    const filePromises: Promise<File[]>[] = items.map(item => {
      const entry = item.webkitGetAsEntry?.()
      if (entry?.isDirectory) {
        return readDirectoryFiles(entry as FileSystemDirectoryEntry)
      }
      const f = item.getAsFile()
      return Promise.resolve(f ? [f] : [])
    })

    Promise.all(filePromises).then(results => {
      processFiles(results.flat())
    })
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files))
  }

  const allDone = !!conceptImage && !!conceptVideo

  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-6 cursor-pointer transition
        ${dragging ? 'border-violet-400 bg-violet-900/20' : allDone ? 'border-emerald-600 bg-emerald-900/10' : 'border-gray-700 bg-gray-900/50 hover:border-gray-500'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {/* Hidden input — webkitdirectory allows folder selection */}
      <input
        ref={inputRef}
        type="file"
        multiple
        // @ts-expect-error — webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        className="hidden"
        onChange={handleInputChange}
      />

      {!conceptImage && !conceptVideo ? (
        /* Empty state */
        <div className="flex flex-col items-center gap-3 py-4">
          <span className="text-4xl">📁</span>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-300">Glisse ton dossier ici</p>
            <p className="text-xs text-gray-500 mt-1">ou clique pour sélectionner le dossier</p>
            <p className="text-xs text-gray-600 mt-2">Le dossier doit contenir 1 image + 1 vidéo</p>
          </div>
        </div>
      ) : (
        /* Preview state */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* Image preview */}
            <div className={`rounded-xl overflow-hidden border ${conceptImage ? 'border-emerald-700' : 'border-dashed border-gray-600'} bg-gray-950`}>
              {imgPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgPreview} alt="concept" className="w-full h-32 object-cover" />
                  <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-emerald-400">📷 Image ✓</div>
                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center gap-1">
                  <span className="text-2xl opacity-30">📷</span>
                  <p className="text-xs text-gray-600">Image manquante</p>
                </div>
              )}
            </div>

            {/* Video preview */}
            <div className={`rounded-xl overflow-hidden border ${conceptVideo ? 'border-emerald-700' : 'border-dashed border-gray-600'} bg-gray-950`}>
              {vidPreview ? (
                <div className="relative">
                  <video src={vidPreview} className="w-full h-32 object-cover" muted playsInline autoPlay loop />
                  <div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5 text-[10px] text-emerald-400">🎬 Vidéo ✓</div>
                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center gap-1">
                  <span className="text-2xl opacity-30">🎬</span>
                  <p className="text-xs text-gray-600">Vidéo manquante</p>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-center text-gray-500">
            {allDone ? '✅ Image + vidéo détectées — clic pour changer' : '⚠️ Clic pour re-sélectionner (besoin d\'1 image + 1 vidéo)'}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Recursively read all files from a dropped directory ──────────────────────

function readDirectoryFiles(entry: FileSystemDirectoryEntry): Promise<File[]> {
  return new Promise((resolve) => {
    const reader = entry.createReader()
    const files: File[] = []

    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) { resolve(files); return }
        const promises = entries.map(e => {
          if (e.isFile) {
            return new Promise<File[]>(res => (e as FileSystemFileEntry).file(f => res([f]), () => res([])))
          }
          return Promise.resolve<File[]>([]) // ignore sub-dirs
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function MotionControlPage() {
  const router = useRouter()

  const [conceptImage, setConceptImage] = useState<File | null>(null)
  const [conceptVideo, setConceptVideo] = useState<File | null>(null)

  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')

  const canLaunch = !!conceptImage && !!conceptVideo && !launching

  const handleLaunch = async () => {
    if (!canLaunch) return
    setLaunching(true)
    setError('')

    try {
      const fd = new FormData()
      fd.append('image', conceptImage!)
      fd.append('video', conceptVideo!)

      const res = await fetch('/api/motion-control/start', {
        method: 'POST',
        body: fd,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Erreur ${res.status}`)
      }

      router.push('/en-cours')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setLaunching(false)
    }
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
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500">
            🎭 Motion Control
          </div>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            ⏳ En cours
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-8">

        <div>
          <h1 className="text-2xl font-bold text-white">🎭 Motion Control</h1>
          <p className="text-gray-400 text-sm mt-1">
            Glisse ton dossier concept → 4 tenues générées automatiquement → motion appliquée via Kling 3.0
          </p>
        </div>

        {/* Folder drop zone */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Dossier concept <span className="text-gray-600 normal-case font-normal">(1 image + 1 vidéo)</span>
          </label>
          <ConceptDropZone
            conceptImage={conceptImage}
            conceptVideo={conceptVideo}
            onFiles={(img, vid) => { setConceptImage(img); setConceptVideo(vid) }}
          />
        </div>

        {/* Outfit preview */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">4 tenues générées automatiquement</label>
          <div className="grid grid-cols-2 gap-3">
            {OUTFIT_STYLES.map((style) => (
              <div key={style.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
                <span className="text-2xl mt-0.5">{style.emoji}</span>
                <div>
                  <p className="text-sm font-medium text-white">{style.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{style.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Seedream v4.5 génère chaque tenue → Kling 3.0 Motion Control applique la motion de ta vidéo.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300">
            ❌ {error}
          </div>
        )}

        {/* Launch */}
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
              Lancement…
            </span>
          ) : (
            '▶ Générer 4 vidéos Motion Control →'
          )}
        </button>

        {(!conceptImage || !conceptVideo) && (
          <p className="text-xs text-center text-gray-600">
            {!conceptImage && !conceptVideo
              ? "Glisse ton dossier pour démarrer"
              : !conceptImage
              ? "⚠️ Image manquante dans le dossier"
              : "⚠️ Vidéo manquante dans le dossier"}
          </p>
        )}

      </div>
    </div>
  )
}
