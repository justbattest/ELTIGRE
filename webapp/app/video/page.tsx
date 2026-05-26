'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string }
type Niche = 'conference' | 'golf'

// ─── Variable pools (mirrors pipeline/video_prompts.py) ───────────────────────

const CONFERENCE_POOLS = {
  scenarios: [
    { value: 'standing_pacing', label: '🎤 Face au public — scène' },
    { value: 'seated_undertable', label: '🪑 Assise — sous table' },
    { value: 'back_to_audience', label: '🔄 Dos au public' },
    { value: 'microphone_standing', label: '🎙 Au micro — chuchotement' },
  ],
  tops: [
    'white fitted long-sleeve top',
    'white button-down shirt with deep open neckline',
    'blue fitted button-down shirt deep open neckline',
    'black fitted top deep v-neckline',
    'beige ribbed knit top open neckline',
    'cream silk blouse unbuttoned slightly at the neckline',
    'white fitted crop blazer open neckline',
  ],
  skirts: [
    'extremely short tight black mini skirt',
    'extremely short tight dark navy mini skirt',
    'extremely short dark charcoal pencil mini skirt',
    'extremely short dark brown leather-look mini skirt',
  ],
  heels: [
    'beige stiletto heels',
    'black stiletto heels',
    'nude stiletto heels',
    'white stiletto heels',
  ],
  underwear_colors: ['red', 'white', 'black', 'nude beige'],
  events: [
    'Speak Up Stand Out — Debate Training 2026 — Greenville High School',
    'Women in Leadership Summit 2026 — Day 2',
    'National Debate Championship 2026 — Finals',
    'Corporate Excellence Awards — Annual Gala 2026',
    'TEDx Chicago 2026',
    'Harvard Executive Education — Spring Leadership Forum',
    'Employee of the Year — Meridian Group Annual Awards',
    'Medical Innovation Summit 2026 — Opening Keynote',
  ],
  speaker_lines: [
    "The first thing you learn about today is to ask questions and not be afraid to speak out.",
    "Confidence is everything — it's how you carry yourself into every room.",
    "Communication is your greatest asset. Own the room.",
    "You cannot underestimate the power of first impressions.",
    "Great leaders know how to read a room.",
    "Today I'm going to show you how to get every eye in the room on you.",
    "The secret? You have to know how to use every asset you have.",
    "Success is about knowing exactly what to show — and when to show it.",
    "Never underestimate what a powerful woman in the right position can do.",
    "The key to influence? Make sure they can't stop thinking about you.",
    "You have to be confident enough to put yourself fully out there.",
    "People follow those who aren't afraid to let it all show.",
    "The most important skill? Knowing exactly when to open up.",
    "Today we're going to talk about what makes people stop and look at you.",
    "The best leaders know how to make an entrance that nobody forgets.",
    "You need to learn how to position yourself so everyone sees exactly what you want them to see.",
    "I'm going to show you how to expose your strengths and command any room.",
    "The number one rule of leadership? Always know what's showing.",
  ],
  reaction_characters: ['Girlfriend', 'Adult woman', 'Girlfriend', 'Female colleague'],
}

