'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import {
  Plus, RefreshCw, Trash2, Calendar, CheckCircle,
  Clock, AlertCircle, XCircle, Wifi, User, ChevronDown,
  Send, Sparkles, X, ExternalLink, AlertTriangle, Video,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = {
  id: string
  username: string
  networkName: string
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
  generatedImageUrl: string | null
  driveGeneratedUrl: string | null
  modelUsed: string | null
  sceneDescription: string | null
  generationStatus: string
  generatedAt: string | null
  runId: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WARMUP_LIMITS: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 3 }
const WARMUP_LABELS: Record<number, string> = {
  1: 'Warm-up S1 (1/j)',
  2: 'Warm-up S2 (1/j)',
  3: 'Warm-up S3 (2/j)',
  4: 'Actif (3/j)',
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending:    { color: 'bg-zinc-700 text-zinc-300',   icon: <Clock className="w-3 h-3" />,        label: 'Planifié' },
    processing: { color: 'bg-amber-900/60 text-amber-300', icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'En cours' },
    posted:     { color: 'bg-emerald-900/60 text-emerald-400', icon: <CheckCircle className="w-3 h-3" />,  label: 'Publié ✓' },
    failed:     { color: 'bg-red-900/60 text-red-400',    icon: <XCircle className="w-3 h-3" />,     label: 'Échec' },
    cancelled:  { color: 'bg-zinc-800 text-zinc-500',    icon: <X className="w-3 h-3" />,            label: 'Annulé' },
  }
  const s = map[status] ?? { color: 'bg-zinc-800 text-zinc-400', icon: null, label: status }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
      {s.icon}{s.label}
    </span>
  )
}

function AccountStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    warmup:    'bg-violet-900/50 text-violet-300',
    active:    'bg-emerald-900/50 text-emerald-400',
    challenge: 'bg-red-900/60 text-red-400',
    banned:    'bg-red-900/80 text-red-300',
    suspended: 'bg-orange-900/60 text-orange-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${map[status] ?? 'bg-zinc-800 text-zinc-400'}`}>
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
            p <= phase ? 'bg-violet-500' : 'bg-zinc-700'
          }`}
        />
      ))}
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
      if (!res.ok) throw new Error(data.error || 'Erreur génération')
      setCaption(data.caption || '')
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const schedule = async () => {
    if (!selectedAccountId) return setError('Sélectionner un compte')
    if (!generation.driveGeneratedUrl && !generation.generatedImageUrl) {
      return setError('Aucun fichier Drive disponible pour ce contenu')
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
      if (!res.ok) throw new Error(data.error || 'Erreur planification')
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
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/[0.07] rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.07]">
          <h2 className="font-semibold text-white">Planifier un post</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aperçu média */}
          {thumbUrl && (
            <div className="relative w-full aspect-[9/16] max-h-48 rounded-xl overflow-hidden bg-zinc-800">
              {thumbUrl.includes('.mp4') || thumbUrl.includes('video') ? (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-500 text-sm">
                  Vidéo — {generation.modelUsed || 'unknown'}
                </div>
              ) : (
                <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
              )}
              {generation.driveGeneratedUrl && (
                <a
                  href={generation.driveGeneratedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 p-1.5 rounded-lg transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-white" />
                </a>
              )}
            </div>
          )}

          {/* Compte cible */}
          <div>
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block mb-1.5">
              Compte cible
            </label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              {accounts.filter(a => a.status !== 'banned').map(a => (
                <option key={a.id} value={a.id}>
                  @{a.username} — {a.networkName} — Phase {a.warmupPhase} (max {WARMUP_LIMITS[a.warmupPhase]}/j)
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
                    : 'bg-zinc-800/60 border-white/[0.07] text-zinc-400 hover:text-white'
                }`}
              >
                {t === 'reel' ? 'Reel' : 'Photo'}
              </button>
            ))}
          </div>

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Caption</label>
              <button
                onClick={generateCaption}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition"
              >
                {generating ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {generating ? 'Génération...' : 'Générer avec Claude'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Caption Instagram (optionnel — générer avec Claude ou écrire manuellement)..."
              rows={3}
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/50"
            />
          </div>

          {/* Date/heure */}
          <div>
            <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider block mb-1.5">
              Planifier pour (laisser vide = dès que possible)
            </label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={e => setScheduledFor(e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
            />
            <p className="text-xs text-zinc-600 mt-1">
              Note : les heures exactes (:00 et :30) sont automatiquement décalées de ±7-23 min
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-white/[0.07]">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            Annuler
          </button>
          <button
            onClick={schedule}
            disabled={scheduling || !selectedAccountId}
            className="flex-1 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {scheduling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {scheduling ? 'Planification...' : 'Planifier'}
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
  const [networkName, setNetworkName] = useState('iPhone 12promax')
  const [warmupPhase, setWarmupPhase] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (!username.trim()) return setError('Username requis')
    if (!networkName.trim()) return setError('Réseau requis')
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/instagram/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, totpSecret: totpSecret.trim() || null, networkName, warmupPhase }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur')
      onAdded()
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-white/[0.07] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.07]">
          <h2 className="font-semibold text-white">Ajouter un compte Instagram</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-zinc-500 hover:text-white" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Username Instagram</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="@username (sans le @)"
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Mot de passe (chiffré en DB)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mot de passe Instagram"
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">
              Clé 2FA Google Authenticator
            </label>
            <input
              value={totpSecret}
              onChange={e => setTotpSecret(e.target.value)}
              placeholder="Ex: JBSW Y3DP EHPK 3PXP (espaces ok)"
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 font-mono"
            />
            <p className="text-xs text-zinc-600 mt-1">
              Instagram → Sécurité → Auth. 2 facteurs → Application → "Entrer la clé manuellement"
            </p>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Téléphone hotspot</label>
            <select
              value={networkName}
              onChange={e => setNetworkName(e.target.value)}
              className="w-full bg-zinc-800 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500/50"
            >
              <option value="iPhone 12promax">iPhone 12promax</option>
              <option value="iPhone 15promax">iPhone 15promax</option>
              <option value="iPhone 14">iPhone 14</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wider block mb-1.5">Phase warm-up</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  onClick={() => setWarmupPhase(p)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition ${
                    warmupPhase === p
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-zinc-800/60 border-white/[0.07] text-zinc-500 hover:text-white'
                  }`}
                >
                  Phase {p}<br />
                  <span className="text-xs opacity-70">{WARMUP_LIMITS[p]}/j</span>
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-400 bg-red-900/20 px-3 py-2 rounded-xl">{error}</p>}
        </div>
        <div className="flex gap-2 p-5 border-t border-white/[0.07]">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm bg-zinc-800 text-zinc-400 hover:text-white transition">
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Enregistrement...' : 'Ajouter'}
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
  const [loadingGens, setLoadingGens] = useState(false)
  const [scheduleGen, setScheduleGen] = useState<Generation | null>(null)

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
      // Récupérer les 30 dernières générations complètes
      const res = await fetch('/api/generations/recent?limit=30&status=complete')
      if (res.ok) {
        const data = await res.json()
        setGenerations(data.generations || [])
      }
    } catch { /* ignore */ }
    finally { setLoadingGens(false) }
  }, [])

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

  useEffect(() => { loadAccounts() }, [loadAccounts])
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
    if (!confirm('Supprimer ce compte ? Les posts associés seront aussi supprimés.')) return
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
    <div className="flex min-h-screen bg-[#09090b] text-zinc-100">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Poster Instagram</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {accounts.length} compte{accounts.length !== 1 ? 's' : ''} · IPs carrier via hotspot iPhone
                </p>
              </div>
              <div className="flex gap-2">
                {tab === 'accounts' && (
                  <button
                    onClick={() => setShowAddAccount(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un compte
                  </button>
                )}
                {tab === 'gallery' && (
                  <button
                    onClick={loadGenerations}
                    disabled={loadingGens}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.07] transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingGens ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {tab === 'queue' && (
                  <button
                    onClick={loadPosts}
                    disabled={loadingPosts}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm bg-zinc-800 text-zinc-400 hover:text-white border border-white/[0.07] transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingPosts ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* Warning Mac script */}
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-300/80">
                <strong className="text-amber-300">Mac poster requis :</strong> le script local{' '}
                <code className="text-amber-200 bg-amber-900/40 px-1 rounded">instagram_poster/main.py</code>{' '}
                doit tourner sur ton Mac pour exécuter les posts. Lance{' '}
                <code className="text-amber-200 bg-amber-900/40 px-1 rounded">./instagram_poster/install.sh</code>{' '}
                pour l'installer en service automatique.
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-zinc-900/60 border border-white/[0.07] rounded-xl p-1 w-fit">
              {([
                { id: 'queue',    label: 'Queue posts', icon: Calendar },
                { id: 'gallery', label: 'Contenu',      icon: Send },
                { id: 'accounts', label: 'Comptes',      icon: User },
              ] as const).map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                    tab === t.id
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:text-white'
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
                          : 'bg-zinc-900/60 border-white/[0.07] text-zinc-400 hover:text-white'
                      }`}
                    >
                      {s === 'all' ? 'Tous' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                {loadingPosts ? (
                  <p className="text-sm text-zinc-500">Chargement...</p>
                ) : posts.length === 0 ? (
                  <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-8 text-center">
                    <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Aucun post planifié</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      Va dans l'onglet "Contenu" pour planifier depuis tes générations
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {posts.map(post => (
                      <div
                        key={post.id}
                        className="bg-zinc-900/60 border border-white/[0.07] rounded-xl p-4 flex items-start gap-4"
                      >
                        {/* Thumbnail */}
                        <div className="w-12 h-12 rounded-lg bg-zinc-800 shrink-0 overflow-hidden">
                          {post.driveFileUrl && !post.driveFileUrl.includes('.mp4') ? (
                            <img src={post.driveFileUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-600">
                              <Video className="w-5 h-5" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <StatusBadge status={post.status} />
                            <span className="text-xs text-zinc-400">@{post.account.username}</span>
                            <span className="text-xs text-zinc-600">{post.account.networkName}</span>
                          </div>
                          {post.caption && (
                            <p className="text-xs text-zinc-400 truncate mb-1">{post.caption}</p>
                          )}
                          {post.scheduledFor && (
                            <p className="text-xs text-zinc-500">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(post.scheduledFor).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          )}
                          {post.status === 'posted' && post.postedAt && (
                            <p className="text-xs text-emerald-400">
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Publié le {new Date(post.postedAt).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                              })}
                              {post.igPostId && ` — ID: ${post.igPostId}`}
                            </p>
                          )}
                          {post.status === 'failed' && post.errorMessage && (
                            <p className="text-xs text-red-400 truncate">
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
                              title="Réessayer"
                              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {(post.status === 'pending' || post.status === 'failed') && (
                            <button
                              onClick={() => cancelPost(post.id)}
                              title="Annuler"
                              className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400 transition"
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
                <p className="text-sm text-zinc-500">
                  30 dernières générations complètes. Clique sur "Planifier" pour envoyer sur Instagram.
                </p>
                {accounts.length === 0 && (
                  <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-3 text-sm text-amber-300">
                    Aucun compte Instagram configuré. Ajoute des comptes dans l'onglet "Comptes" d'abord.
                  </div>
                )}
                {loadingGens ? (
                  <p className="text-sm text-zinc-500">Chargement...</p>
                ) : generations.length === 0 ? (
                  <p className="text-sm text-zinc-500">Aucune génération récente avec URL Drive.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {generations.map(gen => {
                      const thumb = gen.driveGeneratedUrl || gen.generatedImageUrl
                      const hasDrive = !!gen.driveGeneratedUrl
                      return (
                        <div key={gen.id} className="bg-zinc-900/60 border border-white/[0.07] rounded-xl overflow-hidden group">
                          {/* Thumbnail */}
                          <div className="aspect-[9/16] bg-zinc-800 relative">
                            {thumb ? (
                              thumb.includes('.mp4') ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 text-xs gap-1">
                                  <Video className="w-6 h-6" />
                                  <span>{gen.modelUsed || 'video'}</span>
                                </div>
                              ) : (
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                              )
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center text-zinc-700 text-xs">
                                No preview
                              </div>
                            )}
                            {!hasDrive && (
                              <div className="absolute top-1 right-1 bg-amber-900/80 rounded px-1 py-0.5 text-amber-300 text-[10px]">
                                No Drive
                              </div>
                            )}
                            {hasDrive && (
                              <a
                                href={gen.driveGeneratedUrl!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 rounded p-1 transition"
                              >
                                <ExternalLink className="w-3 h-3 text-white" />
                              </a>
                            )}
                          </div>
                          {/* Info + action */}
                          <div className="p-2">
                            <p className="text-[11px] text-zinc-500 truncate mb-2">
                              {gen.modelUsed || 'unknown'}
                            </p>
                            <button
                              onClick={() => accounts.length > 0 && setScheduleGen(gen)}
                              disabled={accounts.length === 0}
                              className="w-full py-1.5 rounded-lg text-xs font-medium bg-violet-600/80 hover:bg-violet-600 text-white transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Planifier
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
                <div className="bg-zinc-900/60 border border-white/[0.07] rounded-xl p-4">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Guide warm-up</p>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[
                      { phase: 1, label: 'Semaine 1', desc: '1 post/jour', sub: 'Posts manuels conseillés' },
                      { phase: 2, label: 'Semaine 2', desc: '1 post/jour', sub: 'Premiers posts auto' },
                      { phase: 3, label: 'Semaine 3', desc: '2 posts/jour', sub: 'Montée en régime' },
                      { phase: 4, label: 'Actif', desc: '3 posts/jour', sub: 'Régime normal' },
                    ].map(g => (
                      <div key={g.phase} className="bg-zinc-800/50 rounded-lg p-2">
                        <div className="text-xs font-medium text-violet-400 mb-0.5">{g.label}</div>
                        <div className="text-sm font-bold text-white">{g.desc}</div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">{g.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {loadingAccounts ? (
                  <p className="text-sm text-zinc-500">Chargement...</p>
                ) : accounts.length === 0 ? (
                  <div className="bg-zinc-900/60 border border-white/[0.07] rounded-2xl p-8 text-center">
                    <User className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-500 text-sm">Aucun compte configuré</p>
                    <button
                      onClick={() => setShowAddAccount(true)}
                      className="mt-3 px-4 py-2 rounded-xl text-sm bg-violet-600 hover:bg-violet-500 text-white transition"
                    >
                      Ajouter le premier compte
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
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                {acc.networkName}
                              </span>
                              <span>{acc.postsToday} post{acc.postsToday !== 1 ? 's' : ''} aujourd'hui</span>
                              {acc.lastPostedAt && (
                                <span>Dernier: {new Date(acc.lastPostedAt).toLocaleDateString('fr-FR')}</span>
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
                              <strong>Vérification requise !</strong> Ouvre l'app Instagram sur l'iPhone{' '}
                              et valide la vérification SMS/email pour @{acc.username}.
                            </span>
                          </div>
                        )}
                        {acc.status === 'suspended' && (
                          <div className="mt-3 bg-orange-900/20 border border-orange-700/30 rounded-lg px-3 py-2 text-xs text-orange-400">
                            Compte suspendu temporairement (FeedbackRequired). Attendre 24h.
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
          onScheduled={loadPosts}
        />
      )}
    </div>
  )
}
