'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

type CarouselEvent =
  | { type: 'info'; msg: string; image_count?: number }
  | { type: 'carousel_start'; total: number; image_count: number; combinations_possible: number }
  | { type: 'carousel'; n: number; total: number; drive_urls: string[]; errors: string[] | null }
  | { type: 'done'; run_id: string; total: number; finished_at: string }
  | { type: 'error'; message: string }

export default function CarouselPage() {
  useSession()

  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [maxCarousels, setMaxCarousels] = useState(200)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // ── Personnage (pour le dossier Drive) ────────────────────────────────────
  const [refElements, setRefElements] = useState<{ id: string; name: string }[]>([])
  const [selectedCharacterName, setSelectedCharacterName] = useState('')

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const elements: { id: string; name: string }[] = data.referenceElements || []
        const souls: { id: string; name: string }[] = data.soulCharacters || []
        const all = [...elements, ...souls]
        setRefElements(all)
        if (all.length) setSelectedCharacterName(all[0].name)
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
      setError('Il faut au moins 4 images pour créer des carousels.')
      return
    }
    setError('')
    setUploading(true)

    const form = new FormData()
    files.forEach(f => form.append('images', f))
    form.append('maxCarousels', String(maxCarousels))
    if (selectedCharacterName) form.append('characterName', selectedCharacterName)

    try {
      const res = await fetch('/api/carousel/create', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || 'Erreur lors du lancement')
        setUploading(false)
        return
      }
      setRunId(data.runId)
      setUploading(false)
    } catch (e) {
      setError(String(e))
      setUploading(false)
    }
  }

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
        const msg = (event as { message: string }).message || 'Erreur inconnue'
        // Si le run est introuvable (serveur redémarré), retour propre à la config
        if (msg.includes('introuvable')) {
          es.close()
          resetAll()
          setError('Session expirée (serveur redémarré). Relance un nouveau batch.')
          return
        }
        setError(msg)
        setDone(true)
        es.close()
      } else if (event.type === 'stderr') {
        console.warn('[carousel stderr]', event.msg)
      }
    }

    es.onerror = () => {
      es.close()
      setError('Connexion SSE perdue — le serveur a peut-être redémarré.')
      setDone(true)
    }
    return () => es.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, done])

  // ── UI ────────────────────────────────────────────────────────────────────

  const pct = totalCarousels > 0 ? Math.round((completedCarousels / totalCarousels) * 100) : 0

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-20">
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
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500">
            🃏 Carousels
          </div>
          <Link href="/video" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🎬 Vidéos
          </Link>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🎭 Motion Control
          </Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            ⏳ En cours
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* ── Config ─────────────────────────────────────────────────────── */}
        {!runId && (
          <>
            {/* Personnage Drive */}
            {refElements.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-2">Personnage (dossier Drive)</p>
                <div className="flex flex-wrap gap-2">
                  {refElements.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setSelectedCharacterName(e.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        selectedCharacterName === e.name
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                      }`}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Zone drag & drop */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging
                  ? 'border-violet-400 bg-violet-900/20'
                  : 'border-gray-700 hover:border-gray-500 bg-gray-900/50'
              }`}
            >
              <div className="text-4xl mb-3">🖼️</div>
              <p className="text-gray-300 font-medium">Glisse tes images ici</p>
              <p className="text-gray-500 text-sm mt-1">
                ou clique pour sélectionner · JPG, PNG, WebP acceptés
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
                  <span className="text-sm text-gray-400">
                    {files.length} image{files.length > 1 ? 's' : ''} sélectionnée{files.length > 1 ? 's' : ''}
                    {files.length >= 4 && (
                      <span className="text-violet-400 ml-2">
                        → jusqu'à {Math.min(maxCarousels, (() => {
                          let n = files.length, k = 4
                          if (n < k) return 0
                          let r = 1
                          for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1)
                          return Math.floor(r)
                        })())} carousels possibles
                      </span>
                    )}
                  </span>
                  <button
                    onClick={resetAll}
                    className="text-xs text-gray-600 hover:text-red-400 transition"
                  >
                    Tout effacer
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-medium text-gray-200">Réglages</h2>

              {/* Max carousels */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest">
                  Nombre max de carousels
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxCarousels}
                    onChange={e => setMaxCarousels(Math.min(200, Math.max(1, Number(e.target.value))))}
                    className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-violet-500"
                  />
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={maxCarousels}
                    onChange={e => setMaxCarousels(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-xs text-gray-500 w-10 text-right">{maxCarousels} max</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">
                  Chaque carousel = 4 photos · combinaisons uniques · EXIF iPhone 17 Pro unique par instance
                </p>
              </div>

              {/* Infos */}
              <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
                <p className="text-[10px] text-gray-500">
                  ✅ EXIF strippé + iPhone 17 Pro fake (datetime + GPS + ISO uniques par image/carousel)
                </p>
                <p className="text-[10px] text-gray-500">
                  ✅ Micro-crop + micro-noise par instance → aucun fichier binaire identique
                </p>
                <p className="text-[10px] text-gray-500">
                  ✅ Upload organisé dans Drive : <code className="text-violet-400">carousel_N/1.jpg … 4.jpg</code>
                </p>
              </div>
            </div>

            {/* Erreur */}
            {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-xl p-4">
                {error}
              </div>
            )}

            {/* Bouton lancement */}
            <button
              onClick={launch}
              disabled={files.length < 4 || uploading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3.5 transition text-sm"
            >
              {uploading
                ? '⏳ Upload en cours...'
                : files.length < 4
                ? `🃏 Ajouter au moins ${4 - files.length} image${4 - files.length > 1 ? 's' : ''} de plus`
                : `🃏 Générer ${maxCarousels > 0 ? `jusqu'à ${maxCarousels}` : ''} carousels`}
            </button>
          </>
        )}

        {/* ── Progression ────────────────────────────────────────────────── */}
        {runId && (
          <div className="space-y-5">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium text-gray-200">
                  {done && !error ? '✅ Carousels générés !' : done && error ? '❌ Erreur' : '⏳ Génération en cours...'}
                </h2>
                <span className="text-xs text-gray-500">
                  {imageCount} images · C({imageCount},4) = {combinationsPossible.toLocaleString()} combos possibles
                </span>
              </div>

              {/* Barre de progression */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">
                    {completedCarousels} / {totalCarousels || '...'} carousels
                  </span>
                  <span className="text-xs text-gray-500">{pct}%</span>
                </div>
                <div className="bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-violet-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-900/30 border border-red-800 text-red-400 text-sm rounded-lg p-3">
                  {error}
                </div>
              )}

              {done && (
                <div className="flex gap-3">
                  <button
                    onClick={resetAll}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg py-2.5 transition"
                  >
                    + Nouveau batch
                  </button>
                </div>
              )}
            </div>

            {/* Liens Drive */}
            {carouselDriveLinks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-3">
                  Carousels prêts ({carouselDriveLinks.length})
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {carouselDriveLinks.map(({ n, urls }) => (
                    <div
                      key={n}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 w-20">carousel_{n}</span>
                        <div className="flex gap-1">
                          {urls.map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-violet-500 opacity-80" />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-600">{urls.length} photos</span>
                      </div>
                      <a
                        href={urls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-violet-400 hover:text-violet-300 transition"
                      >
                        Voir Drive →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
