'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

// ─── Types ────────────────────────────────────────────────────────────────────

type RefElement = { id: string; name: string; type?: string }

type ValidatedPrompt = {
  id: number
  subNiche: string   // 'conference' | 'sport' | 'nurse' | 'restaurant'
  title: string
  isBest: boolean
  outfitText: string | null
  speakerLine: string | null
  phraseVariations: string[] | null  // phrases dédiées à ce concept précis
  authorName: string | null          // auteur (prompts communautaires)
  userDescription: string | null     // description courte du concept
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
  { label: 'White deep-V uniform + black heels', value: 'extremely short white nurse uniform deep V-neckline hemline top of thighs, black heels' },
  { label: 'Pastel pink uniform + nude heels', value: 'extremely short pastel pink nurse uniform deep open neckline hemline top of thighs, nude heels' },
  { label: 'Scrubs navy fitted + black heels', value: 'extremely short fitted navy scrubs deep open neckline hemline top of thighs, black heels' },
  { label: 'Light blue uniform + white heels', value: 'extremely short light blue nurse uniform deep plunging neckline hemline top of thighs, white heels' },
  { label: 'Pale mint uniform + black stilettos', value: 'extremely short pale mint nurse uniform deep V-neckline hemline top of thighs, black stiletto heels' },
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

const SERVEUSE_OUTFITS = [
  { label: 'Black jumpsuit deep-V zipper (original)', value: 'tight black fitted server uniform jumpsuit deep V-neck zipper deep cleavage, short puffed sleeves, fitted pants, small chest badge, long dark wavy hair, nude pointed heels' },
  { label: 'White fitted server blouse + black mini', value: 'tight white fitted server blouse deep V-neckline generous cleavage, very short black skirt, small chest badge, black pointed heels' },
  { label: 'Black deep-V fitted dress server', value: 'tight fitted black server dress deep V-neckline generous cleavage, hemline mid-thigh, small chest badge, black pointed heels' },
  { label: 'Burgundy fitted uniform deep-V', value: 'tight burgundy fitted server uniform deep V-neckline generous cleavage, small chest badge, black stiletto heels, long dark wavy hair' },
  { label: 'Black satin top + fitted skirt', value: 'tight black satin server top deep V-neckline generous cleavage, fitted black mini skirt, small server badge, nude pointed heels' },
]

const MCDO_OUTFITS = [
  { label: 'Grey polo + blonde ponytail (original)', value: 'fitted dark grey polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, blonde hair in high ponytail with loose strands framing face, small gold hoop earrings' },
  { label: 'Black polo + brunette', value: 'fitted black polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, dark brown hair in high ponytail with loose strands framing face, small silver hoop earrings' },
  { label: 'Red polo + McDo cap', value: 'fitted red polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, red baseball cap with golden M logo, dark hair in low ponytail, small gold stud earrings' },
  { label: 'Grey polo + long red hair', value: 'fitted dark grey polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, long wavy red hair loose past shoulders, small gold hoop earrings' },
  { label: 'Navy polo + bun + lanyard', value: "fitted navy blue polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, blonde hair in messy bun with loose strands framing face, small gold hoop earrings, McDonald's branded lanyard around neck" },
  { label: 'Black polo + backwards cap', value: 'fitted black polo shirt with golden M logo on chest, deep open V-neck showing prominent cleavage, short sleeves, black baseball cap with golden M logo worn backwards, long dark wavy hair underneath, small gold hoop earrings' },
]

const SKATEPARK_OUTFITS = [
  { label: 'Mini skirt + black crop top, brunette (original)', value: 'very short mini skirt, tight deep V-neck crop top deep cleavage, long dark wavy hair' },
  { label: 'Denim skirt + white crop top, blonde', value: 'very short denim mini skirt, tight white deep V-neck crop top deep cleavage, long blonde wavy hair' },
  { label: 'Black pleated skirt + gray crop top, high ponytail', value: 'very short black pleated mini skirt, tight grey deep V-neck crop top deep cleavage, long dark hair in high ponytail' },
  { label: 'Pink skirt + black crop top, brunette', value: 'very short pink mini skirt, tight black deep V-neck crop top deep cleavage, long brown wavy hair' },
  { label: 'White skirt + red crop top, dark hair', value: 'very short white mini skirt, tight red deep V-neck crop top deep cleavage, long dark wavy hair' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SubNicheLabel({ subNiche }: { subNiche: string }) {
  if (subNiche === 'sport') return <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">🏃 Coach</span>
  if (subNiche === 'golf') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">⛳ Golf</span>
  if (subNiche === 'nurse') return <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-medium">🏥 Nurse</span>
  if (subNiche === 'restaurant') return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 font-medium">🍽️ Restaurant</span>
  if (subNiche === 'meteo') return <span className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">📺 Weather</span>
  if (subNiche === 'reporter') return <span className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">🌪️ Reporter</span>
  if (subNiche === 'serveuse') return <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">🍾 Waitress</span>
  if (subNiche === 'mcdo') return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-200 font-medium">🍔 McDo</span>
  if (subNiche === 'skatepark') return <span className="text-xs px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-medium">🛴 Skatepark</span>
  return <span className="text-xs px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">🎓 Conf.</span>
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
  const [niche, setNiche] = useState<'conference' | 'sport' | 'golf' | 'vieux' | 'meteo' | 'serveuse' | 'mcdo' | 'skatepark'>('conference')

  // ── UI mode ──
  const [uiMode, setUiMode] = useState<'direct' | 'variation' | 'random'>('direct')
  const [randomCount, setRandomCount] = useState(5)

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
      if (!res.ok) { setCharsError(data.error || 'Scan failed'); return }
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
    const dbNiche = niche === 'vieux' ? 'vieux' : niche === 'golf' ? 'golf' : niche === 'meteo' ? 'meteo' : niche === 'serveuse' ? 'serveuse' : niche === 'mcdo' ? 'mcdo' : niche === 'skatepark' ? 'skatepark' : 'conference_sport'
    fetch(`/api/video/validated-prompts?niche=${dbNiche}`)
      .then(r => r.json())
      .then(data => {
        const all: ValidatedPrompt[] = data.prompts || []
        // Filtre côté client par subNiche pour conference/sport ; golf, vieux, etc. sont déjà leur propre niche
        const filtered = (niche === 'vieux' || niche === 'golf' || niche === 'meteo' || niche === 'serveuse' || niche === 'mcdo' || niche === 'skatepark')
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
    if (sub === 'serveuse') return SERVEUSE_OUTFITS
    if (sub === 'mcdo') return MCDO_OUTFITS
    if (sub === 'skatepark') return SKATEPARK_OUTFITS
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
    if (!selectedElementId) return setLaunchError('Select a character')
    setLaunchError('')
    setLaunching(true)

    try {
      let body: object

      if (uiMode === 'direct') {
        if (!selectedIds.size) {
          setLaunchError('Select at least one prompt')
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
          setLaunchError('Select a base prompt')
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
        setLaunchError(data.error || 'Error launching')
        setLaunching(false)
        return
      }
      // Success — stay on page to allow relaunching immediately
      setLaunching(false)
      setLaunchSuccess('Run started ✓')
      setTimeout(() => setLaunchSuccess(''), 3000)
    } catch (e) {
      setLaunchError(String(e))
      setLaunching(false)
    }
  }

  // ── Launch Random ──
  const launchRandom = async () => {
    if (!selectedElementId) return setLaunchError('Select a character.')
    if (filteredPrompts.length === 0) return setLaunchError('No prompts available for this niche.')

    setLaunchError('')
    setLaunchSuccess('')
    setLaunching(true)

    // Fisher-Yates shuffle
    const shuffled = [...filteredPrompts]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const picked = shuffled.slice(0, Math.min(randomCount, shuffled.length))
    const ids = picked.map(p => p.id)

    try {
      const res = await fetch('/api/video/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'direct',
          validatedPromptIds: ids,
          batchCount: 1,
          elementId: selectedElementId,
          characterName: selectedElementName,
          duration,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setLaunchError(data.error || 'Error launching')
      } else {
        setLaunchSuccess(`✓ ${ids.length} video${ids.length > 1 ? 's' : ''} launched — random prompts`)
      }
    } catch {
      setLaunchError('Network error')
    } finally {
      setLaunching(false)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-5">

        <TutorialVideo videoId="nO8e2riPWVY" title="Videos" />

        {/* ── Sélecteur de niche — 3 onglets séparés ── */}
        <div className="flex gap-2 flex-wrap">
          {([
            { id: 'conference' as const, emoji: '🎓', label: 'Conference' },
            { id: 'sport' as const,      emoji: '🏃', label: 'Coach' },
            { id: 'golf' as const,       emoji: '⛳', label: 'Golf' },
            { id: 'vieux' as const,      emoji: '👴', label: 'Old' },
            { id: 'meteo' as const,      emoji: '📺', label: 'Weather' },
            { id: 'serveuse' as const,   emoji: '🍾', label: 'Waitress' },
            { id: 'mcdo' as const,       emoji: '🍔', label: 'McDo' },
            { id: 'skatepark' as const,  emoji: '🛴', label: 'Skatepark' },
          ]).map(n => (
            <button
              key={n.id}
              onClick={() => setNiche(n.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                niche === n.id
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              <span>{n.emoji}</span><span>{n.label}</span>
            </button>
          ))}
        </div>

        {/* ── Personnage ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Character</p>
            <button
              onClick={scanFromHiggsfield}
              disabled={scanning || loadingChars}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:border-violet-500 hover:text-violet-700 disabled:opacity-50 transition"
            >
              {scanning ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                  Scanning...
                </>
              ) : 'Scan from Higgsfield'}
            </button>
          </div>
          {loadingChars || scanning ? (
            <p className="text-xs text-slate-600">{scanning ? 'Scanning...' : 'Loading...'}</p>
          ) : charsError ? (
            <p className="text-xs text-red-600">{charsError}</p>
          ) : refElements.length === 0 ? (
            <p className="text-xs text-slate-600">No Reference Element found. Click "Scan from Higgsfield" to load your characters.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {refElements.map(e => (
                <button
                  key={e.id}
                  onClick={() => { setSelectedElementId(e.id); setSelectedElementName(e.name) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    selectedElementId === e.id
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:border-violet-500/50'
                  }`}
                >
                  {e.name}
                  {e.type === 'soul_2' && <span className="ml-1 text-emerald-400 text-xs">🎬</span>}
                  {e.type === 'soul_cinematic' && <span className="ml-1 text-slate-600 text-xs">🖼</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Durée ── */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] flex items-center gap-6">
          <div className="flex-1">
            <label className="block text-xs text-slate-500 mb-1.5">
              Video duration: <span className="text-slate-900 font-medium">{duration}s</span>
            </label>
            <input type="range" min={3} max={15} value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="w-full accent-violet-500" />
          </div>
          <div className="text-xs text-slate-600 text-right leading-relaxed">
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
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}>
            🎯 Direct — exact prompt
          </button>
          <button onClick={() => setUiMode('variation')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${
              uiMode === 'variation'
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}>
            🔀 Variations — outfit + line
          </button>
          <button
            onClick={() => setUiMode('random')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
              uiMode === 'random'
                ? 'bg-violet-50 text-violet-700 border border-violet-300'
                : 'text-slate-500 hover:text-slate-900 bg-white border border-slate-200'
            }`}
          >
            🎲 Random
          </button>
        </div>

        {/* ════════════════════════════════════════════════════════════
            MODE DIRECTS
        ════════════════════════════════════════════════════════════ */}
        {uiMode === 'direct' && (
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">

            {/* Header + filtres */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Validated prompts</p>
                <p className="text-xs text-slate-600 mt-0.5">Each prompt is generated as an exact copy — zero modification.</p>
              </div>
              <span className="text-xs text-slate-600">
                {niche === 'conference' ? '🎓 Conference' : niche === 'sport' ? '🏃 Coach' : niche === 'golf' ? '⛳ Golf' : niche === 'meteo' ? '📺 Weather' : niche === 'serveuse' ? '🍾 Waitress' : niche === 'mcdo' ? '🍔 McDo' : niche === 'skatepark' ? '🛴 Skatepark' : '👴 Old'}
              </span>
            </div>

            {/* Sélect tout */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <button onClick={toggleSelectAll} className="text-xs text-violet-600 hover:text-violet-700 transition">
                {selectedIds.size === filteredPrompts.length && filteredPrompts.length > 0
                  ? '☑ Deselect all' : '☐ Select all'}
              </button>
              <span className="text-xs text-slate-600">
                {selectedIds.size} / {filteredPrompts.length} selected
              </span>
            </div>

            {/* Liste */}
            <div className="divide-y divide-slate-100">
              {loadingPrompts ? (
                <div className="p-6 text-center text-xs text-slate-600">Loading prompts...</div>
              ) : filteredPrompts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-600">No prompts for this niche.</div>
              ) : (
                filteredPrompts.map(p => (
                  <label key={p.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    selectedIds.has(p.id) ? 'bg-violet-50 border-l-2 border-violet-500' : 'hover:bg-slate-50 border-l-2 border-transparent'
                  }`}>
                    <div
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                        selectedIds.has(p.id)
                          ? 'bg-violet-600 border-violet-500'
                          : 'bg-white border-slate-300'
                      }`}
                      onClick={() => setSelectedIds(prev => {
                        const next = new Set(prev)
                        next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                        return next
                      })}
                    >
                      {selectedIds.has(p.id) && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-slate-800 truncate">
                          {p.isBest && <span className="text-yellow-500 mr-1">★</span>}
                          {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                        </span>
                        <SubNicheLabel subNiche={p.subNiche} />
                      </div>
                      {p.userDescription ? (
                        <p className="text-xs text-slate-600 mt-0.5 truncate italic">&ldquo;{p.userDescription}&rdquo;</p>
                      ) : p.speakerLine && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate italic">&ldquo;{p.speakerLine}&rdquo;</p>
                      )}
                      {p.authorName && (
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-xs text-violet-600/60">by {p.authorName}</p>
                          <button
                            onClick={async (e) => {
                              e.preventDefault()
                              if (!confirm('Delete this prompt?')) return
                              await fetch(`/api/video/validated-prompts/${p.id}`, { method: 'DELETE' })
                              setPrompts(prev => prev.filter(x => x.id !== p.id))
                              setSelectedIds(prev => { const s = new Set(prev); s.delete(p.id); return s })
                            }}
                            className="text-slate-300 hover:text-red-500 transition text-xs"
                            title="Delete this community prompt"
                          >🗑</button>
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Batch count + CTA */}
            <div className="p-5 border-t border-slate-200 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Generate <span className="text-slate-900 font-medium">×{batchCount}</span> times each selected prompt
                </p>
                <div className="flex bg-slate-100 border border-slate-200 rounded-xl p-1 gap-1">
                  {[1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => setBatchCount(n)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                        batchCount === n
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}>×{n}</button>
                  ))}
                </div>
              </div>
              {launchError && <p className="text-sm text-red-600">{launchError}</p>}
              {launchSuccess && (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  {launchSuccess}
                  <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ In progress</a>
                </p>
              )}
              <button onClick={launch}
                disabled={launching || !selectedElementId || selectedIds.size === 0}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {launching ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                    Launching...
                  </span>
                ) : `Generate ${totalDirect} video${totalDirect > 1 ? 's' : ''} — ${selectedIds.size} prompt${selectedIds.size > 1 ? 's' : ''} × ${batchCount}`}
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
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-700 font-medium mb-0.5">Ultra-light variations — prompt structure unchanged</p>
              <p className="text-xs text-amber-700/70">
                Only the outfit and line change. Lines calibrated to the exact context of the concept. 🔴 Red underwear: always fixed.
              </p>
            </div>

            {/* ── ÉTAPE 1 : Sélectionner le concept de base ── */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-900">① Choose the base concept</p>
                <p className="text-xs text-slate-600 mt-0.5">Lines and outfit pool adapt automatically to the selected concept.</p>
              </div>
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {loadingPrompts ? (
                  <div className="p-4 text-center text-xs text-slate-600">Loading...</div>
                ) : (
                  prompts.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                      varBaseId === p.id ? 'bg-violet-50' : 'hover:bg-slate-50'
                    }`}>
                      <input type="radio" name="varBase" value={p.id}
                        checked={varBaseId === p.id}
                        onChange={() => selectVarBase(p.id)}
                        className="accent-violet-500 w-4 h-4 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-800">
                            {p.isBest && <span className="text-yellow-500 mr-1">★</span>}
                            {p.title.replace(/^P\d+(-V\d+)?\s*—\s*/, '')}
                          </span>
                          <SubNicheLabel subNiche={p.subNiche} />
                          {!p.phraseVariations && (
                            <span className="text-xs text-slate-600 italic">outfit only</span>
                          )}
                        </div>
                        {p.userDescription ? (
                          <p className="text-xs text-slate-600 truncate italic mt-0.5">&ldquo;{p.userDescription}&rdquo;</p>
                        ) : p.speakerLine && varBaseId !== p.id && (
                          <p className="text-xs text-slate-600 truncate italic mt-0.5">&ldquo;{p.speakerLine}&rdquo;</p>
                        )}
                        {p.authorName && (
                          <p className="text-xs text-violet-600/60 mt-0.5">by {p.authorName}</p>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* ── ÉTAPE 2 : Répliques dédiées (seulement si prompt sélectionné avec phrases) ── */}
            {varBaseId && currentPhrasePool && (
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-900">② Line</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {currentPhrasePool.length} lines calibrated to this specific concept.
                    In random mode, they cycle without repetition.
                  </p>
                </div>
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {/* Aléatoire */}
                  <label className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    varPhrase === '' ? 'bg-violet-50' : 'hover:bg-slate-50'
                  }`}>
                    <input type="radio" name="phrase" value=""
                      checked={varPhrase === ''}
                      onChange={() => setVarPhrase('')}
                      className="accent-violet-500 w-4 h-4 shrink-0" />
                    <span className="text-sm text-slate-800">🎲 Random — cycle without repetition</span>
                  </label>
                  {/* Dedicated lines */}
                  {currentPhrasePool.map((ph, i) => (
                    <label key={i} className={`flex items-start gap-3 px-5 py-3 cursor-pointer transition ${
                      varPhrase === ph ? 'bg-violet-50' : 'hover:bg-slate-50'
                    }`}>
                      <input type="radio" name="phrase" value={ph}
                        checked={varPhrase === ph}
                        onChange={() => setVarPhrase(ph)}
                        className="accent-violet-500 w-4 h-4 shrink-0 mt-0.5" />
                      <span className="text-sm italic text-slate-700">&ldquo;{ph}&rdquo;</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ── ÉTAPE 3 : Outfit ── */}
            {varBaseId && (
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {currentPhrasePool ? '③' : '②'} Outfit
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">Pool adapted to the concept's niche.</p>
                  </div>
                  <span className="text-xs text-slate-600">🔴 Red underwear — fixed</span>
                </div>
                <div className="divide-y divide-slate-100">
                  <label className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                    varOutfit === '' ? 'bg-violet-50' : 'hover:bg-slate-50'
                  }`}>
                    <input type="radio" name="outfit" value=""
                      checked={varOutfit === ''}
                      onChange={() => setVarOutfit('')}
                      className="accent-violet-500 w-4 h-4 shrink-0" />
                    <span className="text-sm text-slate-800">🎲 Random — cycle without repetition</span>
                  </label>
                  {outfitPool.map(o => (
                    <label key={o.value} className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition ${
                      varOutfit === o.value ? 'bg-violet-50' : 'hover:bg-slate-50'
                    }`}>
                      <input type="radio" name="outfit" value={o.value}
                        checked={varOutfit === o.value}
                        onChange={() => setVarOutfit(o.value)}
                        className="accent-violet-500 w-4 h-4 shrink-0" />
                      <span className="text-sm text-slate-700">{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ── Batch count + CTA ── */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Generate <span className="text-slate-900 font-medium">×{varBatchCount}</span> variation{varBatchCount > 1 ? 's' : ''} of this concept
                  {varBatchCount > 1 && currentPhrasePool && (
                    <span className="text-slate-600"> — different lines and outfits each time</span>
                  )}
                </p>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 10].map(n => (
                    <button key={n} onClick={() => setVarBatchCount(n)}
                      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium border transition ${
                        varBatchCount === n
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-violet-500/50'
                      }`}>×{n}</button>
                  ))}
                </div>
              </div>

              {!varBaseId && (
                <p className="text-xs text-slate-600 italic">← Select a base concept to continue</p>
              )}
              {launchError && <p className="text-sm text-red-600">{launchError}</p>}
              {launchSuccess && (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  {launchSuccess}
                  <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ In progress</a>
                </p>
              )}

              <button onClick={launch}
                disabled={launching || !selectedElementId || !varBaseId}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition">
                {launching ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg>
                    Launching...
                  </span>
                ) : varBaseId
                    ? `Generate ${totalVar} variation${totalVar > 1 ? 's' : ''}`
                    : 'Launch'}
              </button>
            </div>

          </div>
        )}

        {/* ── Mode Aléatoire ─────────────────────────────────────── */}
        {uiMode === 'random' && (
          <div className="bg-white border border-slate-200/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-900">Random generation</p>
              <p className="text-xs text-slate-600 mt-0.5">
                Picks {randomCount} random prompt{randomCount > 1 ? 's' : ''} from the selected niche and generates 1 video per prompt.
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-2">
                  Number of videos: <span className="text-slate-900 font-medium">{randomCount}</span>
                  {filteredPrompts.length > 0 && (
                    <span className="text-slate-600 ml-1">({filteredPrompts.length} prompts available)</span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={Math.min(20, Math.max(filteredPrompts.length, 1))}
                    value={randomCount}
                    onChange={e => setRandomCount(Number(e.target.value))}
                    className="flex-1 accent-violet-500"
                  />
                  <span className="text-sm font-semibold text-slate-900 w-8 text-right">{randomCount}</span>
                </div>
              </div>
              {launchError && <p className="text-sm text-red-600">{launchError}</p>}
              {launchSuccess && (
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  {launchSuccess}
                  <a href="/en-cours" className="underline opacity-70 hover:opacity-100">→ In progress</a>
                </p>
              )}
              <button
                onClick={launchRandom}
                disabled={launching || !selectedElementId || filteredPrompts.length === 0}
                className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {launching
                  ? <span className="flex items-center justify-center gap-2"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20"/></svg> Launching...</span>
                  : `🎲 Generate ${Math.min(randomCount, filteredPrompts.length)} random video${Math.min(randomCount, filteredPrompts.length) > 1 ? 's' : ''}`
                }
              </button>
            </div>
          </div>
        )}

      </div>
      </PageWrapper>
      </main>
    </div>
  )
}
