'use client'

import React, { useCallback, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { compressImage } from '@/lib/compress-image'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'

// ── Types ─────────────────────────────────────────────────────────────────────

type FileEntry = {
  file: File
  preview: string | null  // objectURL pour images, null pour vidéos
  isVideo: boolean
}

type VariationResult = {
  file: string
  variation: number
  outputPath: string
  tiersApplied: string[]
}

type Level = 'aggressive'

// ── Constantes ────────────────────────────────────────────────────────────────

const UPLOAD_CHUNK_SIZE = 3
const UPLOAD_MAX_RETRIES = 2

const TIER_LABELS: Record<string, string> = {
  tier1: 'Geometry',
  tier2: 'Color & texture',
  tier3: 'AI protection',
  tier4: 'Video variations',
  metadata: 'Metadata',
}

// ── Helper SSE ────────────────────────────────────────────────────────────────

type SSEHandlers = {
  onStart?: (total: number, level: string) => void
  onProgress?: (current: number, total: number) => void
  onVariation?: (r: VariationResult) => void
  onInfo?: (msg: string) => void
  onWarn?: (msg: string) => void
}

function waitForRun(runId: string, handlers: SSEHandlers, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/spoofer/events/${runId}`)
    const cleanup = () => es.close()
    signal.addEventListener('abort', () => { cleanup(); reject(new Error('Cancelled')) }, { once: true })

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data)
        switch (ev.type) {
          case 'start':
            handlers.onStart?.(ev.total_variations ?? 0, ev.level ?? '')
            break
          case 'progress':
            handlers.onProgress?.(ev.current ?? 0, ev.total ?? 0)
            break
          case 'variation_done':
            handlers.onVariation?.({
              file: ev.file,
              variation: ev.variation,
              outputPath: ev.output_path,
              tiersApplied: ev.tiers_applied || [],
            })
            break
          case 'info':
            handlers.onInfo?.(ev.msg || '')
            break
          case 'stderr':
            handlers.onWarn?.(ev.msg || '')
            break
          case 'done':
            cleanup(); resolve()
            break
          case 'error':
            cleanup(); reject(new Error(ev.message || ev.error || 'Python error'))
            break
        }
      } catch { /* ignore malformed */ }
    }
    es.onerror = () => { cleanup(); reject(new Error('SSE lost (server restarted?)')) }
  })
}

// ── Composants guide d'installation ──────────────────────────────────────────

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(children.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }
  return (
    <div className="relative group">
      <pre className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-700 font-mono overflow-x-auto whitespace-pre-wrap">
        {children.trim()}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 px-2 py-1 rounded text-[10px] bg-white border border-slate-200 text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-900 transition"
      >
        {copied ? '✅ Copied' : '📋 Copy'}
      </button>
    </div>
  )
}

function SetupSection({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-7 h-7 rounded-full bg-violet-50 border border-violet-300 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {step}
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ── Composant ─────────────────────────────────────────────────────────────────

export default function SpooferPage() {
  useSession()

  const [entries,  setEntries]  = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [error,    setError]    = useState('')

  const level: Level = 'aggressive'
  const [variations, setVariations] = useState(5)
  const [noMirror,   setNoMirror]   = useState(false)

  // idle → compressing → uploading → processing → done
  const [phase,        setPhase]        = useState<'idle' | 'compressing' | 'uploading' | 'processing' | 'done'>('idle')
  const [uploadedFiles, setUploadedFiles] = useState(0)
  const [uploadTotal,   setUploadTotal]   = useState(0)

  const [total,     setTotal]     = useState(0)
  const [completed, setCompleted] = useState(0)
  const [results,   setResults]   = useState<VariationResult[]>([])
  const [infos,     setInfos]     = useState<string[]>([])

  const [runId, setRunId] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  // Mode Cloud (Railway, aucune install) vs Mode Local (torch/CLIP disponible)
  const [cloudMode, setCloudMode] = useState(true)

  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Fichiers ────────────────────────────────────────────────────────────────

  const isVideoFile = (f: File) =>
    f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(f.name)

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    Array.from(newFiles)
      .filter(f => f.type.startsWith('image/') || isVideoFile(f))
      .forEach(f => {
        setEntries(prev => [...prev, {
          file: f,
          preview: isVideoFile(f) ? null : URL.createObjectURL(f),
          isVideo: isVideoFile(f),
        }])
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeEntry = (idx: number) => {
    setEntries(prev => {
      const e = prev[idx]
      if (e.preview) URL.revokeObjectURL(e.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const resetAll = () => {
    abortRef.current?.abort()
    entries.forEach(e => { if (e.preview) URL.revokeObjectURL(e.preview) })
    setEntries([])
    setPhase('idle')
    setUploadedFiles(0)
    setUploadTotal(0)
    setTotal(0)
    setCompleted(0)
    setResults([])
    setInfos([])
    setRunId('')
    setError('')
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────────

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files)
  }

  // ── Lancement ───────────────────────────────────────────────────────────────
  //
  // Architecture 2 phases (mirror carousel/metadata) :
  //   Phase 1 — upload chunké vers /api/spoofer/upload (mêmes runId)
  //   Phase 2 — POST /api/spoofer/start { runId, level, variations }
  //             → subprocess pipeline.spoofer, SSE via /api/spoofer/events/[runId]
  //   Téléchargement — GET /api/spoofer/download/[runId] (ZIP) une fois `done`

  const launch = async () => {
    if (entries.length === 0) { setError('Add at least one file.'); return }

    setError('')
    setPhase('compressing')
    setUploadedFiles(0)
    setUploadTotal(entries.length)
    setTotal(0)
    setCompleted(0)
    setResults([])
    setInfos([])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Phase 0 — compression locale (images uniquement, vidéos intactes)
      const compressedEntries = await Promise.all(
        entries.map(async (e) => (e.isVideo ? e : { ...e, file: await compressImage(e.file) }))
      )

      if (abort.signal.aborted) return

      // Phase 1 — upload par chunks séquentiels
      setPhase('uploading')
      const newRunId = `spoofer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      setRunId(newRunId)

      const chunks: FileEntry[][] = []
      for (let i = 0; i < compressedEntries.length; i += UPLOAD_CHUNK_SIZE) {
        chunks.push(compressedEntries.slice(i, i + UPLOAD_CHUNK_SIZE))
      }

      for (const chunk of chunks) {
        if (abort.signal.aborted) break

        let lastError: Error | null = null
        for (let attempt = 0; attempt <= UPLOAD_MAX_RETRIES; attempt++) {
          if (abort.signal.aborted) break
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
          try {
            const form = new FormData()
            form.append('runId', newRunId)
            chunk.forEach(e => form.append('files', e.file))
            const res  = await fetch('/api/spoofer/upload', { method: 'POST', body: form, signal: abort.signal })
            const data = await res.json()
            if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
            setUploadedFiles(prev => prev + data.savedCount)
            lastError = null
            break
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e))
            if (abort.signal.aborted) break
            console.warn(`Chunk upload attempt ${attempt + 1} failed:`, lastError.message)
          }
        }
        if (lastError && !abort.signal.aborted) throw lastError
      }

      if (abort.signal.aborted) return

      // Phase 2 — démarrer le subprocess Python
      setPhase('processing')

      const startRes  = await fetch('/api/spoofer/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: newRunId, level, variations, noMirror }),
        signal: abort.signal,
      })
      const startData = await startRes.json()
      if (!startRes.ok || startData.error) throw new Error(startData.error || 'Launch error')

      await waitForRun(newRunId, {
        onStart: (t) => setTotal(t),
        onProgress: (current, t) => { setCompleted(current); if (t) setTotal(t) },
        onVariation: (r) => setResults(prev => [...prev, r]),
        onInfo: (msg) => setInfos(prev => [...prev, msg]),
        onWarn: (msg) => setInfos(prev => [...prev, `⚠️ ${msg}`]),
      }, abort.signal)

      if (abort.signal.aborted) return
      setPhase('done')

    } catch (e) {
      if (abort.signal.aborted) return
      setError(String(e instanceof Error ? e.message : e))
      setPhase('done')
    }
  }

  const download = () => {
    if (!runId) return
    window.location.href = `/api/spoofer/download/${runId}`
  }

  // ── Calculs UI ───────────────────────────────────────────────────────────────

  const imgCount   = entries.filter(e => !e.isVideo).length
  const videoCount = entries.filter(e =>  e.isVideo).length

  const uploadPct  = uploadTotal > 0 ? Math.round((uploadedFiles / uploadTotal) * 100) : 0
  const processPct = total > 0 ? Math.round((completed / total) * 100) : 0

  const isRunning = phase === 'compressing' || phase === 'uploading' || phase === 'processing'
  const isDone    = phase === 'done'
  const hasOutput = isDone && !error && results.length > 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
      <PageWrapper>
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">

        <TutorialVideo videoId="-eiumj9ePO4" title="Metadata & Spoofer" />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">🔀 Spoofer 2.0</h1>
              <p className="text-sm text-slate-500 mt-1">
                Generates multiple visually near-identical variations of each image/video,
                but technically distinct — to bypass Instagram duplicate detection.
              </p>
            </div>
          </div>

          {/* ── Mode toggle Cloud / Local ─────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setCloudMode(true); setShowSetup(false) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                cloudMode
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              ☁️ Cloud Mode
              {cloudMode && <span className="text-[10px] text-emerald-600">● active</span>}
            </button>
            <button
              onClick={() => setCloudMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                !cloudMode
                  ? 'bg-violet-50 border-violet-300 text-violet-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              🔥 Local Mode (CLIP adversarial)
              {!cloudMode && <span className="text-[10px] text-violet-600">● active</span>}
            </button>
            {!cloudMode && (
              <button
                onClick={() => setShowSetup(v => !v)}
                className={`ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  showSetup
                    ? 'bg-violet-50 border-violet-300 text-violet-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                📖 {showSetup ? 'Hide guide' : 'Setup guide'}
              </button>
            )}
          </div>

          {/* ── Bandeau info selon le mode ──────────────────────────────────── */}
          {cloudMode ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 text-[11px]">
              <span className="text-emerald-700 font-medium">✅ No installation required</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">🖼 Images: Tier 1+2 — geometry, color, grain, metadata</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">🎬 Videos: Tier 1+2+4 — speed, audio pitch, GOP/CRF, metadata</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-600">CLIP adversarial (images) → Local Mode only</span>
            </div>
          ) : (
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex flex-wrap gap-3 text-[11px]">
              <span className="text-violet-700 font-medium">🔥 Full mode — PyTorch + CLIP required</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">🖼 Images: Tier 1+2+3 — + CLIP adversarial protection (breaks AI embeddings)</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-500">🎬 Videos: Tier 1+2+4 — same as Cloud Mode</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-600">Install dependencies using the guide below</span>
            </div>
          )}
        </div>

        {/* ── Guide d'installation ────────────────────────────────────────────── */}
        {!cloudMode && showSetup && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 text-sm shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-slate-900 mb-1">🛠 Installation — First-time setup</h2>
              <p className="text-slate-600 text-xs">
                One-time setup. Estimated time: 10–20 min (depending on your connection).
              </p>
            </div>

            {/* Étape 0 — Prérequis */}
            <SetupSection step="0" title="Prerequisites">
              <ul className="space-y-1 text-slate-600">
                <li>✅ <strong className="text-slate-800">macOS</strong> (Mac Intel or Apple Silicon) or <strong className="text-slate-800">Windows 10/11</strong></li>
                <li>✅ <strong className="text-slate-800">~8 GB free disk space</strong> (PyTorch is about 2 GB)</li>
                <li>✅ <strong className="text-slate-800">Internet connection</strong> to download packages</li>
                <li>✅ Access to a terminal / command prompt</li>
              </ul>
            </SetupSection>

            {/* Étape 1 — Python */}
            <SetupSection step="1" title="Install Python 3.11">
              <p className="text-slate-600 mb-2">The Spoofer engine runs on Python. Minimum version: 3.10.</p>
              <p className="text-slate-500 text-xs mb-2">Mac with Homebrew (recommended):</p>
              <CodeBlock>{`# If you don't have Homebrew:
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3.11
brew install python@3.11`}</CodeBlock>
              <p className="text-slate-500 text-xs mt-3 mb-2">Windows:</p>
              <p className="text-slate-600 text-xs">Go to <span className="text-violet-600">python.org/downloads</span> → download the Python 3.11 installer → make sure to check <span className="font-semibold text-slate-800">"Add Python to PATH"</span> before installing.</p>
              <p className="text-slate-500 text-xs mt-3 mb-2">Verify:</p>
              <CodeBlock>{`python3 --version
# Should display: Python 3.11.x`}</CodeBlock>
            </SetupSection>

            {/* Étape 2 — Node.js */}
            <SetupSection step="2" title="Install Node.js 18+">
              <p className="text-slate-600 mb-2">Required for the web interface (Next.js).</p>
              <p className="text-slate-500 text-xs mb-2">Mac:</p>
              <CodeBlock>{`brew install node`}</CodeBlock>
              <p className="text-slate-500 text-xs mt-3 mb-2">Windows:</p>
              <p className="text-slate-600 text-xs">Go to <span className="text-violet-600">nodejs.org</span> → download the LTS version → install normally.</p>
            </SetupSection>

            {/* Étape 3 — ffmpeg */}
            <SetupSection step="3" title="Install ffmpeg (required for videos)">
              <p className="text-slate-600 mb-2">Spoofer uses ffmpeg to process videos. Without it, only images will work.</p>
              <p className="text-slate-500 text-xs mb-2">Mac:</p>
              <CodeBlock>{`brew install ffmpeg`}</CodeBlock>
              <p className="text-slate-500 text-xs mt-3 mb-2">Windows:</p>
              <CodeBlock>{`# Via winget (Windows 11):
winget install ffmpeg

# Or via Chocolatey:
choco install ffmpeg`}</CodeBlock>
              <p className="text-slate-500 text-xs mt-3 mb-2">Verify:</p>
              <CodeBlock>{`ffmpeg -version
# Should display the version (e.g. ffmpeg version 6.x)`}</CodeBlock>
            </SetupSection>

            {/* Étape 4 — Code */}
            <SetupSection step="4" title="Get the code">
              <p className="text-slate-600 mb-2">Navigate to the folder where you want to install the app.</p>
              <CodeBlock>{`git clone https://github.com/justbattest/ELTIGRE.git
cd ELTIGRE`}</CodeBlock>
              <p className="text-slate-600 text-xs mt-2">No git? Download the ZIP from GitHub → extract it → open a terminal in that folder.</p>
            </SetupSection>

            {/* Étape 5 — Virtualenv Python */}
            <SetupSection step="5" title="Set up the Python virtual environment (venv)">
              <p className="text-slate-600 mb-2">The venv isolates project dependencies (leaves the rest of your system untouched).</p>
              <p className="text-slate-500 text-xs mb-2">Mac / Linux:</p>
              <CodeBlock>{`python3.11 -m venv venv
source venv/bin/activate
# You'll see (venv) at the start of your prompt`}</CodeBlock>
              <p className="text-slate-500 text-xs mt-3 mb-2">Windows (PowerShell):</p>
              <CodeBlock>{`python -m venv venv
venv\\Scripts\\Activate.ps1
# If you get a "scripts disabled" error: Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`}</CodeBlock>
            </SetupSection>

            {/* Étape 6 — pip install */}
            <SetupSection step="6" title="Install Python dependencies">
              <p className="text-slate-600 mb-2">⚠️ PyTorch is about 2 GB — this may take 5–15 minutes depending on your connection. That&apos;s normal.</p>
              <CodeBlock>{`pip install -r requirements.txt`}</CodeBlock>
              <p className="text-slate-600 text-xs mt-2 text-amber-600">
                ⚠️ If you&apos;re on Mac Apple Silicon (M1/M2/M3/M4) and torch crashes:
              </p>
              <CodeBlock>{`pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt`}</CodeBlock>
            </SetupSection>

            {/* Étape 7 — npm install */}
            <SetupSection step="7" title="Install Node.js dependencies">
              <CodeBlock>{`cd webapp
npm install
cd ..`}</CodeBlock>
            </SetupSection>

            {/* Étape 8 — .env */}
            <SetupSection step="8" title="Set up environment variables">
              <p className="text-slate-600 mb-2">Copy the example file and fill in your API keys:</p>
              <CodeBlock>{`cp webapp/.env.example webapp/.env.local
# Open webapp/.env.local in an editor and fill in the values`}</CodeBlock>
              <p className="text-slate-600 text-xs mt-2">Higgsfield, Kling, and Google Drive keys can also be configured from <strong className="text-slate-800">Settings → API</strong> in the interface.</p>
            </SetupSection>

            {/* Étape 9 — Lancer */}
            <SetupSection step="9" title="Launch the application">
              <CodeBlock>{`cd webapp
npm run dev`}</CodeBlock>
              <p className="text-slate-600 text-xs mt-2">Then open <span className="text-violet-600">https://modelify.ai</span> in your browser.</p>
              <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-emerald-700 text-xs">
                ✅ If you see the login page → everything is installed correctly!
              </div>
            </SetupSection>

            {/* Problèmes courants */}
            <div className="border-t border-slate-200 pt-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">🔧 Common issues</h3>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex gap-2">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><strong className="text-slate-800">&quot;command not found: python3&quot;</strong> → Reinstall Python and check &quot;Add to PATH&quot;</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><strong className="text-slate-800">&quot;ffmpeg not found&quot;</strong> → Run <code className="bg-slate-100 px-1 rounded">brew install ffmpeg</code> and restart your terminal</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><strong className="text-slate-800">Spoofer slow on first run</strong> → Normal! CLIP models are loading into memory (30–60s). Subsequent runs are instant.</div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><strong className="text-slate-800">&quot;torch CUDA&quot; error on Mac</strong> → Run <code className="bg-slate-100 px-1 rounded">pip install torch --index-url https://download.pytorch.org/whl/cpu</code></div>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 shrink-0">❌</span>
                  <div><strong className="text-slate-800">Port 3000 already in use</strong> → Stop other apps, or change the port in <code className="bg-slate-100 px-1 rounded">package.json</code></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Config (idle uniquement) ────────────────────────────────────── */}
        {phase === 'idle' && (
          <>
            {/* Nombre de variations */}
            <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500">Variations per file</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Each source file generates N unique variations — never the same combination twice.</p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={variations}
                  onChange={e => setVariations(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="w-20 bg-white border border-slate-300 rounded-lg px-3 py-2 text-center text-slate-900 text-sm focus:outline-none focus:border-violet-500"
                />
              </div>

              <label className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 cursor-pointer">
                <div>
                  <p className="text-xs text-slate-700">🪞 Mirror effect (horizontal flip)</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Enabled by default. Uncheck if your photos/videos contain on-screen text
                    — the mirror would reverse it and make it unreadable.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={!noMirror}
                  onChange={e => setNoMirror(!e.target.checked)}
                  className="w-4 h-4 accent-violet-500 shrink-0"
                />
              </label>
            </div>

            {/* Zone drag & drop */}
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                dragging ? 'border-violet-400 bg-violet-50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
              }`}
            >
              <div className="text-4xl mb-3">🔀</div>
              <p className="text-slate-700 font-medium">Drop your photos &amp; videos here</p>
              <p className="text-slate-500 text-sm mt-1">JPG · PNG · WebP · MP4 · MOV · multiple files supported</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.mov,.m4v,.webm"
                multiple
                className="hidden"
                onChange={e => e.target.files && addFiles(e.target.files)}
              />
            </div>

            {/* Previews */}
            {entries.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-500">
                    {imgCount > 0 && <span>{imgCount} photo{imgCount > 1 ? 's' : ''}</span>}
                    {imgCount > 0 && videoCount > 0 && <span className="mx-1">·</span>}
                    {videoCount > 0 && <span>{videoCount} video{videoCount > 1 ? 's' : ''}</span>}
                    <span className="text-slate-600 ml-2">
                      → {entries.length * variations} output file{entries.length * variations > 1 ? 's' : ''}
                    </span>
                  </span>
                  <button onClick={resetAll} className="text-xs text-slate-600 hover:text-red-500 transition">
                    Clear all
                  </button>
                </div>
                <div className="grid grid-cols-6 sm:grid-cols-10 gap-1">
                  {entries.map((entry, i) => (
                    <div key={i} className="relative group aspect-square">
                      {entry.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.preview} alt="" className="w-full h-full object-cover rounded-md" />
                      ) : (
                        <div className="w-full h-full bg-white border border-slate-200 rounded-md flex items-center justify-center">
                          <span className="text-lg">🎬</span>
                        </div>
                      )}
                      <button
                        onClick={ev => { ev.stopPropagation(); removeEntry(i) }}
                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-3.5 h-3.5 text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pourquoi Spoofer 2.0 */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-violet-700">🏆 Why Spoofer 2.0 is different</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Most spoofing tools apply only a single small change (a crop, a color filter...) — a level
                of protection that modern detection systems catch in seconds, especially once they recognize
                multiple files as variants of the same source.
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Spoofer 2.0 combines <strong className="text-slate-800">multiple independent transformation
                layers</strong> — overall appearance, fine details, colors and textures, and even the way
                an AI &ldquo;understands&rdquo; an image or video — so that each variation is recognized as
                a brand-new, independent file, on every level at once.
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Each variation gets its own unique combination of settings: the same recipe is never
                applied twice, even across 15–20 versions of a single file. The file&apos;s internal metadata
                (date, device, location...) is also realistically regenerated, as if each file came from
                a different phone — a detail most basic tools don&apos;t address.
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                The result: visually identical to the original for you and your audience, but unique in
                the eyes of detection systems — including the latest ones.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-4">{error}</div>
            )}

            <button
              onClick={launch}
              disabled={entries.length === 0}
              className="w-full bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 hover:shadow-lg hover:shadow-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl py-3.5 transition text-sm"
            >
              {entries.length === 0
                ? 'Add files to get started'
                : `Run spoofer — ${entries.length} file${entries.length > 1 ? 's' : ''} × ${variations} variation${variations > 1 ? 's' : ''}`}
            </button>
          </>
        )}

        {/* ── Progression (running + done) ────────────────────────────────── */}
        {(isRunning || isDone) && (
          <div className="space-y-5">
            <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-5 space-y-5">

              {phase === 'compressing' && (
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span>🗜 Compressing images… (local processing, a few seconds)</span>
                </div>
              )}

              {phase !== 'compressing' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      {phase === 'uploading' ? '⬆️ Uploading to server…' : '⬆️ Files received'}
                    </span>
                    <span className="text-xs text-slate-600">{uploadedFiles}/{uploadTotal}</span>
                  </div>
                  <div className="bg-slate-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${phase === 'uploading' ? 'bg-blue-500' : 'bg-blue-800'}`}
                      style={{ width: `${uploadPct}%` }}
                    />
                  </div>
                </div>
              )}

              {(phase === 'processing' || isDone) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-500">
                      {isDone && !error ? '✅ Done!' : phase === 'processing' ? `🔀 Generating variations… (${level})` : '❌ Error'}
                    </span>
                    <span className="text-xs text-slate-600">{completed}/{total || '…'}</span>
                  </div>
                  <div className="bg-slate-200 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-violet-500 to-cyan-400 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${processPct}%` }}
                    />
                  </div>
                </div>
              )}

              {infos.length > 0 && (
                <div className="space-y-1">
                  {infos.map((msg, i) => (
                    <p key={i} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ℹ️ {msg}</p>
                  ))}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-3">{error}</div>
              )}

              {isRunning && (
                <button
                  onClick={() => { abortRef.current?.abort(); resetAll() }}
                  className="w-full bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-sm rounded-lg py-2.5 transition"
                >
                  ✕ Cancel
                </button>
              )}

              {isDone && (
                <div className="flex gap-2">
                  {hasOutput && (
                    <button onClick={download} className="flex-1 bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white text-sm font-medium rounded-lg py-2.5 transition">
                      ⬇️ Download ZIP ({results.length} file{results.length > 1 ? 's' : ''})
                    </button>
                  )}
                  <button onClick={resetAll} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm rounded-lg py-2.5 transition">
                    + New batch
                  </button>
                </div>
              )}
            </div>

            {/* Résultats variation par variation */}
            {results.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-500 mb-2">
                  Generated variations ({results.length}{total ? `/${total}` : ''})
                </h3>
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm shrink-0">🔀</span>
                        <span className="text-xs text-slate-700 truncate">{r.file} <span className="text-slate-600">→ v{r.variation}</span></span>
                      </div>
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        {r.tiersApplied.map(t => (
                          <span key={t} className="text-[9px] text-violet-600 bg-violet-50 border border-violet-300 rounded px-1.5 py-0.5">
                            {TIER_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
