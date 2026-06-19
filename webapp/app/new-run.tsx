'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

type SoulChar = { id: string; name: string; type: string; status: string }
type RefElement = { id: string; name: string }

const SCRAPER_MAINTENANCE = true  // Scraper temporairement désactivé

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
    if (!validProfiles.length) return setLaunchError('At least one profile is required')
    if (!selectedSoulId) return setLaunchError('Select a Soul Character')
    // Reference Element required only if fallback model is possible
    const needsElement = model !== 'soul_cinematic'
    if (needsElement && !selectedElementId) return setLaunchError('Select a Reference Element (required for Auto/Seedream/Nano Banana)')

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
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">

        {/* ── Maintenance banner ── */}
        {SCRAPER_MAINTENANCE && (
          <div className="bg-amber-50/90 backdrop-blur-sm border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-amber-600 mt-0.5 shrink-0 text-base">🚧</span>
            <div>
              <p className="text-amber-800 text-sm font-medium">Scraper under maintenance</p>
              <p className="text-amber-700 text-xs mt-0.5">Instagram scraping is temporarily unavailable. Use Prompt Studio or Bulk Edit in the meantime.</p>
            </div>
          </div>
        )}

        {/* Form — grisé si maintenance */}
        <div className={SCRAPER_MAINTENANCE ? 'opacity-50 pointer-events-none select-none' : ''}>

        {/* Profils Instagram */}
        <div className="bg-white/75 backdrop-blur-xl shadow-sm border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Instagram Profiles</h2>
              <p className="text-xs text-gray-600 mt-0.5">Paste your Instagram links — separated by line breaks</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Max posts:</label>
              <input
                type="number"
                value={maxPosts}
                onChange={(e) => setMaxPosts(Number(e.target.value))}
                min={5}
                max={500}
                className="w-16 bg-white/80 border border-gray-200 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)]"
              />
            </div>
          </div>

          {/* Zone de paste multi-liens */}
          <textarea
            value={pasteInput}
            onChange={(e) => handlePasteInput(e.target.value)}
            placeholder={"Paste all your Instagram links at once:\nhttps://www.instagram.com/username1/\nhttps://www.instagram.com/username2/\n...\n\n(separated by line breaks, commas, or spaces)"}
            rows={5}
            className="w-full bg-white/80 border border-gray-200 backdrop-blur-sm rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)] transition text-sm resize-none font-mono"
          />

          {/* Profils parsés — chips supprimables */}
          {profiles.filter(p => p.trim()).length > 0 && (
            <div>
              <p className="text-xs text-gray-600 mb-2">
                {profiles.filter(p => p.trim()).length} profile{profiles.filter(p => p.trim()).length > 1 ? 's' : ''} detected:
              </p>
              <div className="flex flex-wrap gap-2">
                {profiles.map((p, i) => {
                  if (!p.trim()) return null
                  // Extraire le username pour l'affichage
                  const username = p.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') || p
                  return (
                    <span
                      key={i}
                      className="flex items-center gap-1 bg-white/60 border border-gray-200 rounded-full px-3 py-1 text-xs text-gray-800"
                    >
                      @{username}
                      <button
                        onClick={() => removeProfile(i)}
                        className="text-gray-600 hover:text-red-500 transition ml-1 leading-none text-sm"
                      >
                        ×
                      </button>
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Personnages */}
        <div className="bg-white/75 backdrop-blur-xl shadow-sm border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900">Character</h2>
            <button
              onClick={loadCharacters}
              disabled={loadingChars}
              className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              {loadingChars ? (
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
              ) : null}
              Load from Higgsfield
            </button>
          </div>

          {charsError && (
            <p className="text-red-600 text-sm mb-3 bg-red-50 border border-red-200 rounded px-3 py-2">
              {charsError}
            </p>
          )}

          {soulChars.length === 0 && refElements.length === 0 ? (
            <p className="text-gray-600 text-sm">
              Click &quot;Load from Higgsfield&quot; to see your characters.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Soul Characters */}
              {soulChars.length > 0 && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">
                    Soul Character :
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {soulChars.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedSoulId(c.id); setSelectedSoulName(c.name) }}
                        className={`px-4 py-3 rounded-xl border text-left transition ${
                          selectedSoulId === c.id
                            ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                            : 'bg-white/60 border-gray-200 text-gray-800 hover:border-gray-300 hover:text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className={`text-[11px] mt-0.5 ${selectedSoulId === c.id ? 'text-white/80' : 'text-gray-600'}`}>{c.type === 'soul_cinematic' ? 'Cinema' : 'Soul v2'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reference Elements — uniquement si mode non soul_cinematic */}
              {refElements.length > 0 && model !== 'soul_cinematic' && (
                <div>
                  <p className="text-xs text-gray-600 mb-2">
                    Reference Element :
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {refElements.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                        className={`px-4 py-3 rounded-xl border text-left transition ${
                          selectedElementId === e.id
                            ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                            : 'bg-white/60 border-gray-200 text-gray-800 hover:border-gray-300 hover:text-gray-900'
                        }`}
                      >
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className={`text-[11px] mt-0.5 ${selectedElementId === e.id ? 'text-white/80' : 'text-gray-600'}`}>Seedream / Nano Banana</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modèle & Format */}
        <div className="bg-white/75 backdrop-blur-xl shadow-sm border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-5">
          <h2 className="font-medium mb-3 text-gray-900">Model & Format</h2>

          {/* Model */}
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-2">Model</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'auto', label: 'Auto (cascade)', badge: 'Recommended' },
                { value: 'soul_cinematic', label: 'Soul Cinema', badge: null },
                { value: 'seedream_v4_5', label: 'Seedream 4.5', badge: null },
                { value: 'nano_banana_2', label: 'Nano Banana Pro', badge: null },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setModel(opt.value)}
                  className={`px-3 py-2.5 rounded-xl border text-left transition ${
                    model === opt.value
                      ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                      : 'bg-white/60 border-gray-200 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <p className="text-xs font-medium">{opt.label}</p>
                  {opt.badge && <span className={`text-[10px] ${model === opt.value ? 'text-white/80' : 'text-violet-600'}`}>{opt.badge}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Format & Qualité */}
          <div className="flex gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1.5">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="bg-white/80 border border-gray-200 backdrop-blur-sm rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)] transition"
              >
                <option value="2:3">2:3</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1.5">Quality</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="bg-white/80 border border-gray-200 backdrop-blur-sm rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 focus:shadow-[0_0_0_3px_rgba(109,40,217,0.15)] transition"
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
          <p className="text-red-700 text-sm bg-red-50/90 backdrop-blur-sm border border-red-200 rounded-lg px-4 py-3">
            {launchError}
          </p>
        )}

        {/* Bouton Lancer */}
        <button
          onClick={launch}
          disabled={launching}
          className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-[0_4px_16px_rgba(109,40,217,0.4)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.5)] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-4 text-base transition-all duration-200"
        >
          {launching ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
              Launching...
            </span>
          ) : 'Launch'}
        </button>

        </div>{/* end maintenance wrapper */}
      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
