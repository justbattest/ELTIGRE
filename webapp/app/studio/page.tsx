'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

// ─── Types ───────────────────────────────────────────────────────────────────

type SoulChar = { id: string; name: string; type: string; status: string }
type RefElement = { id: string; name: string }

type RunBatch = {
  runId: string
  label: string
  cards: GeneratedCard[]
  stats: { completed: number; failed: number; total: number; elapsed: number }
  status: 'running' | 'completed' | 'failed'
  launchedAt: number
}

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
    'Extensive freckles', 'Curly hair', 'Beauty mark',
    'Dimples', 'Long nails sculpted', 'High cheekbones',
  ],
}

// ─── Données niche ───────────────────────────────────────────────────────────

type NicheKey = 'conference' | 'sport' | 'golf' | 'vieux' | 'meteo' | 'serveuse' | 'mcdo' | 'skatepark'

const NICHE_LABELS: Record<NicheKey, string> = {
  conference: '🎓 Conference',
  sport: '🏃 Coach',
  golf: '⛳ Golf',
  vieux: '👴 Elderly',
  meteo: '📺 Weather',
  serveuse: '🍸 Server',
  mcdo: '🍔 McDonalds',
  skatepark: '🛹 Skatepark',
}

const NICHE_CHIPS: Record<NicheKey, Partial<Record<keyof Selections, string[]>>> = {
  conference: {
    lieu: ['Conference room corporate', 'Stage main screen', 'Meeting room glass walls', 'TEDx red stage', 'Hotel ballroom conference'],
    activite: ['Presenting at podium', 'Speaking at microphone', 'Gesturing to slides', 'Taking notes laptop', 'Networking handshake'],
    outfit: ['Fitted blazer power suit', 'Silk blouse tailored pants', 'Professional wrap dress', 'Structured blazer pencil skirt'],
    shotType: ['Candid waist-up', 'Selfie chest-up', 'Mirror full-body'],
    colorGrade: ['Cool airy', 'Warm morning', 'Office fluorescent'],
  },
  sport: {
    lieu: ['SoulCycle LA', 'Pilates West Hollywood', 'Equinox NYC', 'Gym mirror wall', 'Rooftop workout'],
    activite: ['Post-set barbell', 'Mid-stride run', 'Yoga warrior pose', 'Jump rope cardio', 'Stretching cool-down'],
    outfit: ['Alo full black', 'Lululemon grey', 'Nike crop + leggings', 'Gymshark neon'],
    shotType: ['Mirror full-body', 'Candid waist-up', 'Selfie chest-up'],
    colorGrade: ['Cool airy', 'High contrast sport'],
  },
  golf: {
    lieu: ['Golf course fairway', 'Club putting green', 'Golf cart path', 'Clubhouse terrace', 'Driving range'],
    activite: ['Mid golf swing', 'Putting stance', 'Walking fairway bag', 'Checking scorecard'],
    outfit: ['Pink pleated golf skirt + white polo', 'Black golf skirt + navy polo', 'Light blue golf dress + visor', 'White golf skirt + pink polo'],
    shotType: ['Candid waist-up', 'Mirror full-body', 'Candid full-body'],
    colorGrade: ['Golden hour', 'Warm morning', 'Cool airy'],
  },
  vieux: {
    // Niche infirmière / restaurant — vibe clinique chic ou salle gastronomique
    // Outfits tirés des prompts vidéo Vieux (NURSE_OUTFITS + RESTAURANT_OUTFITS)
    lieu: [
      'Luxury private clinic corridor Paris warm lighting',
      'Upscale gastronomic restaurant golden candlelight',
      'Hospital nurses station modern reception desk',
      'High-end nursing home elegant lounge velvet armchairs',
      'French restaurant kitchen entrance chef whites blurred background',
    ],
    activite: [
      'Carrying silver medication tray both hands smiling',
      'Writing on patient clipboard leaning against wall',
      'Presenting dessert plate tableside elegantly',
      'Adjusting IV drip stand beside bed calm expression',
      'Taking blood pressure attentive caring gaze',
      'Holding wine bottle presenting to table',
    ],
    outfit: [
      'Extremely short white nurse uniform deep V-neckline hemline top of thighs black stiletto heels',
      'Extremely short pastel pink nurse uniform open neckline hemline top of thighs nude heels',
      'Extremely short navy scrubs deep open neckline hemline top of thighs black heels',
      'White deep-V bodysuit open neckline generous cleavage',
      'Black fitted low-cut top with deep generous cleavage',
      'Blush silk blouse very low-cut deep cleavage',
    ],
    background: [
      'Hospital hallway white walls soft warm overhead lights',
      'Elegant dining room white tablecloths crystal glasses candlelight',
      'Medical supply room chrome shelves clean clinical',
      'Restaurant bar aged wood warm amber lighting bottles',
    ],
    shotType: ['Candid waist-up', 'Selfie chest-up', 'Candid full-body'],
    colorGrade: ['Warm morning', 'Office fluorescent', 'Golden hour'],
  },
  meteo: {
    lieu: ['TV studio news desk', 'Weather green screen studio', 'Outdoor storm reporter', 'News anchor modern set'],
    activite: ['Pointing at weather map', 'Live reporting rain storm', 'Holding mic wind reporting', 'Reading teleprompter'],
    outfit: ['Blue lace wrap dress', 'Red fitted blazer mini dress', 'White fitted pencil dress', 'Camel blazer + nude mini'],
    shotType: ['Candid waist-up', 'Selfie chest-up', 'Vlog POV'],
    colorGrade: ['Cool airy', 'Office fluorescent', 'Golden hour'],
  },
  serveuse: {
    lieu: ['Upscale restaurant dining room golden candlelight', 'Cocktail bar low amber lighting', 'Hotel rooftop bar city view', 'Wine bar velvet booths', 'Brasserie mirror walls evening'],
    activite: ['Carrying cocktail tray both hands', 'Presenting menu tableside smiling', 'Pouring wine glass elegantly', 'Taking order at table notepad', 'Standing behind polished bar'],
    outfit: ['Black jumpsuit deep-V zipper server', 'White fitted server blouse + black mini', 'Black deep-V fitted server dress', 'Burgundy fitted uniform deep-V', 'Black satin top + fitted mini skirt badge'],
    shotType: ['Candid waist-up', 'Selfie chest-up', 'Candid full-body'],
    colorGrade: ['Warm amber restaurant', 'Golden hour', 'Warm morning'],
  },
  mcdo: {
    lieu: ["McDonald's counter register", 'Drive-thru window car background', "McDonald's restaurant floor", 'Fast food kitchen fry station blurred'],
    activite: ['Handing paper bag at counter smiling', 'Smiling at drive-thru window', 'Taking order on register screen', 'Holding drinks tray', 'Checking order at fryer station'],
    outfit: ['Grey polo golden M logo + blonde ponytail', 'Black polo golden M logo + brunette', 'Red polo + McDo cap dark hair', 'Grey polo + long red hair loose', 'Navy polo + bun + McDo lanyard'],
    shotType: ['Candid waist-up', 'Selfie chest-up', 'Candid full-body'],
    colorGrade: ['Office fluorescent', 'Cool airy', 'Warm morning'],
  },
  skatepark: {
    lieu: ['Concrete skatepark bowl graffiti walls', 'Urban plaza metal rail spot', 'Abandoned warehouse concrete floor', 'Downtown rooftop skatepark city skyline', 'Street corner concrete steps'],
    activite: ['Sitting on concrete ledge holding skateboard', 'Leaning on metal rail looking away', 'Watching skaters arms crossed', 'Posing board underarm against wall', 'Crouching on halfpipe edge'],
    outfit: ['Very short mini skirt + black deep-V crop top', 'Very short denim mini skirt + white crop top', 'Very short black pleated skirt + grey crop top high ponytail', 'Very short pink mini skirt + black crop top', 'Very short white mini skirt + red crop top'],
    shotType: ['Candid full-body', 'Candid waist-up', 'Selfie chest-up'],
    colorGrade: ['Golden hour', 'Cool airy', 'High contrast sport'],
  },
}

