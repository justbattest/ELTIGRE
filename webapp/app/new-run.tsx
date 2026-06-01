'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

type SoulChar = { id: string; name: string; type: string; status: string }
type RefElement = { id: string; name: string }

export default function NewRunPage() {
  const { data: session } = useSession()
  const router = useRouter()

  // Profils
  const [profiles, setProfiles] = useState<string[]>([''])
  const [maxPosts, setMaxPosts] = useState(50)

  // Personnages
  const [soulChars, setSoulChars] = useState<SoulChar[]>([])
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedSoulId, setSelectedSoulId] = useState('')
  const [selectedSoulName, setSelectedSoulName] = useState('')
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)
  const [charsError, setCharsError] = useState('')

  // Modèle & format
  const [model, setModel] = useState('auto')
  const [aspectRatio, setAspectRatio] = useState('2:3')
  const [quality, setQuality] = useState('2k')

  // Lancement
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')

  // Charger les defaults depuis settings
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.defaultModel) setModel(data.defaultModel)
        if (data.defaultAspectRatio) setAspectRatio(data.defaultAspectRatio)
        if (data.defaultQuality) setQuality(data.defaultQuality)
      })
  }, [])

  const loadCharacters = async () => {
    setLoadingChars(true)
    setCharsError('')
    try {
      const res = await fetch('/api/characters')
      const data = await res.json()
      if (data.error) {
        setCharsError(data.error)
      } else {
        setSoulChars(data.soulCharacters || [])
        setRefElements(data.referenceElements || [])
        // Sélectionner le premier par défaut
        if (data.soulCharacters?.length) {
          setSelectedSoulId(data.soulCharacters[0].id)
          setSelectedSoulName(data.soulCharacters[0].name)
        }
        if (data.referenceElements?.length) {
          setSelectedElementId(data.referenceElements[0].id)
          setSelectedElementName(data.referenceElements[0].name)
        }
      }
    } catch (e) {
      setCharsError(String(e))
    } finally {
      setLoadingChars(false)
    }
  }

  // ── Multi-paste Instagram profiles ────────────────────────────────────────
  const [pasteInput, setPasteInput] = useState('')

  /** Parse une chaîne brute → liste d'URLs Instagram propres (dedupliquées). */
  const parseProfileLinks = (raw: string): string[] => {
    // Split sur newlines, espaces, virgules, pipes
    const parts = raw.split(/[\n\r,| \t]+/)
    const seen = new Set<string>()
    const results: string[] = []
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      // Accepter instagram.com URLs — nettoyer les query params (?igsh=...)
      let url = trimmed
      if (url.includes('instagram.com')) {
        url = url.replace(/[?#].*$/, '').replace(/\/?$/, '/')
        if (!url.startsWith('http')) url = 'https://' + url
        if (!seen.has(url)) { seen.add(url); results.push(url) }
      }
    }
    return results
  }

  const handlePasteInput = (raw: string) => {
    setPasteInput(raw)
    const parsed = parseProfileLinks(raw)
    if (parsed.length > 0) setProfiles(parsed)
  }

  const removeProfile = (i: number) => {
    const updated = profiles.filter((_, idx) => idx !== i)
    setProfiles(updated.length ? updated : [''])
    // Resync le textarea
    if (updated.length > 0) setPasteInput(updated.join('\n'))
    else setPasteInput('')
  }

  const launch = async () => {
    const validProfiles = profiles.filter((p) => p.trim())
    if (!validProfiles.length) return setLaunchError('Au moins un profil requis')
    if (!selectedSoulId) return setLaunchError('Sélectionner un Soul Character')
    // Reference Element requis uniquement si modèle fallback est possible
    const needsElement = model !== 'soul_cinematic'
    if (needsElement && !selectedElementId) return setLaunchError('Sélectionner un Reference Element (requis pour Auto/Seedream/Nano Banana)')

    setLaunching(true)
    setLaunchError('')

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profiles: validProfiles,
          maxPosts,
          soulId: selectedSoulId,
          elementId: selectedElementId,
          characterName: selectedSoulName || selectedElementName,
          model,
          aspectRatio,
          quality,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setLaunchError(data.error)
        setLaunching(false)
      } else {
        router.push('/en-cours')
      }
    } catch (e) {
      setLaunchError(String(e))
      setLaunching(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
        {/* Profils Instagram */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-100">Profils Instagram</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500">Max posts total :</label>
              <input
                type="number"
                value={maxPosts}
                onChange={(e) => setMaxPosts(Number(e.target.value))}
                min={5}
                max={500}
                className="w-16 bg-black/40 border border-white/[0.08] rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>

          {/* Zone de paste multi-liens */}
          <textarea
            value={pasteInput}
            onChange={(e) => handlePasteInput(e.target.value)}
            placeholder={"Colle ici tous tes liens Instagram d'un coup :\nhttps://www.instagram.com/username1/\nhttps://www.instagram.com/username2/\n...\n\n(séparés par des sauts de ligne, virgules ou espaces)"}
            rows={4}
            className="w-full bg-black/40 border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition text-sm resize-none font-mono"
          />

          {/* Profils parsés — chips supprimables */}
          {profiles.filter(p => p.trim()).length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">
                {profiles.filter(p => p.trim()).length} profil{profiles.filter(p => p.trim()).length > 1 ? 's' : ''} détecté{profiles.filter(p => p.trim()).length > 1 ? 's' : ''} :
              </p>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p, i) => {
                  if (!p.trim()) return null
                  // Extraire le username pour l'affichage
                  const username = p.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || p
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1 bg-white/[0.05] border border-white/[0.08] rounded-full px-3 py-1 text-xs text-zinc-100"
                    >
                      @{username}
                      <button
                        onClick={() => removeProfile(i)}
                        className="text-zinc-500 hover:text-red-400 transition ml-1 leading-none"
                      >
                        ✕
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Personnages */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-zinc-100">Personnage</h2>
            <button
              onClick={loadCharacters}
              disabled={loadingChars}
              className="text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition flex items-center gap-1"
            >
              {loadingChars ? '⏳' : '↻'} Charger depuis Higgsfield
            </button>
          </div>

          {charsError && (
            <p className="text-red-400 text-sm mb-3 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {charsError}
            </p>
          )}

          {soulChars.length === 0 && refElements.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              Cliquez &quot;Charger depuis Higgsfield&quot; pour voir vos personnages.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Soul Characters */}
              {soulChars.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">
                    Soul Character (Soul Cinema) :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {soulChars.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedSoulId(c.id); setSelectedSoulName(c.name) }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                          selectedSoulId === c.id
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:border-white/[0.20]'
                        }`}
                      >
                        {c.name}
                        <span className="ml-1.5 text-xs opacity-60">
                          {c.type === 'soul_cinematic' ? 'Cinema' : 'V2'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reference Elements — uniquement si mode non soul_cinematic */}
              {refElements.length > 0 && model !== 'soul_cinematic' && (
                <div>
                  <p className="text-xs text-zinc-500 mb-2">
                    Reference Element (Seedream / Nano Banana) :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {refElements.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                          selectedElementId === e.id
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-white/[0.05] border-white/[0.08] text-zinc-300 hover:border-white/[0.20]'
                        }`}
                      >
                        {e.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modèle & Format */}
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-5">
          <h2 className="font-medium mb-3 text-zinc-100">Modèle & Format</h2>

          {/* Modèle */}
          <div className="space-y-2 mb-4">
            {[
              { value: 'auto', label: 'Auto (Soul Cinema → Seedream → Nano Banana)', badge: 'Recommandé' },
              { value: 'soul_cinematic', label: 'Soul Cinema uniquement', badge: null },
              { value: 'seedream_v4_5', label: 'Seedream 4.5 uniquement', badge: null },
              { value: 'nano_banana_2', label: 'Nano Banana Pro uniquement', badge: null },
            ].map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 cursor-pointer group"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition ${
                    model === opt.value ? 'border-violet-500' : 'border-gray-600'
                  }`}
                >
                  {model === opt.value && (
                    <div className="w-2 h-2 rounded-full bg-violet-500" />
                  )}
                </div>
                <input
                  type="radio"
                  name="model"
                  value={opt.value}
                  checked={model === opt.value}
                  onChange={() => setModel(opt.value)}
                  className="sr-only"
                />
                <span className="text-sm text-zinc-300">{opt.label}</span>
                {opt.badge && (
                  <span className="text-xs bg-violet-900 text-violet-300 px-2 py-0.5 rounded-full">
                    {opt.badge}
                  </span>
                )}
              </label>
            ))}
          </div>

          {/* Format & Qualité */}
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Format</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="bg-black/40 border border-white/[0.08] rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
              >
                <option value="2:3">2:3</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Qualité</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="bg-black/40 border border-white/[0.08] rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition"
              >
                <option value="2k">2K</option>
                <option value="4k">4K</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Erreur lancement */}
        {launchError && (
          <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3">
            {launchError}
          </p>
        )}

        {/* Bouton Lancer */}
        <button
          onClick={launch}
          disabled={launching}
          className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:bg-violet-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-lg transition"
        >
          {launching ? '⏳ Lancement...' : '🚀 Lancer'}
        </button>
      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
