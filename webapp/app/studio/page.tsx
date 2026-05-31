'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { NavBar } from '@/components/NavBar'
import { PageWrapper } from '@/components/PageWrapper'

// ─── Types ───────────────────────────────────────────────────────────────────

type SoulChar = { id: string; name: string; type: string; status: string }
type RefElement = { id: string; name: string }

type Selections = {
  lieu: string[]
  activite: string[]
  outfit: string[]
  bijoux: string[]
  background: string[]
  shotType: string[]
  colorGrade: string[]
  features: string[]
}

type GeneratedCard = {
  shortcode: string
  status: 'pending' | 'generating' | 'complete' | 'failed'
  url?: string
  model?: string
  fallback?: boolean
  prompt?: string
}

// ─── Données des chips ───────────────────────────────────────────────────────

const CHIPS: Record<keyof Selections, string[]> = {
  lieu: [
    'SoulCycle LA', 'Pilates WestHollywood', 'Equinox NYC', 'Rooftop Miami',
    'Erewhon LA', 'Café Paris', 'Dubai Marina', 'Hotel Dubai', 'Tesla LA', 'Apartment NYC',
    'Montmartre Paris', 'Hôtel de Crillon Paris', 'Beverly Hills Hotel pool',
    'Nobu Malibu terrace', 'Sweetgreen NYC', 'Whole Foods checkout',
    'SoulCycle Miami', 'Soho House NYC', 'Louvre courtyard', 'Bel-Air residential',
  ],
  activite: [
    'Sip matcha', 'Post-set barbell', 'Mid-stride', 'Scrolling phone',
    'Hair adjust', 'Tote & keys', 'Yoga mat sit', 'Mid-laugh',
    'Reaching for glass', 'Elevator button',
    'Reading book', 'Checking AirPods', 'Adjusting sunglasses', 'Unboxing bag',
    'Applying lip gloss', 'Grabbing coffee cup', 'Post-workout stretch', 'Window gazing',
  ],
  outfit: [
    'Alo full black', 'Lululemon grey', 'Vuori sage', 'Aritzia cream casual',
    'Leather jacket NYC', 'Linen summer', 'Skims & camel coat', 'White bikini',
    'Reformation floral mini', 'Zimmermann linen', 'Naked Wardrobe bodysuit',
    'Anine Bing blazer', 'Theory trouser set', 'Madewell denim jacket',
    'COS minimal white', 'Free People boho',
  ],
  bijoux: [
    'Mejuri + Cartier', 'Tiffany + Rolex', 'Pearl layered', 'No jewelry',
    'Dainty gold only', 'Bulgari + Hermès', 'Diamond studs only', 'Statement chain',
  ],
  background: [
    'Pilates studio', 'Spin class studio', 'Erewhon shelves', 'Apartment living room',
    'Tesla interior', 'Rooftop pool Miami', 'Kitchen morning', 'Dubai Marina walk',
    'NYC street corner', 'Paris café terrace', 'Gym locker room', 'Hotel bathroom mirror',
    'Yoga studio', 'Beverly Hills palm trees', 'SoHo storefront', 'Santa Monica beach walk',
  ],
  shotType: [
    'Selfie chest-up', 'Mirror full-body', 'Candid waist-up', 'Vlog POV', 'Close-up face',
    'Over-shoulder', 'Gym mirror waist-up',
  ],
  colorGrade: [
    'Warm morning', 'Cool airy', 'Golden hour', 'Fluorescent indoor', 'Evening warm',
    'Overcast grey', 'Bright midday', 'Blue hour twilight', 'Hard flash night',
  ],
  features: [
    'Freckles extensifs', 'Curly hair', 'Beauty mark',
    'Dimples', 'Long nails sculpted', 'High cheekbones',
  ],
}

