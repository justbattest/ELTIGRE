'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'

type RefElement = { id: string; name: string; type?: string }

type TestResults = {
  anthropic?: { ok: boolean; message: string }
  higgsfield?: { ok: boolean; message: string }
  kling?: { ok: boolean; message: string }
  drive?: { ok: boolean; message: string }
}

type HiggsAuthState = 'idle' | 'starting' | 'waiting' | 'approved' | 'error'

export default function SettingsPage() {
  const { data: session } = useSession()

  const [anthropicKey, setAnthropicKey] = useState('')
  const [instagramSessionCookie, setInstagramSessionCookie] = useState('')
  const [defaultModel, setDefaultModel] = useState('auto')
  const [defaultAspectRatio, setDefaultAspectRatio] = useState('2:3')
  const [defaultQuality, setDefaultQuality] = useState('2k')
  const [referenceElements, setReferenceElements] = useState<RefElement[]>([])
  const [newElementId, setNewElementId] = useState('')
  const [newElementName, setNewElementName] = useState('')
  const [newElementType, setNewElementType] = useState<'soul_2' | 'soul_cinematic'>('soul_2')

  const [klingAccessKey, setKlingAccessKey] = useState('')
  const [klingSecretKey, setKlingSecretKey] = useState('')

  const [higgsConnected, setHiggsConnected] = useState(false)
  const [higgsAuthState, setHiggsAuthState] = useState<HiggsAuthState>('idle')
  const [higgsDeviceUrl, setHiggsDeviceUrl] = useState('')
  const [higgsClerkToken, setHiggsClerkToken] = useState('')
  const [higgsClerkConnected, setHiggsClerkConnected] = useState(false)

  // Google Drive
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAuthState, setDriveAuthState] = useState<'idle' | 'starting' | 'waiting' | 'approved' | 'error'>('idle')
  const [driveError, setDriveError] = useState('')

  const [scrapingProxyUrl, setScrapingProxyUrl] = useState('')
  const [hikerApiKey, setHikerApiKey] = useState('')

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
        setInstagramSessionCookie(data.instagramSessionCookie || '')
        setDefaultModel(data.defaultModel || 'auto')
        setDefaultAspectRatio(data.defaultAspectRatio || '2:3')
        setDefaultQuality(data.defaultQuality || '2k')
        setReferenceElements(data.referenceElements || [])
        setKlingAccessKey(data.klingAccessKey || '')
        setKlingSecretKey(data.klingSecretKey || '')
        setHiggsConnected(data.higgsFieldConnected || false)
        setHiggsClerkToken(data.higgsFieldClerkToken || '')
        setHiggsClerkConnected(data.higgsFieldClerkConnected || false)
        setDriveConnected(data.driveConnected || false)
        setDriveFolderId(data.driveFolderId || '')
        setScrapingProxyUrl(data.scrapingProxyUrl || '')
        setHikerApiKey(data.hikerApiKey || '')
      })
  }, [])

  // Polling après device code flow
  const pollHiggsfield = useCallback(() => {
    const interval = setInterval(async () => {
      const res = await fetch('/api/higgsfield-auth/poll')
      const data = await res.json()
      if (data.status === 'approved') {
        clearInterval(interval)
        setHiggsAuthState('approved')
        setHiggsConnected(true)
      } else if (data.status === 'no_pending') {
        clearInterval(interval)
        setHiggsAuthState('idle')
      }
    }, 2000)
    return interval
  }, [])

  const startHiggsAuth = async () => {
    setHiggsAuthState('starting')
    setHiggsDeviceUrl('')
    try {
      const res = await fetch('/api/higgsfield-auth/start', { method: 'POST' })
      const data = await res.json()
      if (data.deviceUrl) {
        setHiggsDeviceUrl(data.deviceUrl)
        setHiggsAuthState('waiting')
        pollHiggsfield()
      } else {
        setHiggsAuthState('error')
      }
    } catch {
      setHiggsAuthState('error')
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
          klingAccessKey,
          klingSecretKey,
          higgsFieldClerkToken: higgsClerkToken,
          defaultModel,
          defaultAspectRatio,
          defaultQuality,
          referenceElements,
          driveFolderId,
          instagramSessionCookie,
          scrapingProxyUrl,
          hikerApiKey,
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
        setDriveError('Popup blocked by the browser — allow popups for localhost:3000')
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
      <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-gray-400 hover:text-white transition text-sm">← New Run</Link>
          <span className="text-gray-600">|</span>
          <Link href="/kpi" className="text-gray-400 hover:text-white transition text-sm">📊 KPI</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
          ⚙️ Settings
        </h1>

        <div className="space-y-6">
          {/* HikerAPI */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-1 text-gray-200">
              🔍 HikerAPI — Scraping Instagram
              <span className="ml-2 text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full font-normal">Recommended</span>
            </h2>
            <p className="text-gray-500 text-xs mb-3">
              Primary scraping method — residential proxies included, works on Railway without any extra setup. $0.0006/request (≈ $0.20/month).{' '}
              <a href="https://hikerapi.com/p/hsazcgym" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                hikerapi.com
              </a>
              {' '}→ Tokens → copy the Access Key.
            </p>
            <input
              type="password"
              value={hikerApiKey}
              onChange={(e) => setHikerApiKey(e.target.value)}
              placeholder="ih6q3k93xb2yiflq23dz3vuhg0sr65en"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            {hikerApiKey && !hikerApiKey.includes('...') && (
              <p className="text-green-500 text-xs mt-1.5">✓ HikerAPI configured — scraping via managed proxies</p>
            )}
          </div>

          {/* Anthropic */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-3 text-gray-200">Anthropic API Key</h2>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-api03-xxxxxxxxxxxxxxxxx"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            <p className="text-gray-500 text-xs mt-1.5">
              console.anthropic.com → API Keys
            </p>
          </div>

          {/* Kling AI API */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-1 text-gray-200">
              🎬 Kling AI API
              <span className="ml-2 text-xs bg-blue-900/40 text-blue-400 border border-blue-800 px-2 py-0.5 rounded-full font-normal">Motion Control</span>
            </h2>
            <p className="text-gray-500 text-xs mb-3">
              Required for Motion Control (Kling 3.0). Create a key at{' '}
              <a href="https://app.klingai.com/dev" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                app.klingai.com/dev
              </a>
              {' '}→ API Keys.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Access Key</label>
                <input
                  type="password"
                  value={klingAccessKey}
                  onChange={(e) => setKlingAccessKey(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxx"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Secret Key</label>
                <input
                  type="password"
                  value={klingSecretKey}
                  onChange={(e) => setKlingSecretKey(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
                />
              </div>
            </div>
          </div>

          {/* Higgsfield — Device Code Flow */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-3 text-gray-200">Higgsfield</h2>

            {higgsConnected && higgsAuthState !== 'waiting' ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <span>✅</span>
                  <span>Connected</span>
                </div>
                <button
                  onClick={startHiggsAuth}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  Reconnect
                </button>
              </div>
            ) : higgsAuthState === 'waiting' ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-400">⏳ Waiting for approval...</p>
                <a
                  href={higgsDeviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
                >
                  🔗 Authorize on Higgsfield
                </a>
                <p className="text-gray-500 text-xs break-all">{higgsDeviceUrl}</p>
              </div>
            ) : higgsAuthState === 'approved' ? (
              <div className="text-green-400 text-sm">✅ Higgsfield connected!</div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-400 text-sm">
                  Connect your Higgsfield account in one click — no token copying needed.
                </p>
                <button
                  onClick={startHiggsAuth}
                  disabled={higgsAuthState === 'starting'}
                  className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 transition"
                >
                  {higgsAuthState === 'starting' ? '⏳ Starting...' : '🔗 Connect Higgsfield'}
                </button>
                {higgsAuthState === 'error' && (
                  <p className="text-red-400 text-xs">Connection error. Try again.</p>
                )}
              </div>
            )}

            {/* Session Cookies (Motion Control) */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-300">
                  Session Cookies{' '}
                  <span className="text-xs bg-violet-900/40 text-violet-400 border border-violet-800 px-2 py-0.5 rounded-full font-normal">Motion Control</span>
                </label>
                {higgsClerkConnected && (
                  <span className="text-green-400 text-xs">✅ Cookies active</span>
                )}
              </div>
              <p className="text-gray-500 text-xs mb-2">
                Required for Kling Motion Control. Open <strong className="text-gray-400">higgsfield.ai</strong> → F12 → <strong className="text-gray-400">Network</strong> tab → filter by <code className="text-violet-400">clerk.higgsfield.ai</code> → click any GET request → <strong className="text-gray-400">Headers</strong> → Request Headers → <strong className="text-gray-400">Cookie</strong> → copy the <strong className="text-gray-400">entire value</strong> (contains <code className="text-violet-400">__client=...; __session=...; ...</code>). Valid ~7 days.
              </p>
              <input
                type="password"
                placeholder={higgsClerkConnected ? '•••••••• (cookies active, paste to replace)' : '__client=...; __client_uat=...; __session=... (full Cookie header from Network tab)'}
                value={higgsClerkToken}
                onChange={(e) => setHiggsClerkToken(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 font-mono"
              />
            </div>
          </div>

          {/* Reference Elements */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-medium text-gray-200">Reference Elements</h2>
              <button
                onClick={scanElements}
                disabled={scanning || !higgsConnected}
                title={!higgsConnected ? 'Connect Higgsfield first' : 'Auto-scan characters from Higgsfield'}
                className="text-xs bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition font-medium"
              >
                {scanning ? '⏳ Scanning...' : '🔍 Scan from Higgsfield'}
              </button>
            </div>
            <p className="text-gray-500 text-xs mb-1">
              🖼 <strong className="text-gray-400">Images (Nano Banana)</strong> — auto-detected via the Scan button.<br/>
              🎬 <strong className="text-gray-400">Videos (Seedance)</strong> — add manually: open <strong className="text-gray-400">app.higgsfield.ai → Elements → Characters</strong>, open DevTools (F12) → Network, click your character → copy the UUID from the request URL <code className="text-violet-400">/reference-elements/UUID-HERE</code>.
            </p>
            {scanError && (
              <p className="text-xs text-amber-400 mb-2">{scanError}</p>
            )}

            {/* Liste existante */}
            {referenceElements.length > 0 && (
              <div className="space-y-2 mb-3">
                {referenceElements.map((el) => (
                  <div
                    key={el.id}
                    className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">{el.name}</span>
                      {el.type === 'soul_2' && <span className="text-emerald-400 text-xs">🎬 Video</span>}
                      {el.type === 'soul_cinematic' && <span className="text-gray-500 text-xs">🖼 Image</span>}
                      <span className="text-gray-600 text-xs font-mono">{el.id.substring(0, 8)}…</span>
                    </div>
                    <button
                      onClick={() => removeElement(el.id)}
                      className="text-gray-600 hover:text-red-400 text-sm transition"
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
                className="flex-1 min-w-[120px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition text-sm"
              />
              <input
                type="text"
                value={newElementId}
                onChange={(e) => setNewElementId(e.target.value)}
                placeholder="UUID (ex: 0dbe364b-...)"
                className="flex-1 min-w-[180px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition text-sm font-mono"
              />
              <select
                value={newElementType}
                onChange={(e) => setNewElementType(e.target.value as 'soul_2' | 'soul_cinematic')}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
              >
                <option value="soul_2">🎬 Video (Seedance)</option>
                <option value="soul_cinematic">🖼 Image (Nano Banana)</option>
              </select>
              <button
                onClick={addElement}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-3 py-1.5 text-sm transition"
              >
                +
              </button>
            </div>
          </div>

          {/* Avancé */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-3 text-gray-200">Default settings</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Model</label>
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="auto">Auto (fallback)</option>
                  <option value="soul_cinematic">Soul Cinema</option>
                  <option value="seedream_v4_5">Seedream 4.5</option>
                  <option value="nano_banana_2">Nano Banana</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ratio</label>
                <select
                  value={defaultAspectRatio}
                  onChange={(e) => setDefaultAspectRatio(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2:3">2:3</option>
                  <option value="1:1">1:1</option>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quality</label>
                <select
                  value={defaultQuality}
                  onChange={(e) => setDefaultQuality(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-violet-500 transition"
                >
                  <option value="2k">2K</option>
                  <option value="4k">4K</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          {/* Google Drive */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-gray-200">
                🗂️ Google Drive
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${driveConnected ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                  {driveConnected ? '● Connected' : '○ Not connected'}
                </span>
              </h2>
            </div>
            <p className="text-gray-500 text-xs mb-4">
              Source images (Instagram) + generated images (Higgsfield) automatically uploaded to your Drive after each generation.
            </p>

            {/* Folder ID — toujours visible */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">
                Target Drive folder{' '}
                <span className="text-gray-600">(ID from the URL: drive.google.com/drive/folders/<strong>ID</strong>)</span>
              </label>
              <input
                type="text"
                value={driveFolderId}
                onChange={(e) => setDriveFolderId(e.target.value)}
                placeholder="1ABC...XYZ"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition text-sm"
              />
            </div>

            {/* Auth flow */}
            {driveConnected ? (
              <div className="flex items-center justify-between bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">✅</span>
                  <span className="text-green-300 text-sm">Google account connected</span>
                </div>
                <button
                  onClick={disconnectDrive}
                  className="text-xs text-gray-500 hover:text-red-400 transition"
                >
                  Disconnect
                </button>
              </div>
            ) : driveAuthState === 'waiting' ? (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-sm font-medium">Google window open…</p>
                  <p className="text-gray-500 text-xs mt-0.5">Sign in and accept the permissions in the popup.</p>
                </div>
              </div>
            ) : driveAuthState === 'approved' ? (
              <div className="bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
                <span className="text-green-400 text-sm">✅ Drive connected successfully!</span>
              </div>
            ) : driveAuthState === 'error' ? (
              <div className="space-y-2">
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  ❌ {driveError || 'Connection error'}
                </p>
                <button
                  onClick={startDriveAuth}
                  className="text-sm text-violet-400 hover:text-violet-300 transition"
                >
                  ↺ Try again
                </button>
              </div>
            ) : (
              <button
                onClick={startDriveAuth}
                disabled={driveAuthState === 'starting'}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm rounded-lg px-4 py-2.5 transition flex items-center justify-center gap-2"
              >
                <span>🗂️</span>
                {driveAuthState === 'starting' ? '⏳ Connecting...' : 'Connect Google Drive'}
              </button>
            )}
          </div>

          {/* Boutons action */}
          <div className="flex gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 transition"
            >
              {saving ? 'Saving...' : saved ? '✅ Saved' : '💾 Save'}
            </button>
            <button
              onClick={testConnections}
              disabled={testing}
              className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white font-medium rounded-lg py-2.5 transition"
            >
              {testing ? '⏳ Testing...' : '🔍 Test connections'}
            </button>
          </div>

          {/* Résultats tests */}
          {testResults && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              {([
                { key: 'anthropic', label: 'Anthropic' },
                { key: 'higgsfield', label: 'Higgsfield' },
                { key: 'kling', label: 'Kling AI' },
                { key: 'drive', label: 'Google Drive' },
              ] as { key: keyof TestResults; label: string }[]).map(({ key, label }) => {
                const r = testResults[key]
                if (!r) return null
                return (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span>{r.ok ? '✅' : '❌'}</span>
                    <span className="text-gray-400">{label}</span>
                    <span className="text-gray-500">—</span>
                    <span className={r.ok ? 'text-green-400' : 'text-red-400'}>{r.message}</span>
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
