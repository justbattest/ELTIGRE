'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { TutorialVideo } from '@/components/TutorialVideo'

type RefElement = { id: string; name: string; type?: string }

type TestResults = {
  anthropic?: { ok: boolean; message: string }
  higgsfield?: { ok: boolean; message: string }
  drive?: { ok: boolean; message: string }
}

type HiggsAuthState = 'idle' | 'starting' | 'waiting' | 'approved' | 'error'

export default function SettingsPage() {
  const { data: session } = useSession()

  const [anthropicKey, setAnthropicKey] = useState('')
  const [groqApiKey, setGroqApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [instagramSessionCookie, setInstagramSessionCookie] = useState('')
  const [defaultModel, setDefaultModel] = useState('auto')
  const [defaultAspectRatio, setDefaultAspectRatio] = useState('2:3')
  const [defaultQuality, setDefaultQuality] = useState('2k')
  const [referenceElements, setReferenceElements] = useState<RefElement[]>([])
  const [newElementId, setNewElementId] = useState('')
  const [newElementName, setNewElementName] = useState('')
  const [newElementType, setNewElementType] = useState<'soul_2' | 'soul_cinematic'>('soul_2')

  const [higgsConnected, setHiggsConnected] = useState(false)
  const [higgsAuthState, setHiggsAuthState] = useState<HiggsAuthState>('idle')
  const [higgsDeviceUrl, setHiggsDeviceUrl] = useState('')
  const [higgsError, setHiggsError] = useState('')
  const higgsPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Google Drive
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAuthState, setDriveAuthState] = useState<'idle' | 'starting' | 'waiting' | 'approved' | 'error'>('idle')
  const [driveError, setDriveError] = useState('')

  const [scrapingProxyUrl, setScrapingProxyUrl] = useState('')
  const [hikerApiKey, setHikerApiKey] = useState('')
  const [charRules, setCharRules] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  // Charger les settings au montage
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setAnthropicKey(data.anthropicApiKey || '')
        setGroqApiKey(data.groqApiKey || '')
        setOpenaiApiKey(data.openaiApiKey || '')
        setInstagramSessionCookie(data.instagramSessionCookie || '')
        setDefaultModel(data.defaultModel || 'auto')
        setDefaultAspectRatio(data.defaultAspectRatio || '2:3')
        setDefaultQuality(data.defaultQuality || '2k')
        setReferenceElements(data.referenceElements || [])
        setHiggsConnected(data.higgsFieldConnected || false)
        setDriveConnected(data.driveConnected || false)
        setDriveFolderId(data.driveFolderId || '')
        setScrapingProxyUrl(data.scrapingProxyUrl || '')
        setHikerApiKey(data.hikerApiKey || '')
        if (data.characterPromptRules) {
          try { setCharRules(JSON.parse(data.characterPromptRules)) } catch {}
        }
      })
  }, [])

  // Override DB boolean with actual CLI-validated status
  useEffect(() => {
    fetch('/api/higgsfield-auth/status')
      .then(r => r.json())
      .then(data => {
        setHiggsConnected(data.valid)
        if (data.refreshed) {
          console.log('Higgsfield token auto-refreshed')
        }
      })
      .catch(() => {})
  }, [])

  // Polling après device code flow
  const pollHiggsfield = useCallback(() => {
    if (higgsPollRef.current) clearInterval(higgsPollRef.current)
    higgsPollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/higgsfield-auth/poll')
        const data = await res.json()
        if (data.status === 'approved') {
          if (higgsPollRef.current) clearInterval(higgsPollRef.current)
          setHiggsAuthState('approved')
          setHiggsConnected(true)
        } else if (data.status === 'no_pending') {
          if (higgsPollRef.current) clearInterval(higgsPollRef.current)
          setHiggsAuthState('error')
          setHiggsError('Session expired before approval — click Reconnect to try again.')
        }
      } catch {
        // ignore transient poll errors, keep retrying until no_pending/approved
      }
    }, 2000)
  }, [])

  // Nettoyage du polling au démontage
  useEffect(() => {
    return () => { if (higgsPollRef.current) clearInterval(higgsPollRef.current) }
  }, [])

  const startHiggsAuth = async () => {
    setHiggsAuthState('starting')
    setHiggsDeviceUrl('')
    setHiggsError('')
    try {
      const res = await fetch('/api/higgsfield-auth/start', { method: 'POST' })
      const data = await res.json()
      if (data.deviceUrl) {
        setHiggsDeviceUrl(data.deviceUrl)
        setHiggsAuthState('waiting')
        pollHiggsfield()
      } else {
        setHiggsAuthState('error')
        setHiggsError(data.error || 'Unknown error starting Higgsfield connection.')
      }
    } catch (e) {
      setHiggsAuthState('error')
      setHiggsError(String(e))
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicKey,
          groqApiKey,
          openaiApiKey,
          defaultModel,
          defaultAspectRatio,
          defaultQuality,
          referenceElements,
          driveFolderId,
          instagramSessionCookie,
          scrapingProxyUrl,
          hikerApiKey,
          characterPromptRules: JSON.stringify(charRules),
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const testConnections = async () => {
    setTesting(true)
    setTestResults(null)
    try {
      const res = await fetch('/api/settings/test')
      const data = await res.json()
      setTestResults(data)
    } finally {
      setTesting(false)
    }
  }

  const startDriveAuth = async () => {
    setDriveAuthState('starting')
    setDriveError('')
    try {
      const res = await fetch('/api/google-auth/start', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setDriveError(data.error)
        setDriveAuthState('error')
        return
      }

      // Ouvrir la popup OAuth Google
      const popup = window.open(
        data.authUrl,
        'google-drive-auth',
        'width=520,height=640,left=200,top=100'
      )

      if (!popup) {
        setDriveError('Popup blocked by the browser — allow popups for modelify.ai')
        setDriveAuthState('error')
        return
      }

      setDriveAuthState('waiting')

      // Écouter le postMessage de la popup (callback success)
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'google-drive-connected') {
          window.removeEventListener('message', messageHandler)
          clearInterval(closedCheck)
          setDriveAuthState('approved')
          setDriveConnected(true)
        }
      }
      window.addEventListener('message', messageHandler)

      // Détecter si l'user ferme la popup sans finir
      const closedCheck = setInterval(() => {
        if (popup.closed) {
          clearInterval(closedCheck)
          window.removeEventListener('message', messageHandler)
          setDriveAuthState(prev => prev === 'waiting' ? 'idle' : prev)
        }
      }, 1000)

    } catch {
      setDriveError('Unexpected network error')
      setDriveAuthState('error')
    }
  }

  const disconnectDrive = async () => {
    await fetch('/api/google-auth/poll', { method: 'DELETE' })
    setDriveConnected(false)
    setDriveAuthState('idle')
  }

  const addElement = () => {
    if (!newElementId.trim() || !newElementName.trim()) return
    setReferenceElements([
      ...referenceElements,
      { id: newElementId.trim(), name: newElementName.trim(), type: newElementType },
    ])
    setNewElementId('')
    setNewElementName('')
  }

  const removeElement = (id: string) => {
    setReferenceElements(referenceElements.filter((e) => e.id !== id))
  }

  const scanElements = async () => {
    setScanning(true)
    setScanError('')
    try {
      const res = await fetch('/api/characters/scan-elements')
      const data = await res.json()
      if (!res.ok || data.error) {
        setScanError(data.error || 'Scan error')
        return
      }
      const scanned: RefElement[] = (data.elements || []).map((e: { id: string; name: string }) => ({
        id: e.id,
        name: e.name,
      }))
      // Fusionner avec les existants sans doublon
      const existingIds = new Set(referenceElements.map(e => e.id))
      const newOnes = scanned.filter(e => !existingIds.has(e.id))
      setReferenceElements([...referenceElements, ...newOnes])
      if (newOnes.length === 0 && scanned.length > 0) {
        setScanError(`${scanned.length} character(s) found — all already added.`)
      }
    } catch (e) {
      setScanError(String(e))
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-white/70 bg-white/85 backdrop-blur-xl shadow-[0_1px_12px_rgba(109,40,217,0.08)] px-6 py-3 flex items-center justify-between z-20 sticky top-0">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-gray-700 hover:text-gray-900 transition text-sm">← New Run</Link>
          <span className="text-slate-300">|</span>
          <Link href="/kpi" className="text-gray-700 hover:text-gray-900 transition text-sm">📊 KPI</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-800 text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-800 hover:text-gray-900 text-sm transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900">
          ⚙️ Settings
        </h1>
        <TutorialVideo videoId="1dv8371-Hhg" title="Settings" />

        <div className="space-y-6">
          {/* HikerAPI — maintenance */}
          <div className="relative">
            <div className="absolute inset-0 bg-white/85 backdrop-blur-sm rounded-xl z-10 flex items-center justify-center gap-2 cursor-not-allowed">
              <span className="text-amber-400">🚧</span>
              <span className="text-amber-300 text-sm font-medium">Under maintenance</span>
            </div>
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-1 text-gray-900">
              🔍 HikerAPI — Scraping Instagram
              <span className="ml-2 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-normal">Recommended</span>
            </h2>
            <p className="text-gray-800 text-xs mb-3">
              Primary scraping method — residential proxies included, works on Railway without any extra setup. $0.0006/request (≈ $0.20/month).{' '}
              <a href="https://hikerapi.com/p/hsazcgym" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-700 underline">
                hikerapi.com
              </a>
              {' '}→ Tokens → copy the Access Key.
            </p>
            <input
              type="password"
              value={hikerApiKey}
              onChange={(e) => setHikerApiKey(e.target.value)}
              placeholder="ih6q3k93xb2yiflq23dz3vuhg0sr65en"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            {hikerApiKey && !hikerApiKey.includes('...') && (
              <p className="text-green-600 text-xs mt-1.5">✓ HikerAPI configured — scraping via managed proxies</p>
            )}
          </div>
          </div>{/* end maintenance wrapper */}

          {/* Anthropic */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-3 text-gray-900">Anthropic API Key</h2>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-api03-xxxxxxxxxxxxxxxxx"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            <p className="text-gray-800 text-xs mt-1.5">
              console.anthropic.com → API Keys
            </p>
          </div>

          {/* Groq (transcription audio — Prompt Lab From URL) */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-3 text-gray-900">Groq API Key</h2>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => setGroqApiKey(e.target.value)}
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            <p className="text-gray-800 text-xs mt-1.5">
              console.groq.com/keys — used for audio transcription in Prompt Lab &quot;From URL&quot; (Whisper large-v3, very cheap)
            </p>
            {groqApiKey && !groqApiKey.includes('...') && (
              <p className="text-green-600 text-xs mt-1.5">✓ Groq configured — audio transcription enabled</p>
            )}
          </div>

          {/* OpenAI (fallback transcription — si Groq inaccessible depuis ton réseau/pays) */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-3 text-gray-900">OpenAI API Key</h2>
            <input
              type="password"
              value={openaiApiKey}
              onChange={(e) => setOpenaiApiKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            <p className="text-gray-800 text-xs mt-1.5">
              platform.openai.com/api-keys — fallback used for audio transcription if Groq is unavailable (blocked in some regions). Used automatically if configured, whether or not Groq is also set.
            </p>
            {openaiApiKey && !openaiApiKey.includes('...') && (
              <p className="text-green-600 text-xs mt-1.5">✓ OpenAI configured — audio transcription enabled</p>
            )}
          </div>

          {/* Higgsfield — Device Code Flow */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-3 text-gray-900">Higgsfield</h2>

            {higgsAuthState === 'waiting' ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-600">⏳ Waiting for approval...</p>
                <a
                  href={higgsDeviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
                >
                  🔗 Authorize on Higgsfield
                </a>
                <p className="text-gray-800 text-xs break-all">{higgsDeviceUrl}</p>
              </div>
            ) : higgsAuthState === 'approved' ? (
              <div className="text-green-400 text-sm">✅ Higgsfield connected!</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  {higgsConnected ? (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <span>✅</span>
                      <span>Connected</span>
                    </div>
                  ) : (
                    <p className="text-gray-700 text-sm">
                      Connect your Higgsfield account in one click — no token copying needed.
                    </p>
                  )}
                  <button
                    onClick={startHiggsAuth}
                    disabled={higgsAuthState === 'starting'}
                    className={higgsConnected
                      ? 'text-xs bg-gradient-to-br from-violet-600 to-violet-700 text-white px-3 py-1.5 rounded-lg shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)] disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap'
                      : 'bg-white hover:bg-white/60 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 text-gray-900 text-sm rounded-lg px-4 py-2 transition shadow-sm whitespace-nowrap'
                    }
                  >
                    {higgsAuthState === 'starting'
                      ? '⏳ Starting...'
                      : higgsConnected ? 'Reconnect' : '🔗 Connect Higgsfield'}
                  </button>
                </div>
                {higgsAuthState === 'error' && (
                  <p className="text-red-600 text-xs">{higgsError || 'Connection error. Try again.'}</p>
                )}
              </div>
            )}

          </div>

          {/* Reference Elements */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-medium text-gray-900">Reference Elements</h2>
              <button
                onClick={scanElements}
                disabled={scanning || !higgsConnected}
                title={!higgsConnected ? 'Connect Higgsfield first' : 'Auto-scan characters from Higgsfield'}
                className="text-xs bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition font-medium"
              >
                {scanning ? '⏳ Scanning...' : '🔍 Scan from Higgsfield'}
              </button>
            </div>
            <p className="text-gray-800 text-xs mb-1">
              🖼 <strong className="text-gray-800">Images (Nano Banana)</strong> — auto-detected via the Scan button.<br/>
              🎬 <strong className="text-gray-800">Videos (Seedance)</strong> — add manually: open <strong className="text-gray-800">app.higgsfield.ai → Elements → Characters</strong>, open DevTools (F12) → Network, click your character → copy the UUID from the request URL <code className="text-violet-600">/reference-elements/UUID-HERE</code>.
            </p>
            {scanError && (
              <p className="text-xs text-amber-600 mb-2">{scanError}</p>
            )}

            {/* Liste existante */}
            {referenceElements.length > 0 && (
              <div className="space-y-2 mb-3">
                {referenceElements.map((el) => (
                  <div
                    key={el.id}
                    className="flex items-center justify-between bg-white/80 border border-gray-200 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-900 text-sm font-medium">{el.name}</span>
                      {el.type === 'soul_2' && <span className="text-emerald-600 text-xs">🎬 Video</span>}
                      {el.type === 'soul_cinematic' && <span className="text-gray-800 text-xs">🖼 Image</span>}
                      <span className="text-gray-800 text-xs font-mono">{el.id.substring(0, 8)}…</span>
                    </div>
                    <button
                      onClick={() => removeElement(el.id)}
                      className="text-gray-800 hover:text-red-500 text-sm transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Ajouter un élément */}
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={newElementName}
                onChange={(e) => setNewElementName(e.target.value)}
                placeholder="Name (e.g. NINA HYBRID)"
                className="flex-1 min-w-[120px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm"
              />
              <input
                type="text"
                value={newElementId}
                onChange={(e) => setNewElementId(e.target.value)}
                placeholder="UUID (ex: 0dbe364b-...)"
                className="flex-1 min-w-[180px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm font-mono"
              />
              <select
                value={newElementType}
                onChange={(e) => setNewElementType(e.target.value as 'soul_2' | 'soul_cinematic')}
                className="bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 transition"
              >
                <option value="soul_2">🎬 Video (Seedance)</option>
                <option value="soul_cinematic">🖼 Image (Nano Banana)</option>
              </select>
              <button
                onClick={addElement}
                className="bg-white/80 hover:bg-gray-200 text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 text-sm transition"
              >
                +
              </button>
            </div>
          </div>

          {/* Avancé */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <h2 className="font-medium mb-3 text-gray-900">Default settings</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-800 mb-1">Model</label>
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="auto">Auto (fallback)</option>
                  <option value="soul_cinematic">Soul Cinema</option>
                  <option value="seedream_v4_5">Seedream 4.5</option>
                  <option value="nano_banana_2">Nano Banana</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-800 mb-1">Ratio</label>
                <select
                  value={defaultAspectRatio}
                  onChange={(e) => setDefaultAspectRatio(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2:3">2:3</option>
                  <option value="1:1">1:1</option>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-800 mb-1">Quality</label>
                <select
                  value={defaultQuality}
                  onChange={(e) => setDefaultQuality(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2k">2K</option>
                  <option value="4k">4K</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Google Drive */}
          <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-gray-900">
                🗂️ Google Drive
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${driveConnected ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-white/80 text-gray-800 border border-gray-200'}`}>
                  {driveConnected ? '● Connected' : '○ Not connected'}
                </span>
              </h2>
            </div>
            <p className="text-gray-800 text-xs mb-4">
              Source images (Instagram) + generated images (Higgsfield) automatically uploaded to your Drive after each generation.
            </p>

            {/* Folder ID — toujours visible */}
            <div className="mb-4">
              <label className="block text-xs text-gray-800 mb-1">
                Target Drive folder{' '}
                <span className="text-gray-800">(ID from the URL: drive.google.com/drive/folders/<strong>ID</strong>)</span>
              </label>
              <input
                type="text"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="1ABC...XYZ"
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm"
              />
            </div>

            {/* Auth flow */}
            {driveConnected ? (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-600">✅</span>
                  <span className="text-green-700 text-sm">Google account connected</span>
                </div>
                <button
                  onClick={disconnectDrive}
                  className="text-xs text-gray-800 hover:text-red-500 transition"
                >
                  Disconnect
                </button>
              </div>
            ) : driveAuthState === 'waiting' ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full flex-shrink-0" />
                <div>
                  <p className="text-blue-700 text-sm font-medium">Google window open…</p>
                  <p className="text-gray-800 text-xs mt-0.5">Sign in and accept the permissions in the popup.</p>
                </div>
              </div>
            ) : driveAuthState === 'approved' ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <span className="text-green-700 text-sm">✅ Drive connected successfully!</span>
              </div>
            ) : driveAuthState === 'error' ? (
              <div className="space-y-2">
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ❌ {driveError || 'Connection error'}
                </p>
                <button
                  onClick={startDriveAuth}
                  className="text-sm text-violet-600 hover:text-violet-700 transition"
                >
                  ↺ Try again
                </button>
              </div>
            ) : (
              <button
                onClick={startDriveAuth}
                disabled={driveAuthState === 'starting'}
                className="w-full bg-white hover:bg-white/60 disabled:opacity-50 border border-gray-300 text-gray-900 text-sm rounded-lg px-4 py-2.5 transition flex items-center justify-center gap-2 shadow-sm"
              >
                <span>🗂️</span>
                {driveAuthState === 'starting' ? '⏳ Connecting...' : 'Connect Google Drive'}
              </button>
            )}
          </div>

          {/* Character Prompt Rules */}
          <div className="bg-white/75 backdrop-blur-xl rounded-2xl p-5 border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)]">
            <h2 className="font-medium mb-1 text-gray-900">Character Prompt Rules</h2>
            <p className="text-gray-800 text-xs mb-4">
              Define physical traits and outfit rules per character. These are injected into Claude prompts when generating with Prompt Studio.
            </p>
            {referenceElements.length === 0 ? (
              <p className="text-gray-500 text-xs italic">No reference elements configured — add characters in the Reference Elements section above.</p>
            ) : (
              <div className="space-y-3">
                {referenceElements.map((el) => (
                  <div key={el.id}>
                    <label className="block text-sm font-medium text-gray-800 mb-1">{el.name}</label>
                    <textarea
                      rows={3}
                      value={charRules[el.name] || ''}
                      onChange={(e) => setCharRules(prev => ({ ...prev, [el.name]: e.target.value }))}
                      placeholder="e.g. Always show muscular arms, no long sleeves that hide muscles, large breasts visible..."
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition text-sm resize-y"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Boutons action */}
          <div className="flex gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex-1 bg-gradient-to-br from-violet-600 to-violet-700 hover:from-violet-500 hover:to-violet-600 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 transition shadow-[0_4px_15px_rgba(109,40,217,0.40)] hover:shadow-[0_6px_20px_rgba(109,40,217,0.50)]"
            >
              {saving ? 'Saving...' : saved ? '✅ Saved' : '💾 Save'}
            </button>
            <button
              onClick={testConnections}
              disabled={testing}
              className="flex-1 bg-white hover:bg-white/60 disabled:opacity-50 border border-gray-300 text-gray-900 font-medium rounded-lg py-2.5 transition shadow-sm"
            >
              {testing ? '⏳ Testing...' : '🔍 Test connections'}
            </button>
          </div>

          {/* Résultats tests */}
          {testResults && (
            <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-4 space-y-2">
              {([
                { key: 'anthropic', label: 'Anthropic' },
                { key: 'higgsfield', label: 'Higgsfield' },
                { key: 'drive', label: 'Google Drive' },
              ] as { key: keyof TestResults; label: string }[]).map(({ key, label }) => {
                const r = testResults[key]
                if (!r) return null
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span>{r.ok ? '✅' : '❌'}</span>
                    <span className="text-gray-700">{label}</span>
                    <span className="text-gray-800">—</span>
                    <span className={r.ok ? 'text-green-700' : 'text-red-600'}>{r.message}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