const CATEGORY_LABELS: Record<keyof Selections, { emoji: string; label: string; multi: boolean }> = {
  lieu:       { emoji: '📍', label: 'LIEU',                   multi: true },
  activite:   { emoji: '🏃', label: 'ACTIVITÉ',               multi: true },
  outfit:     { emoji: '👗', label: 'OUTFIT',                  multi: true },
  bijoux:     { emoji: '💎', label: 'BIJOUX',                  multi: true },
  background: { emoji: '🌆', label: 'BACKGROUND',              multi: true },
  shotType:   { emoji: '📸', label: 'SHOT TYPE',               multi: true },
  colorGrade: { emoji: '🎨', label: 'COLOR GRADE',             multi: true },
  features:   { emoji: '✨', label: 'FEATURES DISTINCTIFS',    multi: true },
}

// ─── Composant Chip ──────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium
        border transition-all duration-150 select-none
        ${selected
          ? 'border-violet-500 bg-violet-950 text-white ring-1 ring-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.25)]'
          : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500 hover:text-white'
        }
      `}
    >
      {selected && (
        <svg className="w-3 h-3 text-violet-400 shrink-0" viewBox="0 0 12 12" fill="currentColor">
          <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      )}
      {label}
    </button>
  )
}

// ─── Composant Catégorie ─────────────────────────────────────────────────────

function CategorySection({
  catKey,
  selections,
  customChips,
  onToggle,
  onAddCustom,
  onClearAll,
}: {
  catKey: keyof Selections
  selections: Selections
  customChips: Record<keyof Selections, string[]>
  onToggle: (cat: keyof Selections, val: string) => void
  onAddCustom: (cat: keyof Selections, val: string) => void
  onClearAll: (cat: keyof Selections) => void
}) {
  const [customVal, setCustomVal] = useState('')
  const { emoji, label } = CATEGORY_LABELS[catKey]
  const selected = selections[catKey]
  const allChips = [...CHIPS[catKey], ...(customChips[catKey] || [])]
  const count = selected.length

  const handleAdd = () => {
    const v = customVal.trim()
    if (v) {
      onAddCustom(catKey, v)
      setCustomVal('')
    }
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
          {emoji} {label}
        </span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] bg-violet-900/60 text-violet-300 px-2 py-0.5 rounded-full border border-violet-800/50">
              {count} sélectionné{count > 1 ? 's' : ''}
            </span>
          )}
          {count > 0 && (
            <button
              onClick={() => onClearAll(catKey)}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition"
            >
              ✕ clear
            </button>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        {allChips.map((chip) => (
          <Chip
            key={chip}
            label={chip}
            selected={selected.includes(chip)}
            onClick={() => onToggle(catKey, chip)}
          />
        ))}

        {/* Custom input */}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder={`autre ${label.toLowerCase()}...`}
            className="h-[34px] bg-gray-900 border border-gray-700 rounded-full px-3 text-xs text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500 transition w-36"
          />
          <button
            onClick={handleAdd}
            className="h-[34px] px-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-full text-xs text-gray-400 hover:text-white transition whitespace-nowrap"
          >
            + ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Composant Card résultat ──────────────────────────────────────────────────

function GenerationCard({ card }: { card: GeneratedCard }) {
  const [showPrompt, setShowPrompt] = useState(false)

  const modelColor =
    card.model === 'soul_cinematic' ? 'bg-violet-600' :
    card.model === 'seedream_v4_5' ? 'bg-teal-600' :
    card.model === 'nano_banana_2' ? 'bg-orange-600' : 'bg-gray-600'

  return (
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-gray-900 border border-gray-800 group">
      {/* Skeleton */}
      {(card.status === 'pending' || card.status === 'generating') && (
        <div className="absolute inset-0 bg-gradient-to-br from-gray-800 via-gray-850 to-gray-800 animate-pulse">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-violet-500/50 border-t-violet-400 rounded-full animate-spin" />
            <span className="text-[10px] text-gray-500">
              {card.status === 'pending' ? 'en attente...' : 'génération...'}
            </span>
          </div>
        </div>
      )}

      {/* Image */}
      {card.status === 'complete' && card.url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.url}
            alt="Generated"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

          {/* Model badge */}
          <div className="absolute top-2 right-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${modelColor}`}>
              {card.model === 'soul_cinematic' ? 'Soul' :
               card.model === 'seedream_v4_5' ? 'Seedream' : 'Nano'}
              {card.fallback && ' ↩'}
            </span>
          </div>

          {/* Prompt on hover */}
          {card.prompt && (
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-lg p-1.5"
              title="Voir le prompt"
            >
              <svg className="w-3.5 h-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}
        </>
      )}

      {/* Failed */}
      {card.status === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-2xl">❌</span>
          <span className="text-[10px] text-gray-500">Échec génération</span>
        </div>
      )}

      {/* Prompt modal */}
      {showPrompt && card.prompt && (
        <div
          className="absolute inset-0 bg-black/95 p-3 overflow-y-auto z-10"
          onClick={() => setShowPrompt(false)}
        >
          <p className="text-[10px] text-gray-300 leading-relaxed">{card.prompt}</p>
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StudioPage() {
  const { data: session } = useSession()
  const router = useRouter()

  // Personnages
  const [soulChars, setSoulChars] = useState<SoulChar[]>([])
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedSoulId, setSelectedSoulId] = useState('')
  const [selectedSoulName, setSelectedSoulName] = useState('')
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)
  const [charsError, setCharsError] = useState('')

  // Format
  const [model, setModel] = useState('auto')
  const [aspectRatio, setAspectRatio] = useState('2:3')
  const [quality, setQuality] = useState('2k')

  // Sélections chips
  const emptySelections = (): Selections => ({
    lieu: [], activite: [], outfit: [], bijoux: [],
    background: [], shotType: [], colorGrade: [], features: [],
  })
  const [selections, setSelections] = useState<Selections>(emptySelections())
  const [customChips, setCustomChips] = useState<Record<keyof Selections, string[]>>({
    lieu: [], activite: [], outfit: [], bijoux: [],
    background: [], shotType: [], colorGrade: [], features: [],
  })

  // Nombre de générations (1-50)
  const [count, setCount] = useState(10)

  // État génération
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [cards, setCards] = useState<GeneratedCard[]>([])
  const [runStats, setRunStats] = useState({ completed: 0, failed: 0, total: 0, elapsed: 0 })
  const sseRef = useRef<EventSource | null>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  // Charger les defaults
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

  // Toggle chip
  const toggleChip = (cat: keyof Selections, val: string) => {
    setSelections((prev) => {
      const arr = prev[cat]
      return {
        ...prev,
        [cat]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val],
      }
    })
  }

  // Ajouter chip custom
  const addCustomChip = (cat: keyof Selections, val: string) => {
    setCustomChips((prev) => ({
      ...prev,
      [cat]: [...(prev[cat] || []), val],
    }))
    setSelections((prev) => ({
      ...prev,
      [cat]: [...prev[cat], val],
    }))
  }

  // Clear catégorie
  const clearCategory = (cat: keyof Selections) => {
    setSelections((prev) => ({ ...prev, [cat]: [] }))
  }

  // Total sélectionné
  const totalSelected = Object.values(selections).flat().length

  // Connexion SSE pour un runId
  const connectSSE = (runId: string, total: number) => {
    if (sseRef.current) sseRef.current.close()

    // Initialiser les cards en attente
    setCards(
      Array.from({ length: total }, (_, i) => ({
        shortcode: `studio_${i}`,
        status: 'pending',
      }))
    )

    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setRunStats((s) => ({ ...s, elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000) }))
    }, 1000)

    const es = new EventSource(`/api/run/${runId}/stream`)
    sseRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.totalPosts && data.totalPosts > 0) {
          setRunStats((s) => ({ ...s, total: data.totalPosts }))
        }

        setRunStats((s) => ({
          ...s,
          completed: data.completedPosts || 0,
          failed: data.failedPosts || 0,
        }))

        // Mettre à jour les cards depuis les générations
        if (data.generations?.length) {
          setCards((prev) => {
            const updated = [...prev]
            for (const gen of data.generations) {
              const idx = parseInt(gen.sourceShortcode?.replace('studio_', '') ?? '-1', 10)
              if (idx >= 0 && idx < updated.length) {
                updated[idx] = {
                  shortcode: gen.sourceShortcode,
                  status: gen.generationStatus === 'complete' ? 'complete'
                        : gen.generationStatus === 'failed' ? 'failed'
                        : gen.generationStatus === 'processing' ? 'generating'
                        : 'pending',
                  url: gen.generatedImageUrl || undefined,
                  model: gen.modelUsed || undefined,
                  fallback: gen.fallbackUsed || false,
                  prompt: gen.promptUsed || undefined,
                }
              }
            }
            return updated
          })
        }

        // Stop si run terminé
        if (data.status === 'completed' || data.status === 'failed') {
          es.close()
          if (timerRef.current) clearInterval(timerRef.current)
          setLaunching(false)
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      if (timerRef.current) clearInterval(timerRef.current)
      setLaunching(false)
    }
  }

  // Lancement d'un batch
  const launch = async (mode: 'batch_config' | 'random_full') => {
    if (!selectedSoulId) return setLaunchError('Sélectionner un Soul Character')
    if (!selectedElementId) return setLaunchError('Sélectionner un Reference Element')

    if (mode === 'batch_config' && totalSelected === 0) {
      return setLaunchError('Sélectionner au moins une option pour ce mode')
    }

    setLaunching(true)
    setLaunchError('')
    setActiveRunId(null)
    setCards([])
    setRunStats({ completed: 0, failed: 0, total: count, elapsed: 0 })

    try {
      const res = await fetch('/api/studio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections,
          mode,
          count,
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
        setActiveRunId(data.runId)
        connectSSE(data.runId, count)
        // Scroll vers les résultats
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      }
    } catch (e) {
      setLaunchError(String(e))
      setLaunching(false)
    }
  }

  const resetBatch = () => {
    if (sseRef.current) sseRef.current.close()
    if (timerRef.current) clearInterval(timerRef.current)
    setActiveRunId(null)
    setCards([])
    setRunStats({ completed: 0, failed: 0, total: 0, elapsed: 0 })
    setLaunching(false)
    setLaunchError('')
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#09090b]">
      <NavBar />
      <PageWrapper>
      {/* Main content */}
      <div className="flex min-h-[calc(100vh-113px)]">

        {/* LEFT — config panel */}
        <div className="w-72 shrink-0 border-r border-gray-800 p-5 space-y-5 sticky top-[113px] self-start max-h-[calc(100vh-113px)] overflow-y-auto">

          {/* Character */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">🎭 Personnage</h3>
            <button
              onClick={loadCharacters}
              disabled={loadingChars}
              className="w-full text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition flex items-center justify-center gap-1.5 py-1.5 border border-violet-900/50 rounded-lg hover:border-violet-700 bg-violet-950/20"
            >
              {loadingChars ? '⏳' : '↻'} Charger depuis Higgsfield
            </button>

            {charsError && (
              <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded px-2 py-1.5">
                {charsError}
              </p>
            )}

            {soulChars.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-600 mb-1.5">Soul Character</p>
                <div className="flex flex-wrap gap-1.5">
                  {soulChars.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedSoulId(c.id); setSelectedSoulName(c.name) }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                        selectedSoulId === c.id
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {refElements.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-600 mb-1.5">Reference Element</p>
                <div className="flex flex-wrap gap-1.5">
                  {refElements.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition border ${
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

          {/* Divider */}
          <div className="border-t border-gray-800" />

          {/* Format */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">⚙️ Format</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {/* Model */}
              <div className="col-span-3">
                <label className="text-[10px] text-gray-600 block mb-1">Modèle</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="auto">Auto (cascade)</option>
                  <option value="soul_cinematic">Soul Cinema</option>
                  <option value="seedream_v4_5">Seedream 4.5</option>
                  <option value="nano_banana_2">Nano Banana</option>
                </select>
              </div>
              {/* Aspect */}
              <div>
                <label className="text-[10px] text-gray-600 block mb-1">Format</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2:3">2:3</option>
                  <option value="1:1">1:1</option>
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
              </div>
              {/* Quality */}
              <div className="col-span-2">
                <label className="text-[10px] text-gray-600 block mb-1">Qualité</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2k">2K</option>
                  <option value="4k">4K</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-800" />

          {/* Error */}
          {launchError && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-800 rounded px-2 py-1.5">
              {launchError}
            </p>
          )}

          {/* Count selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">
              Nombre de générations
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-violet-500 transition"
              />
              <input
                type="range"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="flex-1 accent-violet-500 h-1.5"
              />
              <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-2">
            {/* Dans ma sélection */}
            <button
              onClick={() => launch('batch_config')}
              disabled={launching}
              className="w-full relative overflow-hidden bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 shadow-lg shadow-violet-900/30"
            >
              {launching ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Génération...
                </span>
              ) : (
                <>🎨 {count} prompt{count > 1 ? 's' : ''} · ma sélection</>
              )}
            </button>

            {/* Random full */}
            <button
              onClick={() => launch('random_full')}
              disabled={launching}
              className="w-full border-2 border-dashed border-gray-700 hover:border-fuchsia-600/70 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover:text-white font-medium rounded-xl py-2.5 text-sm transition-all duration-200 flex items-center justify-center gap-2"
            >
              <span>🎲</span>
              <span>{count} prompt{count > 1 ? 's' : ''} · full aléatoire</span>
            </button>
          </div>

          {/* Reset si run actif */}
          {activeRunId && (
            <button
              onClick={resetBatch}
              className="w-full text-xs text-gray-500 hover:text-gray-300 transition py-1"
            >
              ↺ Nouveau batch
            </button>
          )}
        </div>

        {/* RIGHT — chip selector */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">

          {/* Stats bar si sélection non nulle */}
          {totalSelected > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span>
                <span className="text-white font-medium">{totalSelected}</span> option{totalSelected > 1 ? 's' : ''} sélectionnée{totalSelected > 1 ? 's' : ''}
              </span>
              <span className="text-gray-600">·</span>
              <span>
                {Object.values(selections).filter(arr => arr.length > 0).length} catégorie{Object.values(selections).filter(arr => arr.length > 0).length > 1 ? 's' : ''} actives
              </span>
              <button
                onClick={() => setSelections(emptySelections())}
                className="ml-auto text-gray-600 hover:text-gray-300 transition"
              >
                tout effacer
              </button>
            </div>
          )}

          {/* Grid chips par catégorie */}
          <div className="grid grid-cols-1 gap-5">
            {(Object.keys(CHIPS) as (keyof Selections)[]).map((cat) => (
              <div key={cat} className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
                <CategorySection
                  catKey={cat}
                  selections={selections}
                  customChips={customChips}
                  onToggle={toggleChip}
                  onAddCustom={addCustomChip}
                  onClearAll={clearCategory}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Results section */}
      {cards.length > 0 && (
        <div ref={resultsRef} className="border-t border-gray-800 bg-gray-950/80">
          {/* Stats bar */}
          <div className="px-6 py-4 flex items-center gap-4 border-b border-gray-800/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-semibold text-white">{runStats.completed}</span>
              <span className="text-xs text-gray-500">complétées</span>
            </div>
            <div className="w-px h-4 bg-gray-800" />
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-sm font-semibold text-white">{runStats.failed}</span>
              <span className="text-xs text-gray-500">échouées</span>
            </div>
            <div className="w-px h-4 bg-gray-800" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{runStats.total} total</span>
            </div>
            <div className="w-px h-4 bg-gray-800" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                ⏱ {Math.floor(runStats.elapsed / 60)}:{String(runStats.elapsed % 60).padStart(2, '0')}
              </span>
            </div>
            {/* Progress bar */}
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                style={{ width: `${runStats.total > 0 ? (runStats.completed / runStats.total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs text-gray-500">
              {runStats.total > 0 ? Math.round((runStats.completed / runStats.total) * 100) : 0}%
            </span>

            {activeRunId && (
              <Link
                href={`/run/${activeRunId}`}
                target="_blank"
                className="text-xs text-violet-400 hover:text-violet-300 transition ml-2"
              >
                ↗ Voir run complet
              </Link>
            )}
          </div>

          {/* Grid images */}
          <div className="p-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {cards.map((card) => (
              <GenerationCard key={card.shortcode} card={card} />
            ))}
          </div>
        </div>
      )}
      </PageWrapper>
    </div>
  )
}
