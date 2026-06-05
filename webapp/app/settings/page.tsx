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

  // Google Drive
  const [driveFolderId, setDriveFolderId] = useState('')
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAuthState, setDriveAuthState] = useState<'idle' | 'starting' | 'waiting' | 'approved' | 'error'>('idle')
  const [driveError, setDriveError] = useState('')

  const [scrapingProxyUrl, setScrapingProxyUrl] = useState('')

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
        setDriveConnected(data.driveConnected || false)
        setDriveFolderId(data.driveFolderId || '')
        setScrapingProxyUrl(data.scrapingProxyUrl || '')
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
          defaultModel,
          defaultAspectRatio,
          defaultQuality,
          referenceElements,
          driveFolderId,
          instagramSessionCookie,
          scrapingProxyUrl,
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
        setDriveError('Popup bloquée par le navigateur — autorise les popups pour localhost:3000')
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
      setDriveError('Erreur réseau inattendue')
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
        setScanError(data.error || 'Erreur lors du scan')
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
        setScanError(`${scanned.length} personnage(s) trouvé(s) — déjà tous présents.`)
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
          <Link href="/" className="text-gray-400 hover:text-white transition text-sm">← Nouveau Run</Link>
          <span className="text-gray-600">|</span>
          <Link href="/kpi" className="text-gray-400 hover:text-white transition text-sm">📊 KPI</Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-6 flex items-center gap-2">
          ⚙️ Paramètres
        </h1>

        <div className="space-y-6">
          {/* Instagram Session Cookie */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-1 text-gray-200">
              🔐 Cookie Session Instagram
              <span className="ml-2 text-xs bg-amber-900/40 text-amber-400 border border-amber-800 px-2 py-0.5 rounded-full font-normal">Optionnel — pour profils bloqués</span>
            </h2>
            <p className="text-gray-500 text-xs mb-3">
              Permet de scraper <strong className="text-gray-300">tous les profils publics</strong> y compris les comptes restreints par Instagram.
              Sans ce cookie, certains profils retournent BLOCKED.
            </p>
            <input
              type="password"
              value={instagramSessionCookie}
              onChange={(e) => setInstagramSessionCookie(e.target.value)}
              placeholder="IGQWRPxxxxxxxxxxxxxxx... (valeur du cookie sessionid)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            <div className="mt-2 text-gray-500 text-xs space-y-0.5">
              <p>Comment récupérer : ouvre Instagram dans Chrome → F12 → Application → Cookies → instagram.com</p>
              <p>→ Copie la <strong className="text-gray-400">valeur</strong> du cookie <code className="bg-gray-800 px-1 rounded">sessionid</code></p>
            </div>
          </div>

          {/* Proxy scraping */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="font-medium mb-1 text-gray-200">
              🌐 Proxy pour le scraping
              <span className="ml-2 text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full font-normal">Optionnel — gratuit sur webshare.io</span>
            </h2>
            <p className="text-gray-500 text-xs mb-3">
              Si Instagram bloque le serveur (erreur "Exceeded 30 redirects"), configure un proxy résidentiel.{' '}
              <a
                href="https://webshare.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 hover:text-violet-300 underline"
              >
                webshare.io
              </a>
              {' '}offre 1 proxy gratuit (1 GB/mois) — s'inscrire → Proxies → Free Proxies → copier le lien.
            </p>
            <input
              type="text"
              value={scrapingProxyUrl}
              onChange={(e) => setScrapingProxyUrl(e.target.value)}
              placeholder="http://username:password@p.webshare.io:80"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
            />
            {scrapingProxyUrl && (
              <p className="text-green-500 text-xs mt-1.5">✓ Proxy configuré — le scraping utilisera cette IP</p>
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
              Requis pour Motion Control (Kling 3.0). Crée une clé sur{' '}
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
                  <span>Connecté</span>
                </div>
                <button
                  onClick={startHiggsAuth}
                  className="text-xs text-gray-500 hover:text-gray-300 transition"
                >
                  Reconnecter
                </button>
              </div>
            ) : higgsAuthState === 'waiting' ? (
              <div className="space-y-3">
                <p className="text-sm text-amber-400">⏳ En attente d'approbation...</p>
                <a
                  href={higgsDeviceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
                >
                  🔗 Autoriser sur Higgsfield
                </a>
                <p className="text-gray-500 text-xs break-all">{higgsDeviceUrl}</p>
              </div>
            ) : higgsAuthState === 'approved' ? (
              <div className="text-green-400 text-sm">✅ Higgsfield connecté !</div>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-400 text-sm">
                  Connectez votre compte Higgsfield en 1 clic — aucun token à copier.
                </p>
                <button
                  onClick={startHiggsAuth}
                  disabled={higgsAuthState === 'starting'}
                  className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 transition"
                >
                  {higgsAuthState === 'starting' ? '⏳ Démarrage...' : '🔗 Connecter Higgsfield'}
                </button>
                {higgsAuthState === 'error' && (
                  <p className="text-red-400 text-xs">Erreur lors de la connexion. Réessayez.</p>
                )}
              </div>
            )}
          </div>

          {/* Reference Elements */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-medium text-gray-200">Reference Elements</h2>
              <button
                onClick={scanElements}
                disabled={scanning || !higgsConnected}
                title={!higgsConnected ? 'Connecter Higgsfield d\'abord' : 'Scanner automatiquement les personnages depuis Higgsfield'}
                className="text-xs bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition font-medium"
              >
                {scanning ? '⏳ Scan...' : '🔍 Scanner depuis Higgsfield'}
              </button>
            </div>
            <p className="text-gray-500 text-xs mb-1">
              🖼 <strong className="text-gray-400">Images (Nano Banana)</strong> — détectés automatiquement par le bouton Scanner.<br/>
              🎬 <strong className="text-gray-400">Vidéos (Seedance)</strong> — à ajouter manuellement : ouvre <strong className="text-gray-400">app.higgsfield.ai → Elements → Characters</strong>, active DevTools (F12) → Network, clique ton personnage → copie l&apos;UUID dans l&apos;URL de la requête <code className="text-violet-400">/reference-elements/UUID-ICI</code>.
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
                      {el.type === 'soul_2' && <span className="text-emerald-400 text-xs">🎬 Vidéo</span>}
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
                placeholder="Nom (ex: NINA HYBRID)"
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
                <option value="soul_2">🎬 Vidéo (Seedance)</option>
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
            <h2 className="font-medium mb-3 text-gray-200">Paramètres par défaut</h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Modèle</label>
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
                <label className="block text-xs text-gray-500 mb-1">Format</label>
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
                <label className="block text-xs text-gray-500 mb-1">Qualité</label>
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
                  {driveConnected ? '● Connecté' : '○ Non connecté'}
                </span>
              </h2>
            </div>
            <p className="text-gray-500 text-xs mb-4">
              Images source (Instagram) + générées (Higgsfield) uploadées automatiquement dans votre Drive après chaque génération.
            </p>

            {/* Folder ID — toujours visible */}
            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">
                Dossier Drive cible{' '}
                <span className="text-gray-600">(ID dans l&apos;URL : drive.google.com/drive/folders/<strong>ID</strong>)</span>
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
                  <span className="text-green-300 text-sm">Compte Google connecté</span>
                </div>
                <button
                  onClick={disconnectDrive}
                  className="text-xs text-gray-500 hover:text-red-400 transition"
                >
                  Déconnecter
                </button>
              </div>
            ) : driveAuthState === 'waiting' ? (
              <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-4 py-3 flex items-center gap-3">
                <div className="animate-spin w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-sm font-medium">Fenêtre Google ouverte…</p>
                  <p className="text-gray-500 text-xs mt-0.5">Connecte-toi et accepte les permissions dans la popup.</p>
                </div>
              </div>
            ) : driveAuthState === 'approved' ? (
              <div className="bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
                <span className="text-green-400 text-sm">✅ Drive connecté avec succès !</span>
              </div>
            ) : driveAuthState === 'error' ? (
              <div className="space-y-2">
                <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                  ❌ {driveError || 'Erreur de connexion'}
                </p>
                <button
                  onClick={startDriveAuth}
                  className="text-sm text-violet-400 hover:text-violet-300 transition"
                >
                  ↺ Réessayer
                </button>
              </div>
            ) : (
              <button
                onClick={startDriveAuth}
                disabled={driveAuthState === 'starting'}
                className="w-full bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white text-sm rounded-lg px-4 py-2.5 transition flex items-center justify-center gap-2"
              >
                <span>🗂️</span>
                {driveAuthState === 'starting' ? '⏳ Connexion...' : 'Connecter Google Drive'}
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
              {saving ? 'Sauvegarde...' : saved ? '✅ Sauvegardé' : '💾 Sauvegarder'}
            </button>
            <button
              onClick={testConnections}
              disabled={testing}
              className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-white font-medium rounded-lg py-2.5 transition"
            >
              {testing ? '⏳ Test...' : '🔍 Tester les connexions'}
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