const CATEGORY_LABELS: Record<keyof Selections, { emoji: string; label: string; multi: boolean }> = {
  lieu:       { emoji: '📍', label: 'LOCATION',                multi: true },
  activite:   { emoji: '🏃', label: 'ACTIVITY',                multi: true },
  outfit:     { emoji: '👗', label: 'OUTFIT',                  multi: true },
  bijoux:     { emoji: '💎', label: 'JEWELRY',                 multi: true },
  background: { emoji: '🌆', label: 'BACKGROUND',              multi: true },
  shotType:   { emoji: '📸', label: 'SHOT TYPE',               multi: true },
  colorGrade: { emoji: '🎨', label: 'COLOR GRADE',             multi: true },
  features:   { emoji: '✨', label: 'DISTINCTIVE FEATURES',    multi: true },
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
          ? 'border-violet-500 bg-violet-600 text-white ring-1 ring-violet-500/30 shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
          : 'border-gray-200 bg-white/60 text-gray-800 hover:border-gray-300 hover:text-gray-900'
        }
      `}
    >
      {selected && (
        <svg className="w-3 h-3 text-violet-600 shrink-0" viewBox="0 0 12 12" fill="currentColor">
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
        <span className="text-[10px] font-semibold tracking-widest text-gray-700 uppercase">
          {emoji} {label}
        </span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="text-[10px] bg-violet-100/80 text-violet-700 px-2 py-0.5 rounded-full border border-violet-300">
              {count} selected
            </span>
          )}
          {count > 0 && (
            <button
              onClick={() => onClearAll(catKey)}
              className="text-[10px] text-gray-800 hover:text-gray-800 transition"
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
            placeholder={`other ${label.toLowerCase()}...`}
            className="h-[34px] bg-white/80 border border-gray-300 backdrop-blur-sm rounded-full px-3 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition w-36"
          />
          <button
            onClick={handleAdd}
            className="h-[34px] px-3 bg-white/50 hover:bg-white/60 border border-gray-200 rounded-full text-xs text-gray-700 hover:text-gray-900 transition whitespace-nowrap"
          >
            + add
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
    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/50 border border-white/60 group">
      {/* Skeleton */}
      {(card.status === 'pending' || card.status === 'generating') && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-violet-50/40 to-white/60 animate-pulse">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-violet-500/50 border-t-violet-400 rounded-full animate-spin" />
            <span className="text-[10px] text-gray-700">
              {card.status === 'pending' ? 'pending...' : 'generating...'}
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
              title="View prompt"
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
          <span className="text-[10px] text-gray-700">Generation failed</span>
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

  // Mode studio
  const [studioMode, setStudioMode] = useState<'selection' | 'niche'>('selection')
  const [selectedNiche, setSelectedNiche] = useState<NicheKey>('conference')
  const [nicheCount, setNicheCount] = useState(8)

  // État génération — multi-batch
  const [launching, setLaunching] = useState(false)  // true uniquement pendant le POST (quelques secondes)
  const [launchError, setLaunchError] = useState('')
  const [runs, setRuns] = useState<RunBatch[]>([])
  // Map runId → { sse, timer } pour gérer les connexions actives
  const activeRunsRef = useRef<Map<string, { sse: EventSource; timer: ReturnType<typeof setInterval> }>>(new Map())
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

  // Connexion SSE pour un runId — met à jour ce run dans le tableau
  const connectSSE = (runId: string, total: number) => {
    const startTime = Date.now()

    const timer = setInterval(() => {
      setRuns((prev) => prev.map((r) =>
        r.runId === runId
          ? { ...r, stats: { ...r.stats, elapsed: Math.floor((Date.now() - startTime) / 1000) } }
          : r
      ))
    }, 1000)

    const es = new EventSource(`/api/run/${runId}/stream`)
    activeRunsRef.current.set(runId, { sse: es, timer })

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        setRuns((prev) => prev.map((run) => {
          if (run.runId !== runId) return run

          // Stats
          const updatedStats = {
            ...run.stats,
            completed: data.completedPosts ?? run.stats.completed,
            failed:    data.failedPosts    ?? run.stats.failed,
            total:     (data.totalPosts && data.totalPosts > 0) ? data.totalPosts : run.stats.total,
          }

          // Cards depuis les générations
          let updatedCards = [...run.cards]
          if (data.generations?.length) {
            for (const gen of data.generations) {
              const idx = parseInt(gen.sourceShortcode?.replace('studio_', '') ?? '-1', 10)
              if (idx >= 0 && idx < updatedCards.length) {
                updatedCards[idx] = {
                  shortcode: gen.sourceShortcode,
                  status: gen.generationStatus === 'complete'   ? 'complete'
                        : gen.generationStatus === 'failed'     ? 'failed'
                        : gen.generationStatus === 'processing' ? 'generating'
                        : 'pending',
                  url:      gen.generatedImageUrl || undefined,
                  model:    gen.modelUsed         || undefined,
                  fallback: gen.fallbackUsed      || false,
                  prompt:   gen.promptUsed        || undefined,
                }
              }
            }
          }

          // Statut final
          const isDone = data.status === 'completed' || data.status === 'failed'
          if (isDone) {
            const handle = activeRunsRef.current.get(runId)
            if (handle) { handle.sse.close(); clearInterval(handle.timer) }
            activeRunsRef.current.delete(runId)
          }

          return {
            ...run,
            stats: updatedStats,
            cards: updatedCards,
            status: isDone ? (data.status === 'completed' ? 'completed' : 'failed') : 'running',
          }
        }))
      } catch {}
    }

    es.onerror = () => {
      const handle = activeRunsRef.current.get(runId)
      if (handle) { handle.sse.close(); clearInterval(handle.timer) }
      activeRunsRef.current.delete(runId)
      setRuns((prev) => prev.map((r) =>
        r.runId === runId ? { ...r, status: 'failed' } : r
      ))
    }
  }

  // Crée un nouveau batch dans le tableau et lance le SSE
  const startBatch = (runId: string, total: number, label: string) => {
    const newBatch: RunBatch = {
      runId,
      label,
      cards: Array.from({ length: total }, (_, i) => ({ shortcode: `studio_${i}`, status: 'pending' })),
      stats: { completed: 0, failed: 0, total, elapsed: 0 },
      status: 'running',
      launchedAt: Date.now(),
    }
    setRuns((prev) => [newBatch, ...prev])
    connectSSE(runId, total)
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  // Lancement d'un batch
  const launch = async (mode: 'batch_config' | 'random_full') => {
    if (!selectedSoulId) return setLaunchError('Select a Soul Character')
    if (!selectedElementId) return setLaunchError('Select a Reference Element')
    if (mode === 'batch_config' && totalSelected === 0) {
      return setLaunchError('Select at least one option for this mode')
    }

    setLaunching(true)
    setLaunchError('')

    try {
      const res = await fetch('/api/studio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections, mode, count,
          soulId: selectedSoulId,
          elementId: selectedElementId,
          characterName: selectedSoulName || selectedElementName,
          model, aspectRatio, quality,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setLaunchError(data.error)
      } else {
        const label = `${count} · ${mode === 'random_full' ? '🎲 random' : '✨ selection'}`
        startBatch(data.runId, count, label)
      }
    } catch (e) {
      setLaunchError(String(e))
    } finally {
      setLaunching(false)  // débloquer immédiatement après la création du run
    }
  }

  const launchNiche = async () => {
    if (!selectedSoulId) return setLaunchError('Select a Soul Character.')

    setLaunchError('')
    setLaunching(true)

    const nichePool = NICHE_CHIPS[selectedNiche]
    const nicheSelections: Selections = {
      lieu: nichePool.lieu || [],
      activite: nichePool.activite || [],
      outfit: nichePool.outfit || [],
      bijoux: [],
      background: nichePool.background || [],
      shotType: nichePool.shotType || [],
      colorGrade: nichePool.colorGrade || [],
      features: [],
    }

    try {
      const res = await fetch('/api/studio/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selections: nicheSelections,
          mode: 'batch_config',
          count: nicheCount,
          soulId: selectedSoulId,
          elementId: selectedElementId,
          characterName: selectedSoulName || selectedElementName,
          model, aspectRatio, quality,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setLaunchError(data.error || 'Error during launch')
      } else {
        const label = `${nicheCount} · ${NICHE_LABELS[selectedNiche]}`
        startBatch(data.runId, nicheCount, label)
      }
    } catch (e) {
      setLaunchError(String(e))
    } finally {
      setLaunching(false)
    }
  }

  const removeRun = (runId: string) => {
    const handle = activeRunsRef.current.get(runId)
    if (handle) { handle.sse.close(); clearInterval(handle.timer) }
    activeRunsRef.current.delete(runId)
    setRuns((prev) => prev.filter((r) => r.runId !== runId))
  }

  const clearAllRuns = () => {
    activeRunsRef.current.forEach(({ sse, timer }) => { sse.close(); clearInterval(timer) })
    activeRunsRef.current.clear()
    setRuns([])
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      {/* Main content */}
      <div className="flex min-h-[calc(100vh-113px)]">

        {/* LEFT — config panel */}
        <div className="w-72 shrink-0 border-r border-white/60 p-5 space-y-5 sticky top-[113px] self-start max-h-[calc(100vh-113px)] overflow-y-auto bg-white/30 backdrop-blur-sm">

          {/* Character */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-semibold tracking-widest text-gray-700 uppercase">🎭 Character</h3>
            <button
              onClick={loadCharacters}
              disabled={loadingChars}
              className="w-full text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5 py-1.5 border border-violet-300 rounded-lg hover:border-violet-400 bg-violet-50/80"
            >
              {loadingChars ? (
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
            ) : null}
            Load from Higgsfield
            </button>

            {charsError && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5">
                {charsError}
              </p>
            )}

            {soulChars.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-700 mb-1.5">Soul Character</p>
                <div className="flex flex-wrap gap-1.5">
                  {soulChars.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedSoulId(c.id); setSelectedSoulName(c.name) }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                        selectedSoulId === c.id
                          ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                          : 'bg-white/60 border-gray-200 text-gray-800 hover:border-gray-300'
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
                <p className="text-[10px] text-gray-700 mb-1.5">Reference Element</p>
                <div className="flex flex-wrap gap-1.5">
                  {refElements.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                      className={`px-2.5 py-1 rounded-lg text-xs transition border ${
                        selectedElementId === e.id
                          ? 'bg-violet-600 border-violet-500 text-white shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                          : 'bg-white/60 border-gray-200 text-gray-800 hover:border-gray-300'
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
          <div className="border-t border-white/60" />

          {/* Format */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-semibold tracking-widest text-gray-700 uppercase">⚙️ Format</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {/* Model */}
              <div className="col-span-3">
                <label className="text-[10px] text-gray-700 block mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/80 border border-gray-300 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition"
                >
                  <option value="auto">Auto (cascade)</option>
                  <option value="soul_cinematic">Soul Cinema</option>
                  <option value="seedream_v4_5">Seedream 4.5</option>
                  <option value="nano_banana_2">Nano Banana</option>
                </select>
              </div>
              {/* Aspect */}
              <div>
                <label className="text-[10px] text-gray-700 block mb-1">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full bg-white/80 border border-gray-300 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition"
                >
                  <option value="2:3">2:3</option>
                  <option value="1:1">1:1</option>
                  <option value="9:16">9:16</option>
                  <option value="16:9">16:9</option>
                </select>
              </div>
              {/* Quality */}
              <div className="col-span-2">
                <label className="text-[10px] text-gray-700 block mb-1">Quality</label>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value)}
                  className="w-full bg-white/80 border border-gray-300 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-xs focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition"
                >
                  <option value="2k">2K</option>
                  <option value="4k">4K</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/60" />

          {/* Error */}
          {launchError && (
            <p className="text-red-700 text-xs bg-red-50/90 backdrop-blur-sm border border-red-200 rounded px-2 py-1.5">
              {launchError}
            </p>
          )}

          {/* Count selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-semibold tracking-widest text-gray-700 uppercase">
              Number of generations
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                className="w-14 bg-white/80 border border-gray-300 backdrop-blur-sm rounded-lg px-2 py-1.5 text-gray-900 text-sm text-center focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30 transition"
              />
              <input
                type="range"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="flex-1 accent-violet-500 h-1.5"
              />
              <span className="text-xs text-gray-700 w-6 text-right">{count}</span>
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setStudioMode('selection')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                studioMode === 'selection'
                  ? 'bg-violet-600 text-white border-violet-500 shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                  : 'bg-white/60 text-gray-700 border-gray-200 hover:text-gray-900'
              }`}
            >
              ✨ My selection
            </button>
            <button
              onClick={() => setStudioMode('niche')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${
                studioMode === 'niche'
                  ? 'bg-violet-600 text-white border-violet-500 shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                  : 'bg-white/60 text-gray-700 border-gray-200 hover:text-gray-900'
              }`}
            >
              🎯 By niche
            </button>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-2">
            {studioMode === 'selection' ? (
              <>
                <button
                  onClick={() => launch('batch_config')}
                  disabled={launching}
                  className="w-full relative overflow-hidden bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all duration-200 shadow-[0_4px_16px_rgba(109,40,217,0.4)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.5)]"
                >
                  {launching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Launching...
                    </span>
                  ) : (
                    <>🎨 {count} prompt{count > 1 ? 's' : ''} · my selection</>
                  )}
                </button>

                <button
                  onClick={() => launch('random_full')}
                  disabled={launching}
                  className="w-full border-2 border-dashed border-gray-300 hover:border-fuchsia-600/70 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 hover:text-gray-900 font-medium rounded-xl py-2.5 text-sm transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <span>🎲</span>
                  <span>{count} prompt{count > 1 ? 's' : ''} · fully random</span>
                </button>
              </>
            ) : (
              <button
                onClick={launchNiche}
                disabled={launching || !selectedSoulId}
                className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-4 transition-all duration-200"
              >
                {launching
                  ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg> Launching...</span>
                  : `🎯 Generate ${nicheCount} image${nicheCount > 1 ? 's' : ''} ${NICHE_LABELS[selectedNiche]}`
                }
              </button>
            )}
          </div>

          {/* Clear all batches */}
          {runs.length > 0 && (
            <button
              onClick={clearAllRuns}
              className="w-full text-xs text-gray-600 hover:text-gray-800 transition py-1"
            >
              ✕ Clear all results
            </button>
          )}
        </div>

        {/* RIGHT — chip selector */}
        <div className="flex-1 p-6 space-y-6 overflow-y-auto">

          <TutorialVideo videoId="smPXJBLI4e4" title="Prompt Studio" />

          {/* Stats bar si sélection non nulle */}
          {studioMode === 'selection' && totalSelected > 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-700 bg-white/50 border border-white/60 backdrop-blur-sm rounded-xl px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
              <span>
                <span className="text-gray-900 font-medium">{totalSelected}</span> option{totalSelected > 1 ? 's' : ''} selected
              </span>
              <span className="text-gray-300">·</span>
              <span>
                {Object.values(selections).filter(arr => arr.length > 0).length} active categor{Object.values(selections).filter(arr => arr.length > 0).length > 1 ? 'ies' : 'y'}
              </span>
              <button
                onClick={() => setSelections(emptySelections())}
                className="ml-auto text-gray-600 hover:text-gray-800 transition"
              >
                clear all
              </button>
            </div>
          )}

          {/* Grid chips par catégorie */}
          {studioMode === 'selection' && (
            <div className="grid grid-cols-1 gap-5">
              {(Object.keys(CHIPS) as (keyof Selections)[]).map((cat) => (
                <div key={cat} className="bg-white/75 backdrop-blur-xl border border-white/80 shadow-[0_4px_24px_rgba(109,40,217,0.09),_inset_0_0_0_1px_rgba(255,255,255,0.5)] rounded-xl p-4">
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
          )}

          {/* ── Mode Niche ──────────────────────────────────────────── */}
          {studioMode === 'niche' && (
            <div className="space-y-4">
              {/* Niche selector */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Niche</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(NICHE_LABELS) as NicheKey[]).map(key => (
                    <button
                      key={key}
                      onClick={() => setSelectedNiche(key)}
                      className={`px-3 py-2 rounded-xl text-sm font-medium border transition ${
                        selectedNiche === key
                          ? 'bg-violet-600 text-white border-violet-500 shadow-[0_4px_12px_rgba(109,40,217,0.35)]'
                          : 'bg-white/60 text-gray-700 border-gray-200 hover:text-gray-900 hover:border-gray-300'
                      }`}
                    >
                      {NICHE_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Count */}
              <div>
                <p className="text-xs text-gray-700 mb-2">
                  Number of images: <span className="text-gray-900 font-medium">{nicheCount}</span>
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={nicheCount}
                    onChange={e => setNicheCount(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">{nicheCount}</span>
                </div>
              </div>

              {/* Preview of what will be used */}
              <div className="bg-white/50 border border-white/60 backdrop-blur-sm rounded-xl p-3">
                <p className="text-[11px] text-gray-700">
                  Generates {nicheCount} image{nicheCount > 1 ? 's' : ''} with random chips {NICHE_LABELS[selectedNiche]} —
                  locations, outfits, activities and framing adapted to the niche.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Results section — multi-batch */}
      {runs.length > 0 && (
        <div ref={resultsRef} className="border-t border-white/60 space-y-0">
          {runs.map((run) => (
            <div key={run.runId} className="border-b border-white/60 bg-white/60 backdrop-blur-sm">
              {/* Stats bar */}
              <div className="px-6 py-3 flex items-center gap-3 border-b border-white/60">
                {/* Label + statut */}
                <div className="flex items-center gap-2 shrink-0">
                  {run.status === 'running' && (
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                  )}
                  {run.status === 'completed' && (
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  )}
                  {run.status === 'failed' && (
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                  )}
                  <span className="text-xs font-medium text-gray-800">{run.label}</span>
                </div>

                <div className="w-px h-4 bg-gray-200 shrink-0" />

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm font-semibold text-gray-900">{run.stats.completed}</span>
                  <span className="text-xs text-gray-700">✓</span>
                </div>
                {run.stats.failed > 0 && (
                  <>
                    <div className="w-px h-4 bg-gray-200 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm font-semibold text-red-600">{run.stats.failed}</span>
                      <span className="text-xs text-gray-700">✗</span>
                    </div>
                  </>
                )}
                <div className="w-px h-4 bg-gray-200 shrink-0" />
                <span className="text-xs text-gray-700 shrink-0">
                  ⏱ {Math.floor(run.stats.elapsed / 60)}:{String(run.stats.elapsed % 60).padStart(2, '0')}
                </span>

                {/* Progress bar */}
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                    style={{ width: `${run.stats.total > 0 ? (run.stats.completed / run.stats.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-700 shrink-0">
                  {run.stats.total > 0 ? Math.round((run.stats.completed / run.stats.total) * 100) : 0}%
                </span>

                <Link
                  href={`/run/${run.runId}`}
                  target="_blank"
                  className="text-xs text-violet-600 hover:text-violet-700 transition shrink-0"
                >
                  ↗
                </Link>

                <button
                  onClick={() => removeRun(run.runId)}
                  className="text-gray-600 hover:text-gray-800 transition text-xs shrink-0"
                  title="Remove this batch"
                >
                  ✕
                </button>
              </div>

              {/* Grid images */}
              <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {run.cards.map((card) => (
                  <GenerationCard key={card.shortcode} card={card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      </PageWrapper>
      </main>
    </div>
  )
}