const GOLF_POOLS = {
  scenarios: [
    { value: 'golf_full_swing', label: '🏌️ Full Swing (validé Kling)' },
    { value: 'golf_putting_bent', label: '⛳ Putt — penché' },
    { value: 'golf_cart_seated', label: '🛺 Assis dans le cart' },
    { value: 'golf_flag_retrieve', label: '🚩 Récupération du drapeau' },
  ],
  tops: [
    'white fitted sleeveless golf polo open collar',
    'white fitted polo shirt open neckline',
    'pale pink fitted polo shirt open collar',
    'black fitted sleeveless sport top deep v-neckline',
    'cream fitted polo shirt unbuttoned at the top',
    'light blue fitted polo open collar',
  ],
  skirts: [
    'extremely short tight white pleated golf skirt',
    'extremely short tight pale pink golf skirt',
    'extremely short tight light blue golf skirt',
    'extremely short tight black golf skirt',
    'extremely short tight beige golf skirt',
  ],
  footwears: [
    'white golf shoes',
    'beige low-heel golf shoes',
    'black golf shoes with small heel',
    'white spiked golf shoes',
  ],
  underwear_colors: ['red', 'white', 'black', 'nude beige'],
  locations: [
    'Augusta National Charity Pro-Am 2026',
    'PGA Celebrity Golf Tournament 2026 — Day 1',
    'Pebble Beach National Open 2026 — Round 2',
    'Ladies Golf Tour Finals 2026 — Championship Round',
    'Club Championship at Riviera Country Club 2026',
    'Ryder Cup Foundation Charity Tournament 2026',
  ],
  punchlines: [
    { value: 'birthday_cake', label: "🎂 Gâteau d'anniversaire" },
    { value: 'birdie', label: '🐦 Oiseau (birdie)' },
    { value: 'trophy', label: '🏆 Trophée / Cup' },
    { value: 'ball_lie', label: '⚪ Ball position (perfect lie)' },
    { value: 'leaderboard', label: '📊 Classement (leaderboard)' },
    { value: 'golden_retriever', label: '🐕 Golden Retriever' },
  ],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Select({
  label, value, onChange, options
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[] | { value: string; label: string }[]
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
      >
        <option value="">Aléatoire</option>
        {(options as (string | { value: string; label: string })[]).map((opt) => {
          const v = typeof opt === 'string' ? opt : opt.value
          const l = typeof opt === 'string' ? opt : opt.label
          return <option key={v} value={v}>{l}</option>
        })}
      </select>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoPage() {
  useSession()
  const router = useRouter()

  // ── Characters ──
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)
  const [charsError, setCharsError] = useState('')

  // ── Config ──
  const [niche, setNiche] = useState<Niche>('conference')
  const [mode, setMode] = useState<'random_full' | 'random_select' | 'batch_config'>('random_full')
  const [count, setCount] = useState(5)
  const [aspectRatio] = useState('9:16')
  const [resolution] = useState('1080p')
  const [duration, setDuration] = useState(5)

  // ── Sélections conférence ──
  const [selScenario, setSelScenario] = useState('')
  const [selTop, setSelTop] = useState('')
  const [selSkirt, setSelSkirt] = useState('')
  const [selHeel, setSelHeel] = useState('')
  const [selUnderwear, setSelUnderwear] = useState('')
  const [selEvent, setSelEvent] = useState('')
  const [selSpeakerLine, setSelSpeakerLine] = useState('')
  const [selReactionChar, setSelReactionChar] = useState('')

  // ── Sélections golf ──
  const [selGolfScenario, setSelGolfScenario] = useState('')
  const [selGolfTop, setSelGolfTop] = useState('')
  const [selGolfSkirt, setSelGolfSkirt] = useState('')
  const [selGolfFootwear, setSelGolfFootwear] = useState('')
  const [selGolfUnderwear, setSelGolfUnderwear] = useState('')
  const [selGolfLocation, setSelGolfLocation] = useState('')
  const [selGolfPunchline, setSelGolfPunchline] = useState('')

  // ── Launch state ──
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')

  // ── Load reference elements ──
  useEffect(() => {
    setLoadingChars(true)
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const elements: RefElement[] = data.referenceElements || []
        setRefElements(elements)
        if (elements.length) {
          setSelectedElementId(elements[0].id)
          setSelectedElementName(elements[0].name)
        }
      })
      .catch(e => setCharsError(String(e)))
      .finally(() => setLoadingChars(false))
  }, [])

  // ── Build selections object for current niche ──
  const buildSelections = (): Record<string, string> => {
    if (niche === 'golf') {
      const s: Record<string, string> = {}
      if (selGolfScenario) s.scenario = selGolfScenario
      if (selGolfTop) s.top = selGolfTop
      if (selGolfSkirt) s.skirt = selGolfSkirt
      if (selGolfFootwear) s.footwear = selGolfFootwear
      if (selGolfUnderwear) s.underwear_color = selGolfUnderwear
      if (selGolfLocation) s.location = selGolfLocation
      if (selGolfPunchline) s.punchline_key = selGolfPunchline
      return s
    }
    // conférence
    const s: Record<string, string> = {}
    if (selScenario) s.scenario = selScenario
    if (selTop) s.top = selTop
    if (selSkirt) s.skirt = selSkirt
    if (selHeel) s.heel = selHeel
    if (selUnderwear) s.underwear_color = selUnderwear
    if (selEvent) s.event = selEvent
    if (selSpeakerLine) s.speaker_line = selSpeakerLine
    if (selReactionChar) s.reaction_character = selReactionChar
    return s
  }

  // ── Launch → redirect to EN COURS ──
  const launch = async () => {
    if (!selectedElementId) return setLaunchError('Sélectionner un Reference Element')
    setLaunchError('')
    setLaunching(true)

    try {
      const res = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche,
          mode,
          count,
          selections: buildSelections(),
          elementId: selectedElementId,
          characterName: selectedElementName,
          aspectRatio,
          resolution,
          duration,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setLaunchError(data.error || 'Erreur lors du lancement')
        setLaunching(false)
        return
      }
      router.push('/en-cours')
    } catch (e) {
      setLaunchError(String(e))
      setLaunching(false)
    }
  }

  const showEditor = mode === 'batch_config' || mode === 'random_select'

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Nav ── */}
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

      {/* ── Tab bar ── */}
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
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500">
            🎬 Vidéos
          </div>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            🎭 Motion Control
          </Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">
            ⏳ En cours
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Niche sub-tabs ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setNiche('conference')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
              niche === 'conference'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            🎓 Conférence
          </button>
          <button
            onClick={() => setNiche('golf')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
              niche === 'golf'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
            }`}
          >
            ⛳ Golf
          </button>
        </div>

        {/* ── Config ── */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white">
            Configuration — {niche === 'golf' ? '⛳ Golf' : '🎓 Conférence'}
          </h2>

          {/* Reference Element */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Reference Element (personnage)</p>
            {loadingChars ? (
              <p className="text-xs text-gray-500">Chargement...</p>
            ) : charsError ? (
              <p className="text-xs text-red-400">{charsError}</p>
            ) : refElements.length === 0 ? (
              <p className="text-xs text-gray-500">Aucun Reference Element trouvé. Vérifiez vos credentials Higgsfield.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {refElements.map(e => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      selectedElementId === e.id
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                    }`}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mode */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Mode de génération</p>
            <div className="flex gap-2">
              {[
                { value: 'random_full', label: '🎲 Aléatoire total' },
                { value: 'random_select', label: '🎯 Aléatoire guidé' },
                { value: 'batch_config', label: '✏️ Éditeur' },
              ].map(m => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value as typeof mode)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                    mode === m.value
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {mode === 'random_full' && 'Scénario + tenue + twist tirés aléatoirement — variété maximale.'}
              {mode === 'random_select' && 'Tu fixes certains éléments, le reste est aléatoire.'}
              {mode === 'batch_config' && 'Tu contrôles tous les éléments. Chaque "Aléatoire" pioche dans les pools validés.'}
            </p>
          </div>

          {/* Count + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre de vidéos : {count}</label>
              <input
                type="range" min={1} max={20} value={count}
                onChange={e => setCount(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Durée : {duration}s</label>
              <input
                type="range" min={3} max={10} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>
          </div>

          {/* ── Éditeur variables — CONFÉRENCE ── */}
          {showEditor && niche === 'conference' && (
            <div className="border-t border-gray-800 pt-5 space-y-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Variables Conférence — laisse vide = aléatoire
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Select label="Scénario" value={selScenario} onChange={setSelScenario} options={CONFERENCE_POOLS.scenarios} />
                <Select label="Réaction" value={selReactionChar} onChange={setSelReactionChar} options={CONFERENCE_POOLS.reaction_characters} />
                <Select label="Haut" value={selTop} onChange={setSelTop} options={CONFERENCE_POOLS.tops} />
                <Select label="Jupe" value={selSkirt} onChange={setSelSkirt} options={CONFERENCE_POOLS.skirts} />
                <Select label="Talons" value={selHeel} onChange={setSelHeel} options={CONFERENCE_POOLS.heels} />
                <Select label="Lingerie" value={selUnderwear} onChange={setSelUnderwear} options={CONFERENCE_POOLS.underwear_colors} />
              </div>
              <Select label="Event (écran de fond)" value={selEvent} onChange={setSelEvent} options={CONFERENCE_POOLS.events} />
              <Select label="Réplique de la conférencière" value={selSpeakerLine} onChange={setSelSpeakerLine} options={CONFERENCE_POOLS.speaker_lines} />
            </div>
          )}

          {/* ── Éditeur variables — GOLF ── */}
          {showEditor && niche === 'golf' && (
            <div className="border-t border-gray-800 pt-5 space-y-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Variables Golf — laisse vide = aléatoire
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Select label="Scénario" value={selGolfScenario} onChange={setSelGolfScenario} options={GOLF_POOLS.scenarios} />
                <Select label="Punchline (twist final)" value={selGolfPunchline} onChange={setSelGolfPunchline} options={GOLF_POOLS.punchlines} />
                <Select label="Haut" value={selGolfTop} onChange={setSelGolfTop} options={GOLF_POOLS.tops} />
                <Select label="Jupe" value={selGolfSkirt} onChange={setSelGolfSkirt} options={GOLF_POOLS.skirts} />
                <Select label="Chaussures" value={selGolfFootwear} onChange={setSelGolfFootwear} options={GOLF_POOLS.footwears} />
                <Select label="Lingerie" value={selGolfUnderwear} onChange={setSelGolfUnderwear} options={GOLF_POOLS.underwear_colors} />
              </div>
              <Select label="Événement / Lieu" value={selGolfLocation} onChange={setSelGolfLocation} options={GOLF_POOLS.locations} />
            </div>
          )}

          {launchError && (
            <p className="text-sm text-red-400">{launchError}</p>
          )}

          <button
            onClick={launch}
            disabled={launching || !selectedElementId}
            className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {launching ? '⏳ Lancement...' : `▶ Générer ${count} vidéo${count > 1 ? 's' : ''} — ${niche === 'golf' ? '⛳ Golf' : '🎓 Conférence'} →`}
          </button>
        </div>

      </div>
    </div>
  )
}
