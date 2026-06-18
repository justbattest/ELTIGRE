'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import {
  Plus, RefreshCw, Trash2, Calendar, CheckCircle,
  Clock, AlertCircle, XCircle, Wifi, User, ChevronDown,
  Send, Sparkles, X, ExternalLink, AlertTriangle, Video, LayoutGrid,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = {
  id: string
  username: string
  networkName: string
  characterName: string | null
  warmupPhase: number
  status: string
  lastPostedAt: string | null
  postsToday: number
  createdAt: string
}

type Post = {
  id: string
  accountId: string
  driveFileId: string | null
  driveFileUrl: string | null
  caption: string | null
  mediaType: string
  scheduledFor: string | null
  postedAt: string | null
  status: string
  igPostId: string | null
  errorMessage: string | null
  retryCount: number
  createdAt: string
  account: {
    id: string
    username: string
    networkName: string
    warmupPhase: number
    status: string
  }
}

type Generation = {
  id: number
  runId: string | null
  generatedImageUrl: string | null
  driveGeneratedUrl: string | null
  modelUsed: string | null
  sceneDescription: string | null
  generatedAt: string | null
  characterName: string | null
  isVideo: boolean
  isPosted: boolean
  isPending: boolean
  postCount: number
}

type DriveCarousel = {
  id: string
  name: string
  runId: string
  characterName: string
  previewUrl: string
  fileUrls: string[]
  fileIds: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WARMUP_LIMITS: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3 }
const WARMUP_LABELS: Record<number, string> = {
  1: 'Warm-up W1 (1/day)',
  2: 'Warm-up W2 (1/day)',
  3: 'Warm-up W3 (2/day)',
  4: 'Active (3/day)',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending:    { color: 'bg-slate-100 text-slate-600 border border-slate-200',   icon: <Clock className="w-3 h-3" />,        label: 'Scheduled' },
    processing: { color: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'In progress' },
    posted:     { color: 'bg-green-50 text-green-700 border border-green-200', icon: <CheckCircle className="w-3 h-3" />,  label: 'Posted ✓' },
    failed:     { color: 'bg-red-50 text-red-600 border border-red-200',    icon: <XCircle className="w-3 h-3" />,     label: 'Failed' },
    cancelled:  { color: 'bg-slate-100 text-slate-500 border border-slate-200',    icon: <X className="w-3 h-3" />,            label: 'Cancelled' },
  }
  const s = map[status] ?? { color: 'bg-slate-100 text-slate-500 border border-slate-200', icon: null, label: status }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  )
}

function AccountStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    warmup:    'bg-violet-50 text-violet-700 border border-violet-300',
    active:    'bg-green-50 text-green-700 border border-green-200',
    challenge: 'bg-red-50 text-red-600 border border-red-200',
    banned:    'bg-red-100 text-red-700 border border-red-300',
    suspended: 'bg-orange-50 text-orange-700 border border-orange-200',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[status] ?? 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
      {status}
    </span>
  )
}

