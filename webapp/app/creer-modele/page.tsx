'use client'

import { useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

type ScenePrompt = { id: string; label: string; prompt: string }
type TileStatus = 'pending' | 'ok' | 'fail'
type Tile = { status: TileStatus; runId?: string; name?: string; error?: string; stored?: boolean }

const RES_OPTIONS = ['1K', '2K', '4K'] as const

export default function CreerModelePage() {
  useSession()

  // ── Ancre ──
  const [anchor, setAnchor] = useState<{ preview: string; dataUrl: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  // ── Identité ──
  const [name, setName] = useState('')
  const [signature, setSignature] = useState('')
  const [niche, setNiche] = useState('')
  const [lifestyleCount, setLifestyleCount] = useState(20)
  const [bedroomCount, setBedroomCount] = useState(10)
  const [resolution, setResolution] = useState<(typeof RES_OPTIONS)[number]>('2K')

  // ── Prompts ──
  const [prompts, setPrompts] = useState<ScenePrompt[]>([])
  const [genPrompts, setGenPrompts] = useState(false)

  // ── Images (Stage A) ──
  const [tiles, setTiles] = useState<Record<string, Tile>>({})
  const [running, setRunning] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')

  // ── Stage B (ModelArk — Body Morph) ──
  const [enhanceMode, setEnhanceMode] = useState<'morph' | 'back' | 'both'>('morph')
  const [bustIdx, setBustIdx] = useState(0) // 0=max … 3=léger
  const [hips, setHips] = useState<'wide' | 'moderate' | 'subtle'>('wide')
  const [keepFraming, setKeepFraming] = useState(false)
  const [buttIdx, setButtIdx] = useState(1) // 0=huge bubble … 2=toned léger
  const [keepDress, setKeepDress] = useState(false)
  const [route, setRoute] = useState<'wavespeed' | 'modelark'>('wavespeed')
  const [enhanceSeed, setEnhanceSeed] = useState(778899)
  const [enhanceRunning, setEnhanceRunning] = useState(false)
  const [enhanceTiles, setEnhanceTiles] = useState<Record<string, Tile & { kind?: string }>>({})
  const [enhanceDone, setEnhanceDone] = useState('')

  const [error, setError] = useState('')
  const esRefs = useRef<EventSource[]>([])

  // ── Upload ancre ──
  function loadAnchor(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setAnchor({ preview: dataUrl, dataUrl })
    }
    reader.readAsDataURL(file)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type.startsWith('image/')) loadAnchor(f)
  }

  // ── 1) Générer les prompts via Claude (i2i) ──
  async function generatePrompts() {
    setError(''); setDoneMsg(''); setGenPrompts(true)
    try {
      const res = await fetch('/api/refset/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, signature, niche, lifestyleCount, bedroomCount, anchorDataUrl: anchor?.dataUrl || '' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur génération prompts'); return }
      setPrompts(data.prompts)
      setTiles({})
    } catch (e) {
      setError(`Erreur réseau : ${String(e)}`)
    } finally {
      setGenPrompts(false)
    }
  }

  function updatePrompt(id: string, prompt: string) {
    setPrompts(ps => ps.map(p => (p.id === id ? { ...p, prompt } : p)))
  }
  function removePrompt(id: string) {
    setPrompts(ps => ps.filter(p => p.id !== id))
    setTiles(t => { const c = { ...t }; delete c[id]; return c })
  }

  // ── SSE helper ──
  function listen(runId: string) {
    const es = new EventSource(`/api/refset/events/${runId}`)
    esRefs.current.push(es)
    es.onmessage = (ev) => {
      let e: { type?: string; id?: string; name?: string; ok?: boolean; error?: string; msg?: string; stored?: boolean }
      try { e = JSON.parse(ev.data) } catch { return }
      if (e.type === 'image' && e.id) {
        setTiles(t => ({ ...t, [e.id as string]: e.ok ? { status: 'ok', runId, name: e.name, stored: e.stored } : { status: 'fail', error: e.error } }))
      } else if (e.type === 'done') {
        es.close()
        setRunning(false)
        setDoneMsg('Génération terminée.')
      } else if (e.type === 'error') {
        es.close()
        setRunning(false)
        setError(e.msg || 'Erreur moteur')
      }
    }
    es.onerror = () => { es.close() }
  }

  // ── SSE Stage B ──
  function listenEnhance(runId: string) {
    const es = new EventSource(`/api/refset/events/${runId}`)
    esRefs.current.push(es)
    es.onmessage = (ev) => {
      let e: { type?: string; id?: string; name?: string; kind?: string; ok?: boolean; error?: string; msg?: string; stored?: boolean }
      try { e = JSON.parse(ev.data) } catch { return }
      if (e.type === 'image' && e.id) {
        const key = `${e.id}-${e.kind}`
        setEnhanceTiles(t => ({ ...t, [key]: e.ok ? { status: 'ok', runId, name: e.name, kind: e.kind, stored: e.stored } : { status: 'fail', error: e.error, kind: e.kind } }))
      } else if (e.type === 'done') {
        es.close(); setEnhanceRunning(false); setEnhanceDone('Stage B terminé.')
      } else if (e.type === 'error') {
        es.close(); setEnhanceRunning(false); setError(e.msg || 'Erreur ModelArk')
      }
    }
    es.onerror = () => { es.close() }
  }

  // ── Lancer Stage B (ModelArk) sur les images OK ──
  async function startEnhance() {
    const items = Object.entries(tiles)
      .filter(([, t]) => t.status === 'ok' && t.runId && t.name)
      .map(([, t]) => ({ runId: t.runId as string, name: t.name as string }))
    if (!items.length) { setError('Aucune image OK à passer en Stage B'); return }
    setError(''); setEnhanceDone(''); setEnhanceRunning(true); setEnhanceTiles({})
    try {
      const res = await fetch('/api/refset/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items, mode: enhanceMode, route, bustIdx, hips, keepFraming, buttIdx, keepDress,
          seed: enhanceSeed, anchorDataUrl: anchor?.dataUrl || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur lancement Stage B'); setEnhanceRunning(false); return }
      listenEnhance(data.runId)
    } catch (e) {
      setError(`Erreur réseau : ${String(e)}`); setEnhanceRunning(false)
    }
  }

  // ── 2) Générer toutes les images ──
  async function generateImages() {
    if (!anchor) { setError('Ajoute une ancre d\'abord'); return }
    if (!prompts.length) { setError('Génère les prompts d\'abord'); return }
    setError(''); setDoneMsg(''); setRunning(true)
    setTiles(Object.fromEntries(prompts.map(p => [p.id, { status: 'pending' as TileStatus }])))
    try {
      const res = await fetch('/api/refset/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorDataUrl: anchor.dataUrl, prompts, resolution, aspectRatio: '9:16' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur lancement'); setRunning(false); return }
      listen(data.runId)
    } catch (e) {
      setError(`Erreur réseau : ${String(e)}`); setRunning(false)
    }
  }

  // ── Régénérer une seule image (KO ou pas) ──
  async function regen(p: ScenePrompt) {
    if (!anchor) return
    setTiles(t => ({ ...t, [p.id]: { status: 'pending' } }))
    try {
      const res = await fetch('/api/refset/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchorDataUrl: anchor.dataUrl, prompts: [p], resolution, aspectRatio: '9:16' }),
      })
      const data = await res.json()
      if (!res.ok) { setTiles(t => ({ ...t, [p.id]: { status: 'fail', error: data.error } })); return }
      listen(data.runId)
    } catch (e) {
      setTiles(t => ({ ...t, [p.id]: { status: 'fail', error: String(e) } }))
    }
  }

  const okCount = Object.values(tiles).filter(t => t.status === 'ok').length
  const failCount = Object.values(tiles).filter(t => t.status === 'fail').length
  const canGen = !!anchor && (lifestyleCount + bedroomCount > 0)

  return (
    <div className="flex min-h-screen bg-[#09090b] text-white">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-5">

        <div>
          <h1 className="text-xl font-bold">🧬 Créer le modèle</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Ancre → set de référence cohérent (Nano Banana i2i + méthodo prompts ultra-réaliste). La recette Miraya, en un flux.
          </p>
        </div>

        {/* ── Ancre ── */}
        <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07] space-y-3">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
            Ancre d&apos;identité <span className="text-zinc-600 font-normal normal-case">(la photo source — visage adulte verrouillé)</span>
          </p>
          <div className="flex gap-4 items-start">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('anchor-input')?.click()}
              className={`flex-1 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${dragging ? 'border-violet-500 bg-violet-900/10' : 'border-white/[0.08] hover:border-white/[0.20]'}`}
            >
              <input id="anchor-input" type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) loadAnchor(f) }} />
              <p className="text-zinc-400 text-sm">{anchor ? 'Cliquer pour remplacer l\'ancre' : 'Dépose l\'ancre ici ou clique'}</p>
              <p className="text-zinc-600 text-xs mt-1">JPG · PNG · WEBP</p>
            </div>
            {anchor && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={anchor.preview} alt="ancre" className="w-28 h-36 object-cover rounded-xl border border-white/[0.08]" />
            )}
          </div>
        </div>

        {/* ── Identité ── */}
        <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07] grid grid-cols-2 gap-4">
          <div className="col-span-1">
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Nom de la modèle</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Miraya"
              className="mt-2 w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Trait signature (verrouillé)</label>
            <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="exactly one beauty mark under the left eye, skin otherwise clear"
              className="mt-2 w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Vibe / niche / direction</label>
            <input value={niche} onChange={e => setNiche(e.target.value)} placeholder="east-asian, mi-vingtaine, lifestyle premium crédible (café, gym, voyage...)"
              className="mt-2 w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Scènes lifestyle</label>
            <input type="number" min={0} max={40} value={lifestyleCount} onChange={e => setLifestyleCount(parseInt(e.target.value) || 0)}
              className="mt-2 w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Scènes chambre</label>
            <input type="number" min={0} max={20} value={bedroomCount} onChange={e => setBedroomCount(parseInt(e.target.value) || 0)}
              className="mt-2 w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Résolution</label>
            <div className="mt-2 flex gap-2">
              {RES_OPTIONS.map(r => (
                <button key={r} onClick={() => setResolution(r)}
                  className={`px-4 py-2.5 rounded-xl text-sm transition ${resolution === r ? 'bg-violet-600/30 text-white border border-violet-500/50' : 'bg-black/40 text-zinc-400 border border-white/[0.08] hover:text-zinc-200'}`}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Bouton générer prompts ── */}
        <div className="flex gap-3">
          <button onClick={generatePrompts} disabled={!canGen || genPrompts}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 disabled:cursor-not-allowed transition">
            {genPrompts
              ? <span className="flex items-center justify-center gap-2"><Spinner /> Claude écrit les prompts…</span>
              : `1 · Générer ${lifestyleCount + bedroomCount} prompts de scène (Claude i2i)`}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* ── Liste des prompts éditables ── */}
        {prompts.length > 0 && (
          <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">{prompts.length} prompts — éditables avant génération</p>
              <button onClick={generateImages} disabled={running || !anchor}
                className="px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 transition text-sm">
                {running ? <span className="flex items-center gap-2"><Spinner /> Génération…</span> : `2 · Générer les images (${resolution})`}
              </button>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {prompts.map(p => (
                <details key={p.id} className="bg-black/30 rounded-xl border border-white/[0.06]">
                  <summary className="px-3 py-2 cursor-pointer text-sm text-zinc-300 flex items-center gap-2">
                    <span className="text-zinc-500 font-mono text-xs">{p.id}</span>
                    <span className="font-medium">{p.label || 'scène'}</span>
                    <button onClick={(e) => { e.preventDefault(); removePrompt(p.id) }}
                      className="ml-auto text-zinc-600 hover:text-red-400 text-xs">supprimer</button>
                  </summary>
                  <textarea value={p.prompt} onChange={e => updatePrompt(p.id, e.target.value)} rows={6}
                    className="w-full bg-black/40 border-t border-white/[0.06] px-3 py-2 text-xs text-zinc-300 focus:outline-none resize-y rounded-b-xl" />
                </details>
              ))}
            </div>
          </div>
        )}

        {/* ── Grille de résultats ── */}
        {Object.keys(tiles).length > 0 && (
          <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-white/[0.07] space-y-3">
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
              Set généré — <span className="text-emerald-400">{okCount} ok</span>{failCount > 0 && <span className="text-red-400"> · {failCount} KO</span>} {doneMsg && <span className="text-zinc-500 normal-case font-normal">· {doneMsg}</span>}
            </p>
            <div className="grid grid-cols-4 gap-3">
              {prompts.map(p => {
                const t = tiles[p.id]
                if (!t) return null
                return (
                  <div key={p.id} className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black/40 border border-white/[0.06] group">
                    {t.status === 'ok' && t.runId && t.name && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/refset/image/${t.runId}/${t.name}`} alt={p.label} className="w-full h-full object-cover" />
                    )}
                    {t.status === 'pending' && (
                      <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
                    )}
                    {t.status === 'fail' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                        <span className="text-red-400 text-xs">échec</span>
                        <span className="text-zinc-500 text-[10px] mt-1 line-clamp-3">{t.error}</span>
                      </div>
                    )}
                    <div className="absolute top-1 left-1.5 text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5">{p.label || p.id}</div>
                    {t.status === 'ok' && t.stored && <div className="absolute top-1 right-1.5 text-[10px] bg-emerald-600/80 text-white rounded px-1.5 py-0.5" title="Sauvé dans Supabase Storage">☁</div>}
                    <button onClick={() => regen(p)} disabled={t.status === 'pending'}
                      className="absolute bottom-1.5 right-1.5 text-[10px] bg-black/70 text-white rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 transition disabled:opacity-40">
                      régénérer
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Stage B — ModelArk (boost + dos) ── */}
        {okCount > 0 && (
          <div className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl p-5 border border-fuchsia-500/[0.15] space-y-4">
            <div>
              <p className="text-xs text-fuchsia-300 font-medium uppercase tracking-wider">Stage B · Seedream 4.5 — Body Morph</p>
              <p className="text-zinc-500 text-xs mt-1">
                Passe les {okCount} images OK en édition i2i : <span className="text-zinc-400">body morph</span> (poitrine + hanches, taille fine) + <span className="text-zinc-400">vues de dos</span>. Moteur par défaut <span className="text-zinc-400">WaveSpeed (sans modération)</span>, ModelArk en secours.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Moteur</label>
                <div className="mt-1.5 flex gap-2">
                  {([['wavespeed', 'WaveSpeed'], ['modelark', 'ModelArk']] as const).map(([rt, lbl]) => (
                    <button key={rt} onClick={() => setRoute(rt)}
                      className={`px-3 py-2 rounded-xl text-sm transition ${route === rt ? 'bg-fuchsia-600/30 text-white border border-fuchsia-500/50' : 'bg-black/40 text-zinc-400 border border-white/[0.08] hover:text-zinc-200'}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Mode</label>
                <div className="mt-1.5 flex gap-2">
                  {([['morph', 'Body Morph'], ['back', 'Dos'], ['both', 'Les deux']] as const).map(([m, lbl]) => (
                    <button key={m} onClick={() => setEnhanceMode(m)}
                      className={`px-3 py-2 rounded-xl text-sm transition ${enhanceMode === m ? 'bg-fuchsia-600/30 text-white border border-fuchsia-500/50' : 'bg-black/40 text-zinc-400 border border-white/[0.08] hover:text-zinc-200'}`}>{lbl}</button>
                  ))}
                </div>
              </div>
              {enhanceMode !== 'back' && (
                <>
                  <div>
                    <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Poitrine — {['Max', 'Forte', 'Modérée', 'Légère'][bustIdx]}</label>
                    <input type="range" min={0} max={3} step={1} value={bustIdx} onChange={e => setBustIdx(parseInt(e.target.value))}
                      className="mt-2.5 w-36 accent-fuchsia-500 block" />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Hanches</label>
                    <select value={hips} onChange={e => setHips(e.target.value as 'wide' | 'moderate' | 'subtle')}
                      className="mt-1.5 bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500">
                      <option value="wide">Larges</option>
                      <option value="moderate">Modérées</option>
                      <option value="subtle">Subtiles</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer pb-2">
                    <input type="checkbox" checked={keepFraming} onChange={e => setKeepFraming(e.target.checked)} className="accent-fuchsia-500" />
                    Garder le cadrage/tenue
                  </label>
                </>
              )}
              {enhanceMode !== 'morph' && (
                <>
                  <div>
                    <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Fessier (dos) — {['Énorme', 'Gros', 'Galbé'][buttIdx]}</label>
                    <input type="range" min={0} max={2} step={1} value={buttIdx} onChange={e => setButtIdx(parseInt(e.target.value))}
                      className="mt-2.5 w-32 accent-fuchsia-500 block" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer pb-2">
                    <input type="checkbox" checked={keepDress} onChange={e => setKeepDress(e.target.checked)} className="accent-fuchsia-500" />
                    Robe couvrant le fessier
                  </label>
                </>
              )}
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider">Seed</label>
                <input type="number" value={enhanceSeed} onChange={e => setEnhanceSeed(parseInt(e.target.value) || 0)}
                  className="mt-1.5 w-28 bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-500" />
              </div>
              <button onClick={startEnhance} disabled={enhanceRunning}
                className="ml-auto px-5 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-br from-fuchsia-600 to-fuchsia-500 hover:from-fuchsia-500 hover:to-fuchsia-400 disabled:opacity-50 transition text-sm">
                {enhanceRunning ? <span className="flex items-center gap-2"><Spinner /> ModelArk…</span> : `Lancer sur ${okCount} images`}
              </button>
            </div>

            {enhanceDone && <p className="text-xs text-zinc-500">{enhanceDone}</p>}

            {Object.keys(enhanceTiles).length > 0 && (
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(enhanceTiles).map(([key, t]) => (
                  <div key={key} className="relative aspect-[9/16] rounded-xl overflow-hidden bg-black/40 border border-white/[0.06]">
                    {t.status === 'ok' && t.runId && t.name && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/refset/image/${t.runId}/${t.name}`} alt={key} className="w-full h-full object-cover" />
                    )}
                    {t.status === 'pending' && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
                    {t.status === 'fail' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                        <span className="text-red-400 text-xs">échec</span>
                        <span className="text-zinc-500 text-[10px] mt-1 line-clamp-3">{t.error}</span>
                      </div>
                    )}
                    <div className="absolute top-1 left-1.5 text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5">
                      {key.replace(/-(morph|back)$/, '')} · {t.kind === 'back' ? 'dos' : 'morph'}
                    </div>
                    {t.status === 'ok' && t.stored && <div className="absolute top-1 right-1.5 text-[10px] bg-emerald-600/80 text-white rounded px-1.5 py-0.5" title="Sauvé dans Supabase Storage">☁</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
      </PageWrapper>
      </main>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="60" strokeDashoffset="20" />
    </svg>
  )
}
