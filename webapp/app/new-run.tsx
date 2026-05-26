'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  const addProfile = () => setProfiles([...profiles, ''])
  const updateProfile = (i: number, v: string) => {
    const p = [...profiles]
    p[i] = v
    setProfiles(p)
  }
  const removeProfile = (i: number) => {
    if (profiles.length === 1) return
    setProfiles(profiles.filter((_, idx) => idx !== i))
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
        router.push(`/run/${data.runId}`)
      }
    } catch (e) {
      setLaunchError(String(e))
      setLaunching(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between sticky top-0 bg-gray-950 z-20">
        <div className="flex items-center gap-2">
          <span className="text-xl">🐯</span>
          <span className="font-semibold text-white">EL TIGRE FACTORY</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/kpi" className="text-gray-400 hover:text-white transition text-sm">
            📊 KPI
          </Link>
          <Link href="/settings" className="text-gray-400 hover:text-white transition text-sm">
            ⚙️ Settings
          </Link>
          <span className="text-gray-600 text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            Déco
          </button>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="border-b border-gray-800 px-6 bg-gray-950 sticky top-[57px] z-10">
        <div className="flex gap-0 -mb-px">
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500">
            🔄 Scraping
          </div>
          <Link
            href="/studio"
            className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition"
          >
            ✨ Prompt Studio
          </Link>
          <Link
            href="/carousel"
            className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition"
          >
            🃏 Carousels
          </Link>
          <Link
            href="/video"
            className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition"
          >
            🎬 Vidéos
          </Link>
          <Link
            href="/motion-control"
            className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition"
          >
            🎭 Motion Control
          </Link>
          <Link
            href="/en-cours"
            className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition"
          >
            ⏳ En cours
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Profils Instagram */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-200">Profils Instagram</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Max posts :</label>
              <input
                type="number"
                value={maxPosts}
                onChange={(e) => setMaxPosts(Number(e.target.value))}
                min={5}
                max={100}
                className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            {profiles.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="url"
                  value={p}
                  onChange={(e) => updateProfile(i, e.target.value)}
                  placeholder="https://www.instagram.com/username/"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition text-sm"
                />
                {profiles.length > 1 && (
                  <button
                    onClick={() => removeProfile(i)}
                    className="text-gray-600 hover:text-red-400 transition px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={addProfile}
            className="mt-2 text-sm text-violet-400 hover:text-violet-300 transition"
          >
            + Ajouter un profil
          </button>
        </div>

        {/* Personnages */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-200">Personnage</h2>
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
            <p className="text-gray-500 text-sm">
              Cliquez &quot;Charger depuis Higgsfield&quot; pour voir vos personnages.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Soul Characters */}
              {soulChars.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">
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
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
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
                  <p className="text-xs text-gray-500 mb-2">
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
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-medium mb-3 text-gray-200">Modèle & Format</h2>

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
                <span className="text-sm text-gray-300">{opt.label}</span>
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
              <label className="block text-xs text-gray-500 mb-1">Format</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
              >
                <option value="2:3">2:3</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Qualité</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
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
          className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 text-lg transition"
        >
          {launching ? '⏳ Lancement...' : '🚀 Lancer'}
        </button>
      </div>
    </div>
  )
}
