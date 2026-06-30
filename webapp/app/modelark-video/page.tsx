'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModelArkCharacter = {
  id: string
  name: string
  photoDataUrls: string[]
  createdAt: string
}

type ValidatedPrompt = {
  id: number
  subNiche: string
  title: string
  isBest: boolean
  suggestedDuration: number
  promptJson: string  // inclus via /api/modelark/prompts
}

type GenerationResult = {
  id: string
  taskId: string
  characterName: string
  promptTitle: string
  promptText: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  videoUrl: string | null
  error: string | null
  startedAt: number
}

const ALLOWED_EMAIL = 'justbattest@gmail.com'

const NICHE_LABELS: Record<string, string> = {
  conference: '🎤 Conference',
  sport: '💪 Sport',
  nurse: '🩺 Nurse',
  restaurant: '🍽️ Restaurant',
  meteo: '🌤️ Weather',
  golf: '⛳ Golf',
  serveuse: '🍸 Serveuse',
  mcdo: '🍔 McDo',
  skatepark: '🛹 Skatepark',
  standdetir: '🎯 Shooting Range',
}

// Extrait un prompt texte depuis le promptJson Higgsfield.
// Récupère toutes les valeurs string des champs de chaque shot, concaténées.
function extractPromptText(promptJson: string): string {
  try {
    const parsed = JSON.parse(promptJson)
    const extractFields = (obj: Record<string, unknown>): string => {
      // Récupère toutes les valeurs string non-vides de l'objet
      return Object.values(obj)
        .filter(v => typeof v === 'string' && v.trim().length > 10)
        .map(v => String(v).trim())
        .join('. ')
    }

    if (Array.isArray(parsed)) {
      const parts = parsed.map(shot => extractFields(shot as Record<string, unknown>)).filter(Boolean)
      const result = parts.join(' | ').substring(0, 800)
      return result || JSON.stringify(parsed).substring(0, 800)
    }

    if (typeof parsed === 'object' && parsed !== null) {
      const result = extractFields(parsed as Record<string, unknown>)
      return result || JSON.stringify(parsed).substring(0, 800)
    }

    return String(parsed).substring(0, 800)
  } catch {
    return promptJson.substring(0, 800)
  }
}

