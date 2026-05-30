'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string }

type ValidatedPrompt = {
  id: number
  subNiche: string   // 'conference' | 'sport' | 'nurse' | 'restaurant'
  title: string
  isBest: boolean
  outfitText: string | null
  speakerLine: string | null
  phraseVariations: string[] | null  // phrases dédiées à ce concept précis
}

// ─── Outfit pools (doit rester en sync avec video_prompts.py) ─────────────────

// ─── Outfit pools par sous-niche ──────────────────────────────────────────────

const GOLF_OUTFITS = [
  { label: 'Pink pleated golf skirt + white polo', value: 'extremely short pink pleated golf skirt, fitted white polo shirt deep open collar, white golf shoes' },
  { label: 'Black golf skirt + navy polo', value: 'extremely short black golf skirt, fitted navy blue polo shirt deep neckline, white spiked golf shoes' },
  { label: 'Light blue golf dress + visor', value: 'light blue pleated short golf dress deep V-neckline, white sun visor, white sneakers' },
  { label: 'White golf skirt + pink polo', value: 'extremely short white pleated golf skirt, fitted pink polo shirt open collar, beige golf shoes' },
  { label: 'Beige golf skirt + black polo', value: 'extremely short beige golf skirt, fitted black polo shirt deep open collar, white golf shoes' },
]

const NURSE_OUTFITS = [
  { label: 'Uniforme blanc deep-V + black heels', value: 'extremely short white nurse uniform deep V-neckline hemline top of thighs, black heels' },
  { label: 'Uniforme rose pastel + nude heels', value: 'extremely short pastel pink nurse uniform deep open neckline hemline top of thighs, nude heels' },
  { label: 'Scrubs navy fitted + black heels', value: 'extremely short fitted navy scrubs deep open neckline hemline top of thighs, black heels' },
  { label: 'Uniforme bleu clair + white heels', value: 'extremely short light blue nurse uniform deep plunging neckline hemline top of thighs, white heels' },
  { label: 'Uniforme menthe pale + black stilettos', value: 'extremely short pale mint nurse uniform deep V-neckline hemline top of thighs, black stiletto heels' },
]

const RESTAURANT_OUTFITS = [
  { label: 'White deep-V bodysuit', value: 'white deep-V bodysuit open neckline generous cleavage' },
  { label: 'Black fitted low-cut top', value: 'black fitted low-cut top with deep generous cleavage' },
  { label: 'Cream open-back top deep cleavage', value: 'cream open-back top with deep plunging neckline and generous cleavage' },
  { label: 'Blush silk blouse deep-V', value: 'blush silk blouse with very low-cut deep cleavage' },
  { label: 'Cobalt blue deep-V fitted top', value: 'cobalt blue deep V-neck fitted top with generous cleavage' },
]

const CONF_OUTFITS = [
  { label: 'White deep-V bodysuit + black mini + black heels', value: 'white deep-V bodysuit open neckline, extremely short tight black mini skirt, black stiletto heels' },
  { label: 'Cream silk blouse + charcoal mini + nude heels', value: 'cream silk blouse deep plunging neckline, extremely short tight charcoal mini skirt, nude stiletto heels' },
  { label: 'Black long-sleeve deep-V + navy mini + beige heels', value: 'black fitted long-sleeve top deep v-neckline, extremely short tight dark navy mini skirt, beige stiletto heels' },
  { label: 'Cobalt blazer + black mini + black stilettos', value: 'cobalt blue fitted blazer open neckline, extremely short tight black mini skirt, black pointed stilettos' },
  { label: 'Blush satin + brown leather mini + white heels', value: 'blush satin button-down open neckline, extremely short tight dark brown leather-look mini skirt, white stiletto heels' },
  { label: 'White crop blazer + charcoal mini + nude heels', value: 'white fitted crop blazer deep neckline, extremely short tight dark charcoal mini skirt, nude stiletto heels' },
  { label: 'Black SKIMS sheer deep-V + navy mini + black heels', value: 'black SKIMS sheer fitted long-sleeve deep-V, extremely short tight dark navy mini skirt, black stiletto heels' },
]

const METEO_OUTFITS = [
  { label: 'Blue lace wrap dress (studio)', value: 'blue navy semi-transparent lace overlay bodice, blue navy wrap mini skirt with lace ribbon tie' },
  { label: 'Red fitted blazer mini dress', value: 'fitted red blazer mini dress, very short hemline, deep open neckline' },
  { label: 'White fitted pencil dress', value: 'white fitted pencil mini dress, very short hemline, deep V neckline' },
  { label: 'Camel blazer + nude mini', value: 'camel fitted blazer, extremely short nude beige mini skirt, open neckline' },
  { label: 'Storm halter-neck dress', value: 'extremely short brown halter-neck mini dress rhinestone floral pattern, black bra visible deep V neckline' },
]

