'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string }

type ValidatedPrompt = {
  id: number
  subNiche: 'conference' | 'sport'
  title: string
  isBest: boolean
  outfitText: string | null
  speakerLine: string | null
}

// ─── Variation pools (doit rester en sync avec video_prompts.py) ──────────────

const CONF_OUTFITS = [
  { label: 'White deep-V bodysuit + black mini + black heels', value: 'white deep-V bodysuit open neckline, extremely short tight black mini skirt, black stiletto heels' },
  { label: 'Cream silk blouse + charcoal mini + nude heels', value: 'cream silk blouse deep plunging neckline, extremely short tight charcoal mini skirt, nude stiletto heels' },
  { label: 'Black long-sleeve deep-V + navy mini + beige heels', value: 'black fitted long-sleeve top deep v-neckline, extremely short tight dark navy mini skirt, beige stiletto heels' },
  { label: 'Cobalt blazer + black mini + black stilettos', value: 'cobalt blue fitted blazer open neckline, extremely short tight black mini skirt, black pointed stilettos' },
  { label: 'Blush satin + brown leather mini + white heels', value: 'blush satin button-down open neckline, extremely short tight dark brown leather-look mini skirt, white stiletto heels' },
  { label: 'White crop blazer + charcoal mini + nude heels', value: 'white fitted crop blazer deep neckline, extremely short tight dark charcoal mini skirt, nude stiletto heels' },
  { label: 'Black SKIMS sheer deep-V + navy mini + black heels', value: 'black SKIMS sheer fitted long-sleeve deep-V, extremely short tight dark navy mini skirt, black stiletto heels' },
]

const SPORT_OUTFITS = [
  { label: 'Black deep-V crop + black shorts', value: 'tight black deep V-neck crop top deep cleavage, extremely short tight black athletic shorts very form-fitting back and sides' },
  { label: 'Navy athletic top + grey shorts', value: 'tight navy fitted athletic top deep v-neckline, extremely short tight grey athletic shorts form-fitting back and sides' },
  { label: 'Pink tank deep-V + black shorts', value: 'tight pink fitted athletic tank top deep open neckline, extremely short tight black athletic shorts extremely form-fitting back and sides' },
  { label: 'White cutout crop + burgundy shorts', value: 'tight white cutout crop top deep cleavage, extremely short tight burgundy athletic shorts very form-fitting' },
  { label: 'Olive deep-V + black shorts', value: 'tight olive green deep V-neck athletic top, extremely short tight black athletic shorts form-fitting back and sides' },
]

const CONF_PHRASES = [
  "Today I'm going to show you how to get every eye in the room completely on you.",
  "There is one thing that separates great leaders from everyone else — knowing exactly what to put out there.",
  "The most powerful women I know have never been afraid to let it all show.",
  "If you want them to listen, you first have to make them look.",
  "Success is about knowing exactly what to reveal — and exactly when to reveal it.",
  "The number one lesson in leadership? Never underestimate what a confident woman can do in the right position.",
  "I want every single person in this room to leave here knowing how to make a room stop.",
  "The secret to owning a room? Make sure they cannot take their eyes off you.",
  "Your greatest asset isn't what you know — it's knowing exactly what to show.",
]

