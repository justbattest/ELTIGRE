'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { TutorialVideo } from '@/components/TutorialVideo'
import { HiggsfieldConnect } from '@/components/setup/HiggsfieldConnect'
import { ReferenceElementsManager } from '@/components/setup/ReferenceElementsManager'
import { GoogleDriveConnect } from '@/components/setup/GoogleDriveConnect'

type RefElement = { id: string; name: string; type?: string }

type TestResults = {
  anthropic?: { ok: boolean; message: string }
  openai?: { ok: boolean; message: string }
  higgsfield?: { ok: boolean; message: string }
  drive?: { ok: boolean; message: string }
}

export default function SettingsPage() {
  const { data: session } = useSession()

  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [instagramSessionCookie, setInstagramSessionCookie] = useState('')
  const [defaultModel, setDefaultModel] = useState('auto')
  const [defaultAspectRatio, setDefaultAspectRatio] = useState('2:3')
  const [defaultQuality, setDefaultQuality] = useState('2k')
  // Mirrored from ReferenceElementsManager (which owns persistence) — used to render Character Prompt Rules below.
  const [referenceElements, setReferenceElements] = useState<RefElement[]>([])
  const [higgsConnected, setHiggsConnected] = useState(false)

  const [scrapingProxyUrl, setScrapingProxyUrl] = useState('')
  const [hikerApiKey, setHikerApiKey] = useState('')
  const [charRules, setCharRules] = useState<Record<string, string>>({})

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<TestResults | null>(null)

  // Charger les settings au montage
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setAnthropicKey(data.anthropicApiKey || '')
        setOpenaiApiKey(data.openaiApiKey || '')
        setInstagramSessionCookie(data.instagramSessionCookie || '')
        setDefaultModel(data.defaultModel || 'auto')
        setDefaultAspectRatio(data.defaultAspectRatio || '2:3')
        setDefaultQuality(data.defaultQuality || '2k')
        setScrapingProxyUrl(data.scrapingProxyUrl || '')
        setHikerApiKey(data.hikerApiKey || '')
        if (data.characterPromptRules) {
          try { setCharRules(JSON.parse(data.characterPromptRules)) } catch {}
        }
      })
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: anthropicKey,
          openaiApiKey,
          defaultModel,
          defaultAspectRatio,
          defaultQuality,
          referenceElements,
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

          {/* OpenAI (transcription audio — Prompt Lab From URL) */}
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
              platform.openai.com/api-keys — used for audio transcription (Whisper) in Prompt Lab &quot;From Video&quot;.
            </p>
            {openaiApiKey && !openaiApiKey.includes('...') && (
              <p className="text-green-600 text-xs mt-1.5">✓ OpenAI configured — audio transcription enabled</p>
            )}
          </div>

          {/* Higgsfield — Device Code Flow */}
          <HiggsfieldConnect onStatusChange={setHiggsConnected} />

          {/* Reference Elements */}
          <ReferenceElementsManager higgsConnected={higgsConnected} onChange={setReferenceElements} />

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
          <GoogleDriveConnect />

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
                { key: 'openai', label: 'OpenAI' },
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