const SPORT_OUTFITS = [
  { label: 'Black deep-V crop + black shorts', value: 'tight black deep V-neck crop top deep cleavage, extremely short tight black athletic shorts very form-fitting back and sides' },
  { label: 'Navy athletic top + grey shorts', value: 'tight navy fitted athletic top deep v-neckline, extremely short tight grey athletic shorts form-fitting back and sides' },
  { label: 'Pink tank deep-V + black shorts', value: 'tight pink fitted athletic tank top deep open neckline, extremely short tight black athletic shorts extremely form-fitting back and sides' },
  { label: 'White cutout crop + burgundy shorts', value: 'tight white cutout crop top deep cleavage, extremely short tight burgundy athletic shorts very form-fitting' },
  { label: 'Olive deep-V + black shorts', value: 'tight olive green deep V-neck athletic top, extremely short tight black athletic shorts form-fitting back and sides' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SubNicheLabel({ subNiche }: { subNiche: string }) {
  if (subNiche === 'sport') return <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-400 font-medium">🏃 Coach</span>
  if (subNiche === 'golf') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/50 text-green-400 font-medium">⛳ Golf</span>
  if (subNiche === 'nurse') return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-900/50 text-blue-400 font-medium">🏥 Infirmière</span>
  if (subNiche === 'restaurant') return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-400 font-medium">🍽️ Restaurant</span>
  if (subNiche === 'meteo') return <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400 font-medium">📺 Météo</span>
  if (subNiche === 'reporter') return <span className="text-xs px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-400 font-medium">🌪️ Reporter</span>
  return <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-400 font-medium">🎓 Conf.</span>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function VideoPage() {
  useSession()


  // ── Characters ──
  const [refElements, setRefElements] = useState<RefElement[]>([])
  const [selectedElementId, setSelectedElementId] = useState('')
  const [selectedElementName, setSelectedElementName] = useState('')
  const [loadingChars, setLoadingChars] = useState(false)
  const [charsError, setCharsError] = useState('')

  // ── Validated prompts ──
  const [prompts, setPrompts] = useState<ValidatedPrompt[]>([])
  const [loadingPrompts, setLoadingPrompts] = useState(false)

  // ── Niche — 4 onglets séparés ──
  const [niche, setNiche] = useState<'conference' | 'sport' | 'golf' | 'vieux' | 'meteo'>('conference')

  // ── UI mode ──
  const [uiMode, setUiMode] = useState<'direct' | 'variation'>('direct')

  // ── Mode direct ──
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchCount, setBatchCount] = useState(1)
  // subNicheFilter supprimé — l'onglet niche fait déjà le filtrage

  // ── Mode variation : UN seul prompt de base (radio), outfit + phrase ──
  const [varBaseId, setVarBaseId] = useState<number | null>(null)
  const [varBatchCount, setVarBatchCount] = useState(1)
  const [varOutfit, setVarOutfit] = useState('')   // '' = aléatoire
  const [varPhrase, setVarPhrase] = useState('')   // '' = aléatoire

  // ── Config commune ──
  const [duration, setDuration] = useState(5)

  // ── Launch state ──
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState('')
  const [launchSuccess, setLaunchSuccess] = useState('')

  // ── Load characters ──
  const loadChars = () => {
    setLoadingChars(true)
    setCharsError('')
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
  }

  useEffect(() => { loadChars() }, [])

  // ── Scan Reference Elements depuis Higgsfield ──
  const [scanning, setScanning] = useState(false)
  const scanFromHiggsfield = async () => {
    setScanning(true)
    setCharsError('')
    try {
      const res = await fetch('/api/characters/scan-elements')
      const data = await res.json()
      if (!res.ok) { setCharsError(data.error || 'Scan échoué'); return }
      // Recharger la liste après scan
      loadChars()
    } catch (e) {
      setCharsError(String(e))
    } finally {
      setScanning(false)
    }
  }

  // ── Load validated prompts (reload au changement d'onglet) ──
  useEffect(() => {
    setLoadingPrompts(true)
    setPrompts([])
    setSelectedIds(new Set())
    setVarBaseId(null)
    setVarOutfit('')
    setVarPhrase('')
    // conference et sport sont dans le même niche DB 'conference_sport', filtrés côté client
    const dbNiche = niche === 'vieux' ? 'vieux' : niche === 'golf' ? 'golf' : niche === 'meteo' ? 'meteo' : 'conference_sport'
    fetch(`/api/video/validated-prompts?niche=${dbNiche}`)
      .then(r => r.json())
      .then(data => {
        const all: ValidatedPrompt[] = data.prompts || []
        // Filtre côté client par subNiche pour conference/sport ; golf et vieux sont déjà leur propre niche
        const filtered = (niche === 'vieux' || niche === 'golf' || niche === 'meteo')
          ? all
          : all.filter(p => p.subNiche === niche)
        setPrompts(filtered)
      })
      .catch(() => {})
      .finally(() => setLoadingPrompts(false))
  }, [niche])

  // Mode direct : tous les prompts de l'onglet (plus de sub-filtre, l'onglet fait déjà le travail)
  const filteredPrompts = prompts

  // ── Select all direct ──
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredPrompts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPrompts.map(p => p.id)))
    }
  }, [filteredPrompts, selectedIds.size])

  // ── Prompt sélectionné pour variation ──
  const selectedVarPrompt = prompts.find(p => p.id === varBaseId) ?? null

  // ── Outfit pool selon sous-niche du prompt choisi ──
  const outfitPool = (() => {
    const sub = selectedVarPrompt?.subNiche
    if (sub === 'sport') return SPORT_OUTFITS
    if (sub === 'golf') return GOLF_OUTFITS
    if (sub === 'nurse') return NURSE_OUTFITS
    if (sub === 'restaurant') return RESTAURANT_OUTFITS
    if (sub === 'meteo' || sub === 'reporter') return METEO_OUTFITS
    return CONF_OUTFITS
  })()

  // ── Phrases dédiées au prompt sélectionné (depuis DB) ──
  const currentPhrasePool = selectedVarPrompt?.phraseVariations ?? null

  // Reset outfit/phrase si on change de prompt
  const selectVarBase = (id: number) => {
    if (id !== varBaseId) {
      setVarBaseId(id)
      setVarOutfit('')
      setVarPhrase('')
    }
  }

  const totalDirect = selectedIds.size * batchCount
  const totalVar = varBaseId ? varBatchCount : 0

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
        if (!varBaseId) {
          setLaunchError('Sélectionner un prompt de base')
          setLaunching(false)
          return
        }
        body = {
          mode: 'variation',
          validatedPromptIds: [varBaseId],
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
      // Succès — rester sur la page pour pouvoir relancer immédiatement
      setLaunching(false)
      setLaunchSuccess('Run lancé ✓')
      setTimeout(() => setLaunchSuccess(''), 3000)
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

        {/* ── Sélecteur de niche — 3 onglets séparés ── */}
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'conference' as const, emoji: '🎓', label: 'Conférence' },
            { id: 'sport' as const,      emoji: '🏃', label: 'Coach' },
            { id: 'golf' as const,       emoji: '⛳', label: 'Golf' },
            { id: 'vieux' as const,      emoji: '👴', label: 'Vieux' },
            { id: 'meteo' as const,      emoji: '📺', label: 'Météo' },
          ]).map(n => (
            <button
              key={n.id}
              onClick={() => setNiche(n.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                niche === n.id
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
            >
              <span>{n.emoji}</span><span>{n.label}</span>
            </button>
          ))}
        </div>

        {/* ── Personnage ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Personnage</p>
            <button
              onClick={scanFromHiggsfield}
              disabled={scanning || loadingChars}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-300 hover:border-violet-500 hover:text-violet-300 disabled:opacity-50 transition"
            >
              {scanning ? '⏳ Scan...' : '🔍 Scanner Higgsfield'}
            </button>
          </div>
          {loadingChars || scanning ? (
            <p className="text-xs text-gray-500">{scanning ? 'Scan en cours...' : 'Chargement...'}</p>
          ) : charsError ? (
            <p className="text-xs text-red-400">{charsError}</p>
          ) : refElements.length === 0 ? (
            <p className="text-xs text-gray-500">Aucun Reference Element trouvé. Clique sur "Scanner Higgsfield" pour charger tes personnages.</p>
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

        {/* ── Durée ── */}
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 flex items-center gap-6">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1.5">
              Durée vidéo : <span className="text-white font-medium">{duration}s</span>
            </label>
            <input type="range" min={3} max={10} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
          <div className="text-xs text-gray-500 text-right leading-relaxed">
            <div>9:16 · 720p</div>
            <div>Seedance 2.0</div>
          </div>
        </div>

        {/* ── Mode tabs ── */}
        <div className="flex gap-2">
          <button onClick={() => setUiMode('direct')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
              uiMode === 'direct'
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}>
            🎯 Directs — prompt exact
          </button>
          <button onClick={() => setUiMode('variation')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
              uiMode === 'variation'
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}>
            🔀 Variations — outfit + réplique
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
              <span className="text-xs text-gray-500">
                {niche === 'conference' ? '🎓 Conférence' : niche === 'sport' ? '🏃 Coach' : niche === 'golf' ? '⛳ Golf' : niche === 'meteo' ? '📺 Météo' : '👴 Vieux'}
              </span>
            </div>

            {/* Sélect tout */}
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <button onClick={toggleSelectAll} className="text-xs text-violet-400 hover:text-violet-300 transition">
                {selectedIds.size === filteredPrompts.length && filteredPrompts.length > 0
                  ? '☑ Tout désélectionner' : '☐ Tout sélectionner'}
              </button>
              <span className="text-xs text-gray-500">
                {selectedIds.size} / {filteredPrompts.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </span>
            </div>

            {/* Liste */}
            <div className="divide-y divide-gray-800/60">
              {loadingPrompts ? (
                <div className="p-6 text-center text-xs text-gray-500">Chargement des prompts...</div>
              ) : filteredPrompts.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-500">Aucun prompt pour cette niche.</div>
              ) : (
                filteredPrompts.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    selectedIds.has(p.id) ? 'bg-violet-600/10' : 'hover:bg-gray-800/40'
                  }`}>
                    <input type="checkbox" checked={selectedIds.has(p.id)}
                      onChange={() => setSelectedIds(prev => {
                        const next = new Set(prev)
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                        return next
                      })}
                      className="accent-violet-500 w-4 h-4 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-100 truncate">
                          {p.isBest && <span className="text-yellow-400 mr-1">★</span>}
                          {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                        </span>
                        <SubNicheLabel subNiche={p.subNiche} />
                      </div>
                      {p.speakerLine && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate italic">&ldquo;{p.speakerLine}&rdquo;</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Batch count + CTA */}
            <div className="p-5 border-t border-gray-800 space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  Générer <span className="text-white font-medium">×{batchCount}</span> fois chaque prompt sélectionné
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => setBatchCount(n)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition ${
                        batchCount === n
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                      }`}>×{n}</button>
                  ))}
                </div>
              </div>
              {launchError && <p className="text-sm text-red-400">{launchError}</p>}
              {launchSuccess && (
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  {launchSuccess}
                  <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ En cours</a>
                </p>
              )}
              <button onClick={launch}
                disabled={launching || !selectedElementId || selectedIds.size === 0}
                className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {launching
                  ? '⏳ Lancement...'
                  : `▶ Générer ${totalDirect} vidéo${totalDirect > 1 ? 's' : ''} — ${selectedIds.size} prompt${selectedIds.size > 1 ? 's' : ''} × ${batchCount} →`}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            MODE VARIATIONS
            Flow : 1) Sélectionner LE prompt de base (radio)
                   2) Les répliques dédiées à CE concept apparaissent
                   3) Choisir outfit + réplique (ou aléatoire)
                   4) Batch count → Lancer
        ════════════════════════════════════════════════════════════ */}
        {uiMode === 'variation' && (
          <div className="space-y-4">

            {/* Info */}
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-300 font-medium mb-0.5">Variations ultra-légères — structure du prompt intacte</p>
              <p className="text-xs text-amber-400/70">
                Seuls l&apos;outfit et la réplique changent. Répliques calibrées sur LE contexte exact du concept. 🔴 Culotte rouge : toujours fixe.
              </p>
            </div>

            {/* ── ÉTAPE 1 : Sélectionner le concept de base ── */}
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-800">
                <p className="text-sm font-semibold text-white">① Choisir le concept de base</p>
                <p className="text-xs text-gray-500 mt-0.5">Les répliques et l&apos;outfit pool s&apos;adaptent automatiquement au concept sélectionné.</p>
              </div>
              <div className="divide-y divide-gray-800/60 max-h-72 overflow-y-auto">
                {loadingPrompts ? (
                  <div className="p-4 text-center text-xs text-gray-500">Chargement...</div>
                ) : (
                  prompts.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                      varBaseId === p.id ? 'bg-violet-600/15' : 'hover:bg-gray-800/40'
                    }`}>
                      <input type="radio" name="varBase" value={p.id}
                        checked={varBaseId === p.id}
                        onChange={() => selectVarBase(p.id)}
                        className="accent-violet-500 w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-gray-100">
                            {p.isBest && <span className="text-yellow-400 mr-1">★</span>}
                            {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                          </span>
                          <SubNicheLabel subNiche={p.subNiche} />
                          {!p.phraseVariations && (
                            <span className="text-xs text-gray-600 italic">outfit uniquement</span>
                          )}
                        </div>
                        {p.speakerLine && varBaseId !== p.id && (
                          <p className="text-xs text-gray-600 truncate italic mt-0.5">&ldquo;{p.speakerLine}&rdquo;</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* ── ÉTAPE 2 : Répliques dédiées (seulement si prompt sélectionné avec phrases) ── */}
            {varBaseId && currentPhrasePool && (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800">
                  <p className="text-sm font-semibold text-white">② Réplique</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {currentPhrasePool.length} répliques calibrées sur ce concept précis.
                    En mode aléatoire, elles tournent sans répétition.
                  </p>
                </div>
                <div className="divide-y divide-gray-800/40 max-h-80 overflow-y-auto">
                  {/* Aléatoire */}
                  <label className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    varPhrase === '' ? 'bg-violet-600/15' : 'hover:bg-gray-800/40'
                  }`}>
                    <input type="radio" name="phrase" value=""
                      checked={varPhrase === ''}
                      onChange={() => setVarPhrase('')}
                      className="accent-violet-500 w-4 h-4 shrink-0" />
                    <span className="text-sm text-gray-200">🎲 Aléatoire — cycle sans répétition</span>
                  </label>
                  {/* Phrases dédiées */}
                  {currentPhrasePool.map((ph, i) => (
                    <label key={i} className={`flex items-start gap-3 px-5 py-3 cursor-pointer transition ${
                      varPhrase === ph ? 'bg-violet-600/15' : 'hover:bg-gray-800/40'
                    }`}>
                      <input type="radio" name="phrase" value={ph}
                        checked={varPhrase === ph}
                        onChange={() => setVarPhrase(ph)}
                        className="accent-violet-500 w-4 h-4 shrink-0 mt-0.5" />
                      <span className="text-sm italic text-gray-300">&ldquo;{ph}&rdquo;</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ── ÉTAPE 3 : Outfit ── */}
            {varBaseId && (
              <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {currentPhrasePool ? '③' : '②'} Outfit
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Pool adapté à la niche du concept.</p>
                  </div>
                  <span className="text-xs text-gray-600">🔴 Culotte rouge — fixe</span>
                </div>
                <div className="divide-y divide-gray-800/40">
                  <label className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    varOutfit === '' ? 'bg-violet-600/15' : 'hover:bg-gray-800/40'
                  }`}>
                    <input type="radio" name="outfit" value=""
                      checked={varOutfit === ''}
                      onChange={() => setVarOutfit('')}
                      className="accent-violet-500 w-4 h-4 shrink-0" />
                    <span className="text-sm text-gray-200">🎲 Aléatoire — cycle sans répétition</span>
                  </label>
                  {outfitPool.map(o => (
                    <label key={o.value} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                      varOutfit === o.value ? 'bg-violet-600/15' : 'hover:bg-gray-800/40'
                    }`}>
                      <input type="radio" name="outfit" value={o.value}
                        checked={varOutfit === o.value}
                        onChange={() => setVarOutfit(o.value)}
                        className="accent-violet-500 w-4 h-4 shrink-0" />
                      <span className="text-sm text-gray-300">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ── Batch count + CTA ── */}
            <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800 space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  Générer <span className="text-white font-medium">×{varBatchCount}</span> variation{varBatchCount > 1 ? 's' : ''} de ce concept
                  {varBatchCount > 1 && currentPhrasePool && (
                    <span className="text-gray-600"> — répliques et outfits différents à chaque fois</span>
                  )}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 10].map(n => (
                    <button key={n} onClick={() => setVarBatchCount(n)}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                        varBatchCount === n
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-violet-600'
                      }`}>×{n}</button>
                  ))}
                </div>
              </div>

              {!varBaseId && (
                <p className="text-xs text-gray-600 italic">← Sélectionner un concept de base pour continuer</p>
              )}
              {launchError && <p className="text-sm text-red-400">{launchError}</p>}
              {launchSuccess && (
                <p className="text-sm text-emerald-400 flex items-center gap-2">
                  {launchSuccess}
                  <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ En cours</a>
                </p>
              )}

              <button onClick={launch}
                disabled={launching || !selectedElementId || !varBaseId}
                className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {launching
                  ? '⏳ Lancement...'
                  : varBaseId
                    ? `▶ Générer ${totalVar} variation${totalVar > 1 ? 's' : ''} →`
                    : '▶ Lancer →'}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