const SPORT_PHRASES = [
  "Give me everything you've got — I want you fully extended by the end of this.",
  "Push through it. Don't stop until I say so.",
  "I need you focused on the movement — not on what's around you.",
  "If you want real results, you're going to have to let yourself go completely.",
  "Don't hold back. I want to see exactly what your body can do.",
  "The best athletes I've trained? They always go harder when I'm watching.",
  "Come on — I need your full commitment right now, nothing held back.",
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SubNicheLabel({ subNiche }: { subNiche: 'conference' | 'sport' }) {
  return subNiche === 'sport'
    ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400 font-medium">🏃 Sport</span>
    : <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-400 font-medium">🎓 Conf.</span>
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

  // ── Validated prompts ──
  const [prompts, setPrompts] = useState<ValidatedPrompt[]>([])
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  // ── UI mode ──
  const [uiMode, setUiMode] = useState<'direct' | 'variation'>('direct')

  // ── Mode direct : sélection ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchCount, setBatchCount] = useState(1)    // fois par prompt
  const [subNicheFilter, setSubNicheFilter] = useState<'all' | 'conference' | 'sport'>('all')

  // ── Mode variation : sélection base ──
  const [varBaseIds, setVarBaseIds] = useState<Set<number>>(new Set())
  const [varAllPrompts, setVarAllPrompts] = useState(false)
  const [varBatchCount, setVarBatchCount] = useState(1)
  const [varOutfit, setVarOutfit] = useState('')        // '' = aléatoire
  const [varPhrase, setVarPhrase] = useState('')        // '' = aléatoire
  const [varSubNiche, setVarSubNiche] = useState<'conference' | 'sport'>('conference')

  // ── Config commune ──
  const [duration, setDuration] = useState(5)

  // ── Launch state ──
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')

  // ── Load characters ──
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

  // ── Load validated prompts ──
  useEffect(() => {
    setLoadingPrompts(true)
    fetch('/api/video/validated-prompts?niche=conference_sport')
      .then(r => r.json())
      .then(data => setPrompts(data.prompts || []))
      .catch(() => {})
      .finally(() => setLoadingPrompts(false))
  }, [])

  // ── Filtrage ──
  const filteredPrompts = prompts.filter(p =>
    subNicheFilter === 'all' || p.subNiche === subNicheFilter
  )

  // ── Sélection tout / rien ──
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredPrompts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPrompts.map(p => p.id)))
    }
  }, [filteredPrompts, selectedIds.size])

  const toggleSelectVarAll = useCallback(() => {
    if (varBaseIds.size === prompts.length) {
      setVarBaseIds(new Set())
    } else {
      setVarBaseIds(new Set(prompts.map(p => p.id)))
    }
  }, [prompts, varBaseIds.size])

  // ── Outfits disponibles selon sous-niche sélectionnée ──
  const outfitPool = varSubNiche === 'sport' ? SPORT_OUTFITS : CONF_OUTFITS
  const phrasePool = varSubNiche === 'sport' ? SPORT_PHRASES : CONF_PHRASES

  // ── Total vidéos à générer ──
  const totalDirect = selectedIds.size * batchCount
  const totalVar = (varAllPrompts ? prompts.length : varBaseIds.size) * varBatchCount

  // ── Launch ──
  const launch = async () => {
    if (!selectedElementId) return setLaunchError('Sélectionner un personnage')
    setLaunchError('')
    setLaunching(true)

    try {
      let body: object

      if (uiMode === 'direct') {
        if (!selectedIds.size) {
          setLaunchError('Sélectionner au moins un prompt')
          setLaunching(false)
          return
        }
        body = {
          mode: 'direct',
          validatedPromptIds: Array.from(selectedIds),
          batchCount,
          elementId: selectedElementId,
          characterName: selectedElementName,
          duration,
        }
      } else {
        // variation
        const ids = varAllPrompts
          ? prompts.map(p => p.id)
          : Array.from(varBaseIds)
        if (!ids.length) {
          setLaunchError('Sélectionner au moins un prompt de base')
          setLaunching(false)
          return
        }
        body = {
          mode: 'variation',
          validatedPromptIds: ids,
          batchCount: varBatchCount,
          outfitOverride: varOutfit || null,
          phraseOverride: varPhrase || null,
          elementId: selectedElementId,
          characterName: selectedElementName,
          duration,
        }
      }

      const res = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  // ─── Render ────────────────────────────────────────────────────────────────
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
          <Link href="/" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">🔄 Scraping</Link>
          <Link href="/studio" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">✨ Prompt Studio</Link>
          <Link href="/carousel" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">🃏 Carousels</Link>
          <div className="px-5 py-3 text-sm font-medium text-white border-b-2 border-violet-500">🎬 Vidéos</div>
          <Link href="/motion-control" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">🎭 Motion Control</Link>
          <Link href="/en-cours" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">⏳ En cours</Link>
          <Link href="/metadata" className="px-5 py-3 text-sm font-medium text-gray-400 hover:text-white border-b-2 border-transparent hover:border-gray-600 transition">🧹 Metadata Opti</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* ── Header niche ── */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">🎓🏃</span>
          <div>
            <h1 className="text-lg font-bold text-white">Conférence + Sport</h1>
            <p className="text-xs text-gray-500">Prompts validés — génération directe ou légère variation</p>
          </div>
        </div>

        {/* ── Personnage ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wider">Personnage</p>
          {loadingChars ? (
            <p className="text-xs text-gray-500">Chargement...</p>
          ) : charsError ? (
            <p className="text-xs text-red-400">{charsError}</p>
          ) : refElements.length === 0 ? (
            <p className="text-xs text-gray-500">Aucun Reference Element. Vérifiez vos credentials Higgsfield.</p>
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

        {/* ── Durée commune ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 flex items-center gap-6">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1.5">Durée vidéo : <span className="text-white font-medium">{duration}s</span></label>
            <input
              type="range" min={3} max={10} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>
          <div className="text-xs text-gray-500 text-right leading-relaxed">
            <div>9:16 · 1080p</div>
            <div>Seedance 2.0</div>
          </div>
        </div>

        {/* ── Mode tabs ── */}
        <div className="flex gap-2">
          <button
            onClick={() => setUiMode('direct')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
              uiMode === 'direct'
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🎯 Directs — prompt exact
          </button>
          <button
            onClick={() => setUiMode('variation')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
              uiMode === 'variation'
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🔀 Variations — outfit + phrase
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════
            MODE DIRECTS
        ════════════════════════════════════════════════════════════ */}
        {uiMode === 'direct' && (
          <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">

            {/* Header + filtres */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-white">Prompts validés</p>
                <p className="text-xs text-gray-500 mt-0.5">Chaque prompt est généré copie exacte — zéro modification.</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {(['all', 'conference', 'sport'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setSubNicheFilter(f); setSelectedIds(new Set()) }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                      subNicheFilter === f
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'Tous' : f === 'conference' ? '🎓 Conf.' : '🏃 Sport'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sélect tout */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <button
                onClick={toggleSelectAll}
                className="text-xs text-violet-400 hover:text-violet-300 transition"
              >
                {selectedIds.size === filteredPrompts.length && filteredPrompts.length > 0
                  ? '☑ Tout désélectionner'
                  : '☐ Tout sélectionner'}
              </button>
              <span className="text-xs text-gray-500">
                {selectedIds.size} / {filteredPrompts.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </span>
            </div>

            {/* Liste prompts */}
            <div className="divide-y divide-gray-800/60">
              {loadingPrompts ? (
                <div className="p-6 text-center text-xs text-gray-500">Chargement des prompts...</div>
              ) : filteredPrompts.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">Aucun prompt pour cette niche.</div>
              ) : (
                filteredPrompts.map(p => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                      selectedIds.has(p.id) ? 'bg-violet-600/10' : 'hover:bg-gray-800/40'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => {
                        setSelectedIds(prev => {
                          const next = new Set(prev)
                          next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                          return next
                        })
                      }}
                      className="accent-violet-500 w-4 h-4 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-100 truncate">
                          {p.isBest && <span className="text-yellow-400 mr-1">★</span>}
                          {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                        </span>
                        <SubNicheLabel subNiche={p.subNiche} />
                      </div>
                      {p.speakerLine && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate italic">
                          &ldquo;{p.speakerLine}&rdquo;
                        </p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Batch count + CTA */}
            <div className="p-5 border-t border-gray-800 space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">Générer <span className="text-white font-medium">×{batchCount}</span> fois chaque prompt sélectionné</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setBatchCount(n)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                        batchCount === n
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                      }`}
                    >
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>

              {launchError && <p className="text-sm text-red-400">{launchError}</p>}

              <button
                onClick={launch}
                disabled={launching || !selectedElementId || selectedIds.size === 0}
                className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {launching
                  ? '⏳ Lancement...'
                  : `▶ Générer ${totalDirect} vidéo${totalDirect > 1 ? 's' : ''} — ${selectedIds.size} prompt${selectedIds.size > 1 ? 's' : ''} × ${batchCount} →`}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            MODE VARIATIONS
        ════════════════════════════════════════════════════════════ */}
        {uiMode === 'variation' && (
          <div className="space-y-4">

            {/* Info box */}
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-300 font-medium mb-1">Variations ultra-légères uniquement</p>
              <p className="text-xs text-amber-400/80">
                Seuls l&apos;outfit et la réplique sont remplacés — jamais la structure du prompt. 🔴 Culotte rouge : toujours fixe.
              </p>
            </div>

            {/* Sous-niche pour les pools */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-4">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Type de variation</p>
              <div className="flex gap-2">
                {(['conference', 'sport'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => { setVarSubNiche(s); setVarOutfit(''); setVarPhrase('') }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                      varSubNiche === s
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                    }`}
                  >
                    {s === 'conference' ? '🎓 Conférence' : '🏃 Sport/Coach'}
                  </button>
                ))}
              </div>
            </div>

            {/* Outfit */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Outfit</p>
                <span className="text-xs text-gray-600">🔴 Culotte rouge — toujours fixe</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                  varOutfit === '' ? 'border-violet-500 bg-violet-600/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}>
                  <input type="radio" name="outfit" value="" checked={varOutfit === ''} onChange={() => setVarOutfit('')} className="accent-violet-500" />
                  <span className="text-sm">🎲 Aléatoire (pool validé)</span>
                </label>
                {outfitPool.map(o => (
                  <label key={o.value} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                    varOutfit === o.value ? 'border-violet-500 bg-violet-600/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  }`}>
                    <input type="radio" name="outfit" value={o.value} checked={varOutfit === o.value} onChange={() => setVarOutfit(o.value)} className="accent-violet-500" />
                    <span className="text-sm">{o.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Phrase */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-3">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Réplique (si le prompt en a une)</p>
              <div className="grid grid-cols-1 gap-2">
                <label className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                  varPhrase === '' ? 'border-violet-500 bg-violet-600/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                }`}>
                  <input type="radio" name="phrase" value="" checked={varPhrase === ''} onChange={() => setVarPhrase('')} className="accent-violet-500" />
                  <span className="text-sm">🎲 Aléatoire (pool validé)</span>
                </label>
                {phrasePool.map(ph => (
                  <label key={ph} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition ${
                    varPhrase === ph ? 'border-violet-500 bg-violet-600/10 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  }`}>
                    <input type="radio" name="phrase" value={ph} checked={varPhrase === ph} onChange={() => setVarPhrase(ph)} className="accent-violet-500 mt-0.5 shrink-0" />
                    <span className="text-sm italic">&ldquo;{ph}&rdquo;</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sélection prompts de base */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="p-5 border-b border-gray-800">
                <p className="text-sm font-semibold text-white mb-1">Prompts de base</p>
                <p className="text-xs text-gray-500">La variation est appliquée à chaque prompt sélectionné.</p>
              </div>

              {/* Toggle tout */}
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={varAllPrompts}
                    onChange={e => setVarAllPrompts(e.target.checked)}
                    className="accent-violet-500 w-4 h-4"
                  />
                  <span className="text-xs text-violet-400">Tous les prompts validés ({prompts.length})</span>
                </label>
                {!varAllPrompts && (
                  <button onClick={toggleSelectVarAll} className="text-xs text-gray-500 hover:text-gray-300 transition">
                    {varBaseIds.size === prompts.length ? 'Désélectionner tout' : 'Sélectionner tout'}
                  </button>
                )}
              </div>

              {/* Liste */}
              {!varAllPrompts && (
                <div className="divide-y divide-gray-800/60 max-h-64 overflow-y-auto">
                  {loadingPrompts ? (
                    <div className="p-4 text-center text-xs text-gray-500">Chargement...</div>
                  ) : (
                    prompts.map(p => (
                      <label key={p.id} className={`flex items-center gap-3 px-5 py-2.5 cursor-pointer transition ${
                        varBaseIds.has(p.id) ? 'bg-violet-600/10' : 'hover:bg-gray-800/40'
                      }`}>
                        <input
                          type="checkbox"
                          checked={varBaseIds.has(p.id)}
                          onChange={() => setVarBaseIds(prev => {
                            const next = new Set(prev)
                            next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                            return next
                          })}
                          className="accent-violet-500 w-4 h-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-100 truncate">
                              {p.isBest && <span className="text-yellow-400 mr-1">★</span>}
                              {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                            </span>
                            <SubNicheLabel subNiche={p.subNiche} />
                          </div>
                          {p.speakerLine && (
                            <p className="text-xs text-gray-600 truncate italic">&ldquo;{p.speakerLine}&rdquo;</p>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}

              {/* Nb variations par prompt + CTA */}
              <div className="p-5 border-t border-gray-800 space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    <span className="text-white font-medium">×{varBatchCount}</span> variation{varBatchCount > 1 ? 's' : ''} par prompt
                  </p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setVarBatchCount(n)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                          varBatchCount === n
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                        }`}
                      >
                        ×{n}
                      </button>
                    ))}
                  </div>
                </div>

                {launchError && <p className="text-sm text-red-400">{launchError}</p>}

                <button
                  onClick={launch}
                  disabled={launching || !selectedElementId || (!varAllPrompts && varBaseIds.size === 0)}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {launching
                    ? '⏳ Lancement...'
                    : `▶ Générer ${totalVar} variation${totalVar > 1 ? 's' : ''} →`}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