function WarmupBar({ phase }: { phase: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4].map(p => (
        <div
          key={p}
          className={`h-1.5 w-6 rounded-full transition-colors ${
            p <= phase ? 'bg-violet-500' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}

// ─── Quick Carousel Scheduler ──────────────────────────────────────────────────

function QuickCarouselModal({
  accounts,
  onClose,
  onScheduled,
}: {
  accounts: Account[]
  onClose: () => void
  onScheduled: () => void
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '')
  const [perDay, setPerDay] = useState(2)
  const [numDays, setNumDays] = useState(3)
  const [startDatetime, setStartDatetime] = useState('')  // datetime-local (heure locale)
  const [step, setStep] = useState<'config' | 'scanning' | 'preview' | 'scheduling' | 'done'>('config')
  const [carousels, setCarousels] = useState<DriveCarousel[]>([])
  const [selected, setSelected] = useState<DriveCarousel[]>([])
  const [alreadyPostedCount, setAlreadyPostedCount] = useState(0)
  const [captions, setCaptions] = useState<string[]>([])
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState<{ scheduled: number; firstPostAt?: string } | null>(null)

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const total = perDay * numDays

  const setNowPlus2 = () => {
    const d = new Date(Date.now() + 2 * 60 * 1000)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setStartDatetime(local)
  }

  const scan = async () => {
    if (!selectedAccount) return setError('Select an account')
    if (!selectedAccount.characterName) return setError('This account has no linked character (go to Accounts → edit)')
    setStep('scanning')
    setError('')
    try {
      const res = await fetch('/api/poster/scan-carousels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterName: selectedAccount.characterName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan error')
      if (!data.carousels?.length) {
        setError(data.message || 'No carousel found in Drive for this character.')
        setStep('config')
        return
      }
      setCarousels(data.carousels)
      setAlreadyPostedCount(data.alreadyPosted || 0)

      // Random selection of N carousels (all already filtered = not yet posted)
      const shuffled = [...data.carousels].sort(() => Math.random() - 0.5)
      const picked = shuffled.slice(0, Math.min(total, shuffled.length))
      setSelected(picked)
      setStep('preview')
    } catch (e) {
      setError(String(e))
      setStep('config')
    }
  }

  const schedule = async () => {
    setStep('scheduling')
    setError('')

    // Generate all captions in parallel with Claude
    setProgress('Generating captions with Claude...')
    let generatedCaptions: string[] = []
    try {
      const captionResults = await Promise.all(
        selected.map(() =>
          fetch('/api/instagram/generate-caption', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              niche: 'carousel',
              mediaType: 'carousel',
              characterName: selectedAccount?.characterName,
              language: 'en',
            }),
          }).then(r => r.json()).then(d => d.caption || '')
        )
      )
      generatedCaptions = captionResults
      setCaptions(generatedCaptions)
    } catch {
      generatedCaptions = selected.map(() => '')
    }

    // Bulk scheduling
    setProgress('Scheduling...')
    try {
      const res = await fetch('/api/poster/bulk-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          carousels: selected.map((c, i) => ({
            fileUrls: c.fileUrls,
            caption: generatedCaptions[i] || '',
            carouselFolderId: c.id,  // ID Drive pour déduplication
          })),
          perDay,
          startDate: startDatetime
            ? new Date(startDatetime).toISOString().split('T')[0]  // date locale sélectionnée
            : new Date(Date.now() + 86400000).toISOString().split('T')[0], // demain par défaut
          firstPostAt: startDatetime ? new Date(startDatetime).toISOString() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scheduling error')
      setResult({ scheduled: data.scheduled, firstPostAt: data.firstPostAt })
      setStep('done')
      onScheduled()
    } catch (e) {
      setError(String(e))
      setStep('preview')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <div>
            <h2 className="font-semibold text-slate-900">Schedule Carousels</h2>
            <p className="text-xs text-slate-500 mt-0.5">Auto Drive scan · Optimal US times · Claude captions</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700" /></button>
        </div>

        <div className="p-5 space-y-5">

          {/* Step: config */}
          {(step === 'config' || step === 'scanning') && (
            <>
              {/* Compte */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Account</label>
                <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500"
                >
                  {accounts.filter(a => a.status !== 'banned').map(a => (
                    <option key={a.id} value={a.id}>
                      @{a.username}{a.characterName ? ` · ${a.characterName}` : ' (no character)'} — {a.networkName}
                    </option>
                  ))}
                </select>
                {selectedAccount?.characterName && (
                  <p className="text-xs text-slate-400 mt-1">
                    Drive scan: <span className="text-violet-600">{selectedAccount.characterName}/carousels/</span>
                  </p>
                )}
              </div>

              {/* Par jour */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">Per day</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setPerDay(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition ${
                        perDay === n ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nombre de jours */}
              <div>
                <label className="text-xs text-slate-500 uppercase tracking-wider block mb-2">
                  Number of days — <span className="text-violet-600">{total} carousels total</span>
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 5, 7].map(n => (
                    <button key={n} onClick={() => setNumDays(n)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition ${
                        numDays === n ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {n}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Premier post */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-slate-500 uppercase tracking-wider">First post (optional)</label>
                  <button onClick={setNowPlus2}
                    className="text-xs text-violet-600 hover:text-violet-700 transition font-medium"
                  >
                    Test: now + 2 min
                  </button>
                </div>
                <input
                  type="datetime-local"
                  value={startDatetime}
                  onChange={e => setStartDatetime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Enter your local time. Empty = optimal US times automatically starting tomorrow.
                </p>
              </div>

              {/* Info horaires */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500 space-y-0.5">
                <p className="text-slate-700 font-medium mb-1">Automatic US times (EST):</p>
                <p>☀️ Morning: 6–9 AM EST · 🌆 Noon: 11:30 AM–1:30 PM EST · 🌙 Evening: 7–9:30 PM EST</p>
                <p>Random offset ±7–25 min · never exactly H:00 or H:30</p>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
            </>
          )}

          {/* Step: scanning */}
          {step === 'scanning' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <RefreshCw className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm text-slate-500">Scanning Drive...</p>
              <p className="text-xs text-slate-400">{selectedAccount?.characterName}/carousels/</p>
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && selected.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-900 font-medium">
                  <span className="text-violet-600">{selected.length}</span> carousels selected
                  <span className="text-slate-500 text-xs ml-2">out of {carousels.length} available</span>
                  {alreadyPostedCount > 0 && (
                    <span className="text-slate-400 text-xs ml-2">· {alreadyPostedCount} already posted excluded</span>
                  )}
                </p>
                <button
                  onClick={() => {
                    const shuffled = [...carousels].sort(() => Math.random() - 0.5)
                    setSelected(shuffled.slice(0, Math.min(total, shuffled.length)))
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Reshuffle
                </button>
              </div>

              {/* Aperçu des carousels sélectionnés */}
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {selected.map((c, i) => (
                  <div key={c.id} className="aspect-square bg-slate-100 rounded-lg overflow-hidden relative">
                    <img
                      src={c.previewUrl}
                      alt={c.name}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-slate-900/60 text-[9px] text-white px-1 py-0.5 text-center">
                      #{i + 1} · {c.fileUrls.length} imgs
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
                Captions auto-generated in English by Claude (open-ended question).
                First post tomorrow at optimal US times.
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
            </div>
          )}

          {/* Step: scheduling */}
          {step === 'scheduling' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Sparkles className="w-8 h-8 text-violet-500 animate-pulse" />
              <p className="text-sm text-slate-500">{progress}</p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center py-8 gap-3 text-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
              <p className="text-lg font-bold text-slate-900">{result.scheduled} carousels scheduled ✓</p>
              <p className="text-sm text-slate-500">
                First post: {result.firstPostAt
                  ? new Date(result.firstPostAt).toLocaleString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                  : 'tomorrow'}
              </p>
              <p className="text-xs text-slate-400">English captions generated · Optimal US times · Check Queue posts</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-slate-100 text-slate-500 hover:text-slate-900 transition">
            {step === 'done' ? 'Close' : 'Cancel'}
          </button>
          {step === 'config' && (
            <button onClick={scan} disabled={!selectedAccount?.characterName}
              className="flex-1 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              <LayoutGrid className="w-4 h-4" />
              Scan Drive ({total} carousels)
            </button>
          )}
          {step === 'preview' && (
            <button onClick={schedule}
              className="flex-1 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              Schedule {selected.length} carousels
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Modal : Planifier un post ─────────────────────────────────────────────────

function ScheduleModal({
  generation,
  accounts,
  onClose,
  onScheduled,
}: {
  generation: Generation
  accounts: Account[]
  onClose: () => void
  onScheduled: () => void
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '')
  const [caption, setCaption] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [mediaType, setMediaType] = useState<'reel' | 'photo'>('reel')
  const [generating, setGenerating] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [error, setError] = useState('')

  // Initialiser l'heure à +1h arrondie
  useEffect(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1, 0, 0, 0)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setScheduledFor(local)
  }, [])

  const generateCaption = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/instagram/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: generation.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Caption generation error')
      setCaption(data.caption || '')
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const schedule = async () => {
    if (!selectedAccountId) return setError('Select an account')
    if (!generation.driveGeneratedUrl && !generation.generatedImageUrl) {
      return setError('No Drive file available for this content')
    }

    setScheduling(true)
    setError('')
    try {
      const res = await fetch('/api/instagram/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          driveFileUrl: generation.driveGeneratedUrl || generation.generatedImageUrl,
          caption,
          mediaType,
          scheduledFor: scheduledFor || null,
          generationId: generation.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scheduling error')
      onScheduled()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setScheduling(false)
    }
  }

  const thumbUrl = generation.driveGeneratedUrl || generation.generatedImageUrl

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Schedule a post</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aperçu média */}
          {thumbUrl && (
            <div className="relative w-full aspect-[9/16] max-h-48 rounded-xl overflow-hidden bg-slate-100">
              {thumbUrl.includes('.mp4') || thumbUrl.includes('video') ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
                  Video — {generation.modelUsed || 'unknown'}
                </div>
              ) : (
                <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
              )}
              {generation.driveGeneratedUrl && (
                <a
                  href={generation.driveGeneratedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 bg-slate-900/60 hover:bg-slate-900/80 p-1.5 rounded-lg transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                </a>
              )}
            </div>
          )}

          {/* Compte cible */}
          <div>
            <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-1.5">
              Target account
            </label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500"
            >
              {accounts.filter(a => a.status !== 'banned').map(a => (
                <option key={a.id} value={a.id}>
                  @{a.username}{a.characterName ? ` · ${a.characterName}` : ''} — {a.networkName} — Phase {a.warmupPhase} (max {WARMUP_LIMITS[a.warmupPhase]}/j)
                </option>
              ))}
            </select>
          </div>

          {/* Type de media */}
          <div className="flex gap-2">
            {(['reel', 'photo'] as const).map(t => (
              <button
                key={t}
                onClick={() => setMediaType(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                  mediaType === t
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                }`}
              >
                {t === 'reel' ? 'Reel' : 'Photo'}
              </button>
            ))}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-500 font-medium uppercase tracking-wider">Caption</label>
              <button
                onClick={generateCaption}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 disabled:opacity-50 transition"
              >
                {generating ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {generating ? 'Generating...' : 'Generate with Claude'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Instagram caption (optional — generate with Claude or write manually)..."
              rows={3}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Date/heure */}
          <div>
            <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block mb-1.5">
              Schedule for (leave empty = as soon as possible)
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Note: exact times (:00 and :30) are automatically offset by ±7–23 min
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-slate-100 text-slate-500 hover:text-slate-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={schedule}
            disabled={scheduling || !selectedAccountId}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {scheduling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {scheduling ? 'Scheduling...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal : Ajouter un compte ─────────────────────────────────────────────────

function AddAccountModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [characterName, setCharacterName] = useState('')
  const [networkName, setNetworkName] = useState('iPhone 12promax')
  const [warmupPhase, setWarmupPhase] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => {
        const all = [...(data.referenceElements || []), ...(data.soulCharacters || [])]
        setCharacters(all)
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    if (!username.trim()) return setError('Username required')
    if (!networkName.trim()) return setError('Network required')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/instagram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, totpSecret: totpSecret.trim() || null, characterName: characterName || null, networkName, warmupPhase }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      onAdded()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">Add an Instagram account</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-slate-700" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Instagram username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="@username (without the @)"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Password (encrypted in DB)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Instagram password"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">
              Google Authenticator 2FA key
            </label>
            <input
              value={totpSecret}
              onChange={e => setTotpSecret(e.target.value)}
              placeholder="Ex: JBSW Y3DP EHPK 3PXP (espaces ok)"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">
              Instagram → Security → Two-factor auth → App → "Enter key manually"
            </p>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Character (model)</label>
            {characters.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setCharacterName('')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                    characterName === '' ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  None
                </button>
                {characters.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCharacterName(c.name)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      characterName === c.name ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={characterName}
                onChange={e => setCharacterName(e.target.value)}
                placeholder="Ex: EMMA, NINA..."
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500"
              />
            )}
            <p className="text-xs text-slate-400 mt-1">Link this account to a single character — avoids content crossovers</p>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wider block mb-1.5">Hotspot phone</label>
            <select
              value={networkName}
              onChange={e => setNetworkName(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-violet-500"
            >
              <option value="iPhone 7">iPhone 7</option>
              <option value="iPhone 10">iPhone 10</option>
              <option value="iPhone 11">iPhone 11</option>
              <option value="iPhone 12promax">iPhone 12promax</option>
              <option value="iPhone 14">iPhone 14</option>
              <option value="iPhone 15promax">iPhone 15promax</option>
              <option value="Samsung A54">Samsung A54</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Warm-up phase</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  onClick={() => setWarmupPhase(p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                    warmupPhase === p
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Phase {p}<br />
                  <span className="text-xs opacity-70">{WARMUP_LIMITS[p]}/j</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{error}</p>}
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-slate-100 text-slate-500 hover:text-slate-900 transition">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────

export default function PosterPage() {
  useSession()

  const [tab, setTab] = useState<'accounts' | 'gallery' | 'queue'>('queue')

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)

  // Gallery (générations récentes)
  const [generations, setGenerations] = useState<Generation[]>([])
  const [allCharacters, setAllCharacters] = useState<string[]>([])
  const [loadingGens, setLoadingGens] = useState(false)
  const [scheduleGen, setScheduleGen] = useState<Generation | null>(null)
  const [showQuickCarouselModal, setShowQuickCarouselModal] = useState(false)
  // Proxies par réseau (1 proxy = 1 téléphone = 3 comptes)
  const [proxyDraft, setProxyDraft] = useState<Record<string, string>>({})
  const [savingProxies, setSavingProxies] = useState(false)
  const [proxySaved, setProxySaved] = useState(false)
  // Filtres galerie
  const [filterChar, setFilterChar] = useState<string>('all')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image'>('video') // default: vidéos seulement

  // Queue
  const [posts, setPosts] = useState<Post[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [postFilter, setPostFilter] = useState<string>('all')

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true)
    try {
      const res = await fetch('/api/instagram/accounts')
      const data = await res.json()
      setAccounts(data.accounts || [])
    } catch { /* ignore */ }
    finally { setLoadingAccounts(false) }
  }, [])

  const loadGenerations = useCallback(async () => {
    setLoadingGens(true)
    try {
      const params = new URLSearchParams({ limit: '80', hidePosted: 'true' })
      if (filterChar !== 'all') params.set('characterName', filterChar)
      if (filterType !== 'all') params.set('mediaType', filterType)
      const res = await fetch(`/api/generations/recent?${params}`)
      if (res.ok) {
        const data = await res.json()
        setGenerations(data.generations || [])
        if (data.characters?.length) setAllCharacters(data.characters)
      }
    } catch { /* ignore */ }
    finally { setLoadingGens(false) }
  }, [filterChar, filterType])

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true)
    try {
      const statusParam = postFilter !== 'all' ? `?status=${postFilter}` : ''
      const res = await fetch(`/api/instagram/posts${statusParam}&limit=50`)
      const data = await res.json()
      setPosts(data.posts || [])
    } catch { /* ignore */ }
    finally { setLoadingPosts(false) }
  }, [postFilter])

  useEffect(() => {
    loadAccounts()
    // Charger les proxies configurés
    fetch('/api/instagram/network-proxies')
      .then(r => r.json())
      .then(d => { if (d.proxies) setProxyDraft(d.proxies) })
      .catch(() => {})
  }, [loadAccounts])
  useEffect(() => { if (tab === 'gallery') loadGenerations() }, [tab, loadGenerations])
  useEffect(() => { if (tab === 'queue') loadPosts() }, [tab, loadPosts])

  const cancelPost = async (postId: string) => {
    try {
      await fetch(`/api/instagram/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      loadPosts()
    } catch { /* ignore */ }
  }

  const retryPost = async (postId: string) => {
    try {
      await fetch(`/api/instagram/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' }),
      })
      loadPosts()
    } catch { /* ignore */ }
  }

  const deleteAccount = async (accountId: string) => {
    if (!confirm('Delete this account? Associated posts will also be deleted.')) return
    try {
      await fetch(`/api/instagram/accounts/${accountId}`, { method: 'DELETE' })
      loadAccounts()
    } catch { /* ignore */ }
  }

  const updateAccountPhase = async (accountId: string, phase: number) => {
    try {
      await fetch(`/api/instagram/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warmupPhase: phase }),
      })
      loadAccounts()
    } catch { /* ignore */ }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Instagram Poster</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  {accounts.length} account{accounts.length !== 1 ? 's' : ''} · Carrier IPs via iPhone hotspot
                </p>
              </div>
              <div className="flex gap-2">
                {tab === 'accounts' && (
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                    Add account
                  </button>
                )}
                {tab === 'gallery' && (
                  <button
                    onClick={loadGenerations}
                    disabled={loadingGens}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-white text-slate-500 hover:text-slate-900 border border-slate-200 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingGens ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {tab === 'queue' && (
                  <button
                    onClick={loadPosts}
                    disabled={loadingPosts}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-white text-slate-500 hover:text-slate-900 border border-slate-200 transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingPosts ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Warning Mac script */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-700">
                <strong className="text-amber-700">Mac poster required:</strong> the local script{' '}
                <code className="text-amber-700 bg-amber-100 px-1 rounded">instagram_poster/main.py</code>{' '}
                must be running on your Mac to execute posts. Run{' '}
                <code className="text-amber-700 bg-amber-100 px-1 rounded">./instagram_poster/install.sh</code>{' '}
                to install it as an automatic service.
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
              {([
                { id: 'queue',    label: 'Queue posts', icon: Calendar },
                { id: 'gallery', label: 'Content',      icon: Send },
                { id: 'accounts', label: 'Accounts',     icon: User },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tab === t.id
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: Queue ─────────────────────────────────────────── */}
            {tab === 'queue' && (
              <div className="space-y-4">
                {/* Filtre status */}
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'pending', 'processing', 'posted', 'failed'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setPostFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        postFilter === s
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                {loadingPosts ? (
                  <p className="text-sm text-slate-400">Loading...</p>
                ) : posts.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
                    <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No scheduled posts</p>
                    <p className="text-slate-400 text-xs mt-1">
                      Go to the "Content" tab to schedule from your generations
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {posts.map(post => (
                      <div
                        key={post.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4 shadow-sm"
                      >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg bg-slate-100 shrink-0 overflow-hidden">
                          {post.driveFileUrl && !post.driveFileUrl.includes('.mp4') ? (
                            <img src={post.driveFileUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Video className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <StatusBadge status={post.status} />
                            <span className="text-xs text-slate-500">@{post.account.username}</span>
                            <span className="text-xs text-slate-400">{post.account.networkName}</span>
                          </div>
                          {post.caption && (
                            <p className="text-xs text-slate-500 truncate mb-1">{post.caption}</p>
                          )}
                          {post.scheduledFor && (
                            <p className="text-xs text-slate-400">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(post.scheduledFor).toLocaleString('en-US', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          )}
                          {post.status === 'posted' && post.postedAt && (
                            <p className="text-xs text-green-700">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Posted on {new Date(post.postedAt).toLocaleString('en-US', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                              {post.igPostId && ` — ID: ${post.igPostId}`}
                            </p>
                          )}
                          {post.status === 'failed' && post.errorMessage && (
                            <p className="text-xs text-red-600 truncate">
                              <XCircle className="w-3 h-3 inline mr-1" />
                              {post.errorMessage}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 shrink-0">
                          {post.status === 'failed' && (
                            <button
                              onClick={() => retryPost(post.id)}
                              title="Retry"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-green-600 transition"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {(post.status === 'pending' || post.status === 'failed') && (
                            <button
                              onClick={() => cancelPost(post.id)}
                              title="Cancel"
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-red-500 transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Gallery ───────────────────────────────────────── */}
            {tab === 'gallery' && (
              <div className="space-y-4">

                {/* ── Barre de filtres ── */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Filtre personnage */}
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setFilterChar('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filterChar === 'all' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'}`}
                    >
                      All
                    </button>
                    {allCharacters.map(c => (
                      <button key={c} onClick={() => setFilterChar(c === filterChar ? 'all' : c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filterChar === c ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>

                  {/* Séparateur */}
                  <div className="h-5 w-px bg-slate-200" />

                  {/* Filtre type */}
                  {(['all', 'video', 'image'] as const).map(t => (
                    <button key={t} onClick={() => setFilterType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filterType === t ? 'bg-slate-600 border-slate-500 text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'}`}
                    >
                      {t === 'all' ? 'All' : t === 'video' ? 'Videos' : 'Photos'}
                    </button>
                  ))}

                  {/* Bouton carousel + refresh */}
                  <div className="ml-auto flex gap-2">
                    <button onClick={loadGenerations} disabled={loadingGens}
                      className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-900 transition disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingGens ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={() => setShowQuickCarouselModal(true)} disabled={accounts.length === 0}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:opacity-40 transition whitespace-nowrap"
                    >
                      <LayoutGrid className="w-4 h-4" />
                      Carousel
                    </button>
                  </div>
                </div>

                {/* ── Info ── */}
                <p className="text-xs text-slate-400">
                  {generations.length} item{generations.length > 1 ? 's' : ''} available — already posted hidden automatically
                </p>

                {accounts.length === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                    No account configured — go to the Accounts tab first.
                  </div>
                )}

                {/* ── Grille ── */}
                {loadingGens ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="aspect-[9/16] bg-slate-200 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : generations.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                    <Video className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">No content available</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {filterChar !== 'all' || filterType !== 'all' ? 'Try changing the filters' : 'Generate content from the other tabs'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {generations.map(gen => {
                      const thumb = gen.driveGeneratedUrl || gen.generatedImageUrl
                      const postUrl = gen.driveGeneratedUrl || gen.generatedImageUrl  // Drive prioritaire, CDN en fallback
                      const hasDrive = !!gen.driveGeneratedUrl
                      const hasUrl = !!postUrl
                      return (
                        <div key={gen.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden group relative shadow-sm">
                          {/* Thumbnail */}
                          <div className="aspect-[9/16] bg-slate-100 relative">
                            {thumb ? (
                              gen.isVideo ? (
                                // CDN Higgsfield = mp4 direct → lecture au hover
                                (thumb.includes('cloudfront') || thumb.includes('.mp4')) ? (
                                  <video
                                    src={thumb}
                                    muted playsInline preload="metadata"
                                    className="absolute inset-0 w-full h-full object-cover cursor-pointer"
                                    onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => {})}
                                    onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-50">
                                    <Video className="w-7 h-7 text-violet-500" />
                                    <span className="text-[10px] text-slate-400 px-2 text-center">{gen.modelUsed || 'video'}</span>
                                  </div>
                                )
                              ) : (
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                              )
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">No preview</div>
                            )}

                            {/* Badges top */}
                            <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1">
                              <div className="flex flex-col gap-1">
                                {gen.characterName && (
                                  <span className="bg-violet-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                                    {gen.characterName}
                                  </span>
                                )}
                                {gen.isPending && (
                                  <span className="bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                                    Scheduled
                                  </span>
                                )}
                              </div>
                              {hasDrive && (
                                <a href={gen.driveGeneratedUrl!} target="_blank" rel="noopener noreferrer"
                                  className="opacity-0 group-hover:opacity-100 bg-slate-900/60 hover:bg-slate-900/80 p-1 rounded transition"
                                >
                                  <ExternalLink className="w-3 h-3 text-white" />
                                </a>
                              )}
                              {!hasDrive && hasUrl && (
                                <span className="bg-slate-200 text-slate-500 text-[9px] px-1 py-0.5 rounded">CDN</span>
                              )}
                            </div>

                            {/* Badge type vidéo/image */}
                            <div className="absolute bottom-1.5 left-1.5">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${gen.isVideo ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                {gen.isVideo ? 'VIDEO' : 'PHOTO'}
                              </span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="p-2 space-y-1.5">
                            {gen.sceneDescription && (
                              <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight">{gen.sceneDescription}</p>
                            )}
                            {gen.generatedAt && (
                              <p className="text-[9px] text-slate-400">
                                {new Date(gen.generatedAt).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            )}
                            <button
                              onClick={() => accounts.length > 0 && hasUrl && setScheduleGen(gen)}
                              disabled={accounts.length === 0 || !hasUrl}
                              className="w-full py-1.5 rounded-lg text-[11px] font-semibold bg-violet-600/80 hover:bg-violet-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              {!hasUrl ? 'No URL' : gen.isPending ? 'Already scheduled' : 'Schedule'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Accounts ──────────────────────────────────────── */}
            {tab === 'accounts' && (
              <div className="space-y-4">
                {/* Guide warmup */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Warm-up guide</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { phase: 1, label: 'Week 1', desc: '1 post/day', sub: 'Manual posts recommended' },
                      { phase: 2, label: 'Week 2', desc: '1 post/day', sub: 'First auto posts' },
                      { phase: 3, label: 'Week 3', desc: '2 posts/day', sub: 'Warmup phase' },
                      { phase: 4, label: 'Active', desc: '3 posts/day', sub: 'Normal phase' },
                    ].map(g => (
                      <div key={g.phase} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                        <div className="text-xs font-medium text-violet-600 mb-0.5">{g.label}</div>
                        <div className="text-sm font-bold text-slate-900">{g.desc}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{g.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Proxies 4G par téléphone ──────────────────────────── */}
                <div className="bg-zinc-900/60 border border-white/[0.07] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Mobile 4G proxies</p>
                      <p className="text-xs text-zinc-600 mt-0.5">1 proxy per phone · replaces iPhone hotspot</p>
                    </div>
                    <button
                      onClick={async () => {
                        setSavingProxies(true)
                        try {
                          await fetch('/api/instagram/network-proxies', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ proxies: proxyDraft }),
                          })
                          setProxySaved(true)
                          setTimeout(() => setProxySaved(false), 3000)
                        } catch { /* ignore */ }
                        finally { setSavingProxies(false) }
                      }}
                      disabled={savingProxies}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition disabled:opacity-50"
                    >
                      {proxySaved ? '✓ Saved' : savingProxies ? '...' : 'Save'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {['iPhone 7', 'iPhone 10', 'iPhone 11', 'iPhone 12promax', 'iPhone 14', 'iPhone 15promax', 'Samsung A54'].map(network => {
                      const accountsOnNetwork = accounts.filter(a => a.networkName === network)
                      return (
                        <div key={network} className="flex items-center gap-3">
                          <div className="w-32 shrink-0">
                            <p className="text-xs font-medium text-zinc-300">{network}</p>
                            <p className="text-[10px] text-zinc-600">
                              {accountsOnNetwork.length > 0
                                ? accountsOnNetwork.map(a => `@${a.username}`).join(', ')
                                : 'no accounts'}
                            </p>
                          </div>
                          <input
                            value={proxyDraft[network] || ''}
                            onChange={e => setProxyDraft(prev => ({ ...prev, [network]: e.target.value }))}
                            placeholder="http://user:pass@host:port (empty = iPhone hotspot)"
                            className={`flex-1 bg-zinc-800 border rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 font-mono focus:outline-none transition ${
                              proxyDraft[network]
                                ? 'border-emerald-600/50 focus:border-emerald-500'
                                : 'border-white/[0.08] focus:border-violet-500/50'
                            }`}
                          />
                          {proxyDraft[network] && (
                            <span className="text-[10px] text-emerald-400 shrink-0">Proxy ✓</span>
                          )}
                          {!proxyDraft[network] && (
                            <span className="text-[10px] text-zinc-600 shrink-0">Hotspot</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-zinc-700 mt-3">
                    Recommended services: ProxyRack · Infatica · Brightdata (~$25–40/month per proxy)
                  </p>
                </div>

                {loadingAccounts ? (
                  <p className="text-sm text-zinc-500">Loading...</p>
                ) : accounts.length === 0 ? (
                  <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-8 text-center">
                    <User className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">No account configured</p>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="mt-3 px-4 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white transition"
                    >
                      Add the first account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {accounts.map(acc => (
                      <div key={acc.id} className="bg-zinc-900/60 border border-white/[0.07] rounded-xl p-4">
                        <div className="flex items-start gap-4">
                          {/* Avatar placeholder */}
                          <div className="w-10 h-10 rounded-full bg-violet-900/50 flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-violet-400">
                              {acc.username.charAt(0).toUpperCase()}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-medium text-white text-sm">@{acc.username}</span>
                              <AccountStatusBadge status={acc.status} />
                              {acc.characterName && (
                                <span className="text-xs px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 font-medium border border-violet-700/30">
                                  {acc.characterName}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                {acc.networkName}
                              </span>
                              <span>{acc.postsToday} post{acc.postsToday !== 1 ? 's' : ''} today</span>
                              {acc.lastPostedAt && (
                                <span>Last: {new Date(acc.lastPostedAt).toLocaleDateString('en-US')}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <WarmupBar phase={acc.warmupPhase} />
                              <span className="text-xs text-zinc-400">{WARMUP_LABELS[acc.warmupPhase]}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-col gap-1 shrink-0">
                            {/* Changer phase */}
                            <select
                              value={acc.warmupPhase}
                              onChange={e => updateAccountPhase(acc.id, Number(e.target.value))}
                              className="bg-zinc-800 border border-white/[0.07] rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-violet-500/50"
                            >
                              {[1, 2, 3, 4].map(p => (
                                <option key={p} value={p}>Phase {p}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => deleteAccount(acc.id)}
                              className="p-1 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-900/20 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Warning challenge */}
                        {acc.status === 'challenge' && (
                          <div className="mt-3 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 text-xs text-red-400 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                              <strong>Verification required!</strong> Open the Instagram app on the iPhone{' '}
                              and complete the SMS/email verification for @{acc.username}.
                            </span>
                          </div>
                        )}
                        {acc.status === 'suspended' && (
                          <div className="mt-3 bg-orange-900/20 border border-orange-700/30 rounded-lg px-3 py-2 text-xs text-orange-400">
                            Account temporarily suspended (FeedbackRequired). Wait 24h.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </PageWrapper>
      </main>

      {/* Modals */}
      {showAddAccount && (
        <AddAccountModal onClose={() => setShowAddAccount(false)} onAdded={loadAccounts} />
      )}
      {scheduleGen && accounts.length > 0 && (
        <ScheduleModal
          generation={scheduleGen}
          accounts={accounts}
          onClose={() => setScheduleGen(null)}
          onScheduled={() => { loadPosts(); loadGenerations() }}
        />
      )}
      {showQuickCarouselModal && accounts.length > 0 && (
        <QuickCarouselModal
          accounts={accounts}
          onClose={() => setShowQuickCarouselModal(false)}
          onScheduled={() => { loadPosts(); setTab('queue') }}
        />
      )}
    </div>
  )
}