// Compresse une image via canvas → JPEG 80% max 600px (réduit ~10× la taille base64)
async function compressImage(dataUrl: string): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const MAX = 600
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
        else { width = Math.round((width * MAX) / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.80))
    }
    img.src = dataUrl
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModelArkVideoPage() {
  const { data: session } = useSession()

  // All prompts cache for niche switching without refetch
  const allPromptsRef = useRef<ValidatedPrompt[]>([])

  // Characters
  const [characters, setCharacters] = useState<ModelArkCharacter[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string>('')
  const [charLoading, setCharLoading] = useState(false)

  // New character form
  const [showNewChar, setShowNewChar] = useState(false)
  const [newCharName, setNewCharName] = useState('')
  const [newCharPhotos, setNewCharPhotos] = useState<string[]>([]) // base64 data URLs
  const [newCharSaving, setNewCharSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Prompts
  const [niches, setNiches] = useState<string[]>([])
  const [selectedNiche, setSelectedNiche] = useState<string>('')
  const [prompts, setPrompts] = useState<ValidatedPrompt[]>([])
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null)
  const [customPrompt, setCustomPrompt] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [promptsLoaded, setPromptsLoaded] = useState(false)

  // Generation
  const [duration, setDuration] = useState(5)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<GenerationResult[]>([])

  // Settings — ModelArk API key
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [apiKeySaving, setApiKeySaving] = useState(false)

  const isAllowed = session?.user?.email === ALLOWED_EMAIL

  // ── Load API key status ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAllowed) return
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setApiKeyConfigured(!!d.modelArkApiKeyConnected))
      .catch(() => setApiKeyConfigured(false))
  }, [isAllowed])

  // ── Load characters ──────────────────────────────────────────────────────────
  const loadCharacters = useCallback(async () => {
    if (!isAllowed) return
    setCharLoading(true)
    try {
      const res = await fetch('/api/modelark/characters')
      const data = await res.json()
      setCharacters(data.characters || [])
      if (data.characters?.length > 0 && !selectedCharId) {
        setSelectedCharId(data.characters[0].id)
      }
    } catch {
      // ignore
    } finally {
      setCharLoading(false)
    }
  }, [isAllowed, selectedCharId])

  useEffect(() => { loadCharacters() }, [loadCharacters])

  // ── Load niches + all prompts ────────────────────────────────────────────────
  useEffect(() => {
    if (!isAllowed) return
    fetch('/api/modelark/prompts')
      .then(r => r.json())
      .then((data: { prompts: ValidatedPrompt[]; availableSubNiches: string[] }) => {
        setNiches(data.availableSubNiches)
        if (data.availableSubNiches.length > 0) {
          const first = data.availableSubNiches[0]
          setSelectedNiche(first)
          const nichePrompts = data.prompts.filter(p => p.subNiche === first)
          setPrompts(nichePrompts)
          if (nichePrompts.length > 0) {
            const best = nichePrompts.find(p => p.isBest) || nichePrompts[0]
            setSelectedPromptId(best.id)
            setDuration(best.suggestedDuration)
          }
        }
        // Cache ALL prompts in a ref for quick niche switching
        allPromptsRef.current = data.prompts
        setPromptsLoaded(true)
      })
      .catch(() => {})
  }, [isAllowed])

  // ── Filter prompts when niche changes ───────────────────────────────────────
  useEffect(() => {
    if (!selectedNiche || allPromptsRef.current.length === 0) return
    const filtered = allPromptsRef.current.filter(p => p.subNiche === selectedNiche)
    setPrompts(filtered)
    setSelectedPromptId(null)
    if (filtered.length > 0) {
      const best = filtered.find(p => p.isBest) || filtered[0]
      setSelectedPromptId(best.id)
      setDuration(best.suggestedDuration)
    }
  }, [selectedNiche])

  // ── Handle photo upload for new character (with compression) ─────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (newCharPhotos.length + files.length > 9) {
      alert('Maximum 9 photos par personnage (limite API Seedance 2.0)')
      return
    }

    for (const file of files) {
      await new Promise<void>(resolve => {
        const reader = new FileReader()
        reader.onload = async ev => {
          const raw = ev.target?.result as string
          const compressed = await compressImage(raw)
          setNewCharPhotos(prev => [...prev, compressed].slice(0, 9))
          resolve()
        }
        reader.readAsDataURL(file)
      })
    }
    // Reset input pour permettre de re-sélectionner les mêmes fichiers
    e.target.value = ''
  }

  // ── Save new character ───────────────────────────────────────────────────────
  async function saveCharacter() {
    if (!newCharName.trim() || newCharPhotos.length === 0) {
      alert('Donnez un nom et au moins 1 photo')
      return
    }
    setNewCharSaving(true)
    try {
      const res = await fetch('/api/modelark/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCharName.trim(), photoDataUrls: newCharPhotos }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowNewChar(false)
      setNewCharName('')
      setNewCharPhotos([])
      await loadCharacters()
      setSelectedCharId(data.character.id)
    } catch (err) {
      alert('Erreur: ' + String(err))
    } finally {
      setNewCharSaving(false)
    }
  }

  // ── Delete character ─────────────────────────────────────────────────────────
  async function deleteCharacter(id: string) {
    if (!confirm('Supprimer ce personnage ?')) return
    await fetch(`/api/modelark/characters?id=${id}`, { method: 'DELETE' })
    await loadCharacters()
    if (selectedCharId === id) setSelectedCharId('')
  }

  // ── Save API key ─────────────────────────────────────────────────────────────
  async function saveApiKey() {
    if (!apiKeyInput.trim()) return
    setApiKeySaving(true)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelArkApiKey: apiKeyInput.trim() }),
      })
      setApiKeyConfigured(true)
      setApiKeyInput('')
    } catch {
      alert('Erreur lors de la sauvegarde de la clef API')
    } finally {
      setApiKeySaving(false)
    }
  }

  // ── Generate video ───────────────────────────────────────────────────────────
  async function generateVideo() {
    if (!selectedCharId) { alert('Sélectionnez un personnage'); return }
    if (!useCustom && !selectedPromptId) { alert('Sélectionnez un prompt'); return }
    if (useCustom && !customPrompt.trim()) { alert('Entrez un prompt'); return }

    let promptText = customPrompt.trim()
    let promptTitle = 'Custom prompt'

    if (!useCustom) {
      const prompt = prompts.find(p => p.id === selectedPromptId)
      if (!prompt) { alert('Prompt introuvable'); return }
      promptText = extractPromptText(prompt.promptJson)
      promptTitle = prompt.title
    }

    const character = characters.find(c => c.id === selectedCharId)
    if (!character) { alert('Personnage introuvable'); return }

    setGenerating(true)

    const resultId = `gen_${Date.now()}`
    const newResult: GenerationResult = {
      id: resultId,
      taskId: '',
      characterName: character.name,
      promptTitle,
      promptText,
      status: 'pending',
      videoUrl: null,
      error: null,
      startedAt: Date.now(),
    }
    setResults(prev => [newResult, ...prev])

    try {
      const res = await fetch('/api/modelark/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: selectedCharId, promptText, duration }),
      })
      const data = await res.json()

      if (!res.ok) {
        setResults(prev =>
          prev.map(r => r.id === resultId ? { ...r, status: 'failed', error: data.error } : r)
        )
        return
      }

      const taskId = data.taskId
      setResults(prev =>
        prev.map(r => r.id === resultId ? { ...r, taskId, status: 'running' } : r)
      )

      // Polling loop
      pollStatus(resultId, taskId)
    } catch (err) {
      setResults(prev =>
        prev.map(r => r.id === resultId ? { ...r, status: 'failed', error: String(err) } : r)
      )
    } finally {
      setGenerating(false)
    }
  }

  // ── Poll task status ─────────────────────────────────────────────────────────
  function pollStatus(resultId: string, taskId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/modelark/status/${taskId}`)
        const data = await res.json()

        if (data.status === 'succeeded') {
          clearInterval(interval)
          setResults(prev =>
            prev.map(r =>
              r.id === resultId
                ? { ...r, status: 'succeeded', videoUrl: data.videoUrl }
                : r
            )
          )
        } else if (data.status === 'failed') {
          clearInterval(interval)
          setResults(prev =>
            prev.map(r =>
              r.id === resultId
                ? { ...r, status: 'failed', error: data.error || 'Génération échouée' }
                : r
            )
          )
        }
        // sinon: 'pending' ou 'running' → on continue à poller
      } catch {
        // ignore erreur réseau temporaire
      }
    }, 5000) // toutes les 5s
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Chargement...</p>
      </div>
    )
  }

  if (!isAllowed) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <PageWrapper>
          <div className="flex items-center justify-center h-64">
            <p className="text-slate-500">Accès réservé.</p>
          </div>
        </PageWrapper>
      </div>
    )
  }

  const selectedChar = characters.find(c => c.id === selectedCharId)
  const selectedPrompt = prompts.find(p => p.id === selectedPromptId)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <PageWrapper>
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">🎬 ModelArk Video</h1>
            <p className="text-slate-500 text-sm mt-1">
              Seedance 2.0 · 720p · 9:16 · via ModelArk (ByteDance) — outil provisoire
            </p>
          </div>

          {/* API Key setup */}
          {apiKeyConfigured === false && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-800 mb-3">Clef API ModelArk requise</h2>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="ark-d0d7fd64-..."
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={saveApiKey}
                  disabled={apiKeySaving || !apiKeyInput.trim()}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {apiKeySaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Characters */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">👤 Personnages</h2>
              <button
                onClick={() => setShowNewChar(s => !s)}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
              >
                + Nouveau personnage
              </button>
            </div>

            {/* New character form */}
            {showNewChar && (
              <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-3">
                <input
                  type="text"
                  value={newCharName}
                  onChange={e => setNewCharName(e.target.value)}
                  placeholder="Nom du personnage (ex: Emma)"
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />
                <div>
                  <p className="text-xs text-slate-500 mb-2">
                    Photos de référence ({newCharPhotos.length}/9) — plus il y en a, mieux c'est
                  </p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newCharPhotos.map((url, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`ref ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-lg border border-violet-200"
                        />
                        <button
                          onClick={() => setNewCharPhotos(prev => prev.filter((_, j) => j !== i))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {newCharPhotos.length < 9 && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-16 h-16 rounded-lg border-2 border-dashed border-violet-300 flex items-center justify-center text-violet-400 hover:border-violet-500 hover:text-violet-600"
                      >
                        +
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={saveCharacter}
                    disabled={newCharSaving || !newCharName.trim() || newCharPhotos.length === 0}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {newCharSaving ? 'Saving...' : 'Sauvegarder'}
                  </button>
                  <button
                    onClick={() => { setShowNewChar(false); setNewCharName(''); setNewCharPhotos([]) }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Character list */}
            {charLoading ? (
              <p className="text-sm text-slate-400">Chargement...</p>
            ) : characters.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun personnage — créez-en un ci-dessus.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {characters.map(char => (
                  <div
                    key={char.id}
                    onClick={() => setSelectedCharId(char.id)}
                    className={`relative rounded-xl border-2 p-3 cursor-pointer transition-all ${
                      selectedCharId === char.id
                        ? 'border-violet-500 bg-violet-50'
                        : 'border-slate-200 bg-white hover:border-violet-300'
                    }`}
                  >
                    <div className="flex gap-1.5 mb-2">
                      {char.photoDataUrls.slice(0, 4).map((url, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={url}
                          alt=""
                          className="w-8 h-8 object-cover rounded-md"
                        />
                      ))}
                      {char.photoDataUrls.length > 4 && (
                        <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                          +{char.photoDataUrls.length - 4}
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-slate-900 truncate">{char.name}</p>
                    <p className="text-xs text-slate-400">{char.photoDataUrls.length} photo{char.photoDataUrls.length > 1 ? 's' : ''}</p>
                    <button
                      onClick={e => { e.stopPropagation(); deleteCharacter(char.id) }}
                      className="absolute top-2 right-2 text-slate-300 hover:text-red-500 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prompts */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">📝 Prompt</h2>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={e => setUseCustom(e.target.checked)}
                  className="rounded"
                />
                Prompt libre
              </label>
            </div>

            {useCustom ? (
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={4}
                placeholder="Describe the video you want to generate... (the character reference photos will be prepended automatically as @Image1 @Image2 ...)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            ) : (
              <>
                {/* Niche selector */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {niches.map(n => (
                    <button
                      key={n}
                      onClick={() => setSelectedNiche(n)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                        selectedNiche === n
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                      }`}
                    >
                      {NICHE_LABELS[n] || n}
                    </button>
                  ))}
                </div>

                {/* Prompt list */}
                {!promptsLoaded ? (
                  <p className="text-sm text-slate-400">Chargement des prompts...</p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {prompts.map(prompt => (
                      <div
                        key={prompt.id}
                        onClick={() => {
                          setSelectedPromptId(prompt.id)
                          setDuration(prompt.suggestedDuration)
                        }}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-all ${
                          selectedPromptId === prompt.id
                            ? 'border-violet-400 bg-violet-50'
                            : 'border-slate-100 bg-slate-50 hover:border-violet-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-800 truncate">{prompt.title}</span>
                            {prompt.isBest && (
                              <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">★ BEST</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{prompt.suggestedDuration}s</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Prompt preview */}
            {!useCustom && selectedPrompt && (
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">
                  {extractPromptText(selectedPrompt.promptJson)}
                </p>
              </div>
            )}
          </div>

          {/* Duration + Generate */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
            <h2 className="font-semibold text-slate-900 mb-4">⚙️ Options</h2>

            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">Durée</label>
                <span className="text-sm font-bold text-violet-600">{duration}s</span>
              </div>
              <input
                type="range"
                min={4}
                max={15}
                step={1}
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>4s</span>
                <span>15s</span>
              </div>
            </div>

            {/* Summary */}
            <div className="mb-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Personnage</span>
                <span className="font-medium text-slate-800">
                  {selectedChar ? `${selectedChar.name} (${selectedChar.photoDataUrls.length} photos)` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Prompt</span>
                <span className="font-medium text-slate-800 truncate max-w-48">
                  {useCustom ? 'Custom' : (selectedPrompt?.title || '—')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Format</span>
                <span className="font-medium text-slate-800">720p · 9:16 · {duration}s</span>
              </div>
            </div>

            <button
              onClick={generateVideo}
              disabled={generating || !selectedCharId || apiKeyConfigured === false || (!useCustom && !selectedPromptId) || (useCustom && !customPrompt.trim())}
              className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-violet-200"
            >
              {generating ? '⏳ Envoi en cours...' : '🎬 Générer la vidéo'}
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
              <h2 className="font-semibold text-slate-900 mb-4">🎥 Résultats</h2>
              <div className="space-y-4">
                {results.map(result => (
                  <div key={result.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900 truncate max-w-sm">
                          {result.promptTitle}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {result.characterName} · {new Date(result.startedAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <StatusBadge status={result.status} />
                    </div>

                    {result.status === 'running' && (
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                        Génération en cours (Seedance 2.0 prend ~1-3 minutes)...
                      </div>
                    )}

                    {result.status === 'failed' && result.error && (
                      <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                        {result.error}
                      </div>
                    )}

                    {result.status === 'succeeded' && result.videoUrl && (
                      <div className="mt-3">
                        <video
                          src={result.videoUrl}
                          controls
                          className="w-full max-w-xs rounded-xl border border-slate-200 mx-auto block"
                          style={{ aspectRatio: '9/16', maxHeight: '400px' }}
                        />
                        <a
                          href={result.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-center text-xs text-violet-600 hover:underline"
                        >
                          Ouvrir en plein écran ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </PageWrapper>
    </div>
  )
}

function StatusBadge({ status }: { status: GenerationResult['status'] }) {
  const configs = {
    pending:   { label: 'En attente', classes: 'bg-slate-100 text-slate-500' },
    running:   { label: 'En cours', classes: 'bg-violet-100 text-violet-700' },
    succeeded: { label: '✓ Terminé', classes: 'bg-green-100 text-green-700' },
    failed:    { label: '✗ Échec', classes: 'bg-red-100 text-red-600' },
  }
  const { label, classes } = configs[status]
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  )
}
