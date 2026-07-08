'use client'

import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { Settings, ImageIcon, VideoIcon, LayoutGrid, Wand2, BarChart2 } from 'lucide-react'

const SETTINGS_TUTORIAL = {
  id: '1dv8371-Hhg',
  icon: Settings,
  title: 'Settings',
  subtitle: 'Connect every integration — Higgsfield, Drive, Anthropic, HikerAPI',
  color: 'text-violet-600',
  warning: '⚠️ HikerAPI connection is useless for now — the Instagram scraper is currently under maintenance and will be back soon. No need to configure it.',
  bullets: [
    {
      emoji: '🔄',
      title: 'Reconnect Higgsfield every ~30 min',
      desc: 'The CLI session token expires quickly. If image or video generation fails with an auth error, go to Settings → Reconnect Higgsfield.',
    },
    {
      emoji: '🔑',
      title: 'Higgsfield Session Cookies (Motion Control)',
      desc: 'Separate from the CLI token. Go to higgsfield.ai → F12 → Network tab → filter by "clerk.higgsfield.ai" → click any GET request → Headers → Request Headers → Cookie → copy the ENTIRE Cookie header value. Paste it in Settings → Motion Control. Valid ~7 days, auto-refreshes JWT on each run.',
    },
    {
      emoji: '📁',
      title: 'Google Drive reconnect once a week',
      desc: 'The refresh token lasts ~7 days. If uploads fail → Settings → Reconnect Drive.',
    },
    {
      emoji: '🎭',
      title: 'Character vs Element',
      desc: 'Character (Soul) = the AI persona used for IMAGE generation (Seedream, Flux, etc.). Element (Reference Element) = used for VIDEO generation (Nano Banana, Motion Control). Both are configured in Higgsfield and synced via the Scanner button in Settings.',
    },
    {
      emoji: '🤖',
      title: 'Anthropic API key',
      desc: 'Required for Claude prompt analysis and auto model selection. Without it, "Auto" mode is disabled and you must pick a model manually.',
    },
    {
      emoji: '🕷️',
      title: 'HikerAPI',
      desc: 'Required for Instagram scraping. Paste your HikerAPI token in Settings to enable profile scraping.',
    },
  ],
}

const TUTORIALS = [
  {
    id: 'kA53iyKKKgM',
    icon: ImageIcon,
    title: 'Images',
    subtitle: 'Scraping, Prompt Studio, Bulk Edit — the full image workflow',
    color: 'text-cyan-400',
    bullets: [
      {
        emoji: '🔍',
        title: 'Scraping',
        desc: 'Paste Instagram profile URLs and set a post limit. The system scrapes top-performing posts ranked by likes and extracts source images automatically.',
      },
      {
        emoji: '🎨',
        title: 'Auto model cascade',
        desc: 'Auto mode lets Claude analyze each scene and pick the best model (Flux Kontext → Seedream → fallback). No manual selection needed.',
      },
      {
        emoji: '🧬',
        title: 'Prompt Studio',
        desc: 'Manually craft or fine-tune prompts. Select your Soul Character, set aspect ratio and quality, and generate one at a time for full control.',
      },
      {
        emoji: '✏️',
        title: 'Bulk Edit',
        desc: 'Upload multiple images and apply the same outfit or style change to all of them at once. Great for batch content creation.',
      },
      {
        emoji: '⚠️',
        title: '2K quality is always recommended',
        desc: '"High" quality on Seedream is equivalent to 2K. "Standard" is faster but noticeably lower quality — avoid it for final content.',
      },
    ],
  },
  {
    id: 'nO8e2riPWVY',
    icon: VideoIcon,
    title: 'Videos',
    subtitle: 'Niche-based generation, Prompt Lab, and Motion Control',
    color: 'text-emerald-600',
    bullets: [
      {
        emoji: '🎬',
        title: 'Niche / sub-niche selection',
        desc: 'Defines the scenario (conference, sport, outdoor, etc.). The video prompt is auto-generated based on the selected niche — no writing required.',
      },
      {
        emoji: '🧪',
        title: 'Prompt Lab',
        desc: 'Browse, save, and reuse video prompts. Each prompt is linked to a niche and tagged with outfit descriptions, speaker lines, and phrase variations.',
      },
      {
        emoji: '🎞️',
        title: 'Motion Control',
        desc: 'Uses Kling v3 to transfer motion from a reference video onto your character image. Requires the Higgsfield Session Cookies in Settings (F12 → Network → clerk.higgsfield.ai → Cookie header). Valid ~7 days, JWT auto-refreshed on each run.',
      },
      {
        emoji: '📹',
        title: 'Concept Builder',
        desc: 'Paste an Instagram reel URL → the system auto-downloads it, picks the best frame, swaps your character in, and generates 4 outfit variations. The concept is saved to the library for future reuse.',
      },
    ],
  },
  {
    id: 'iFVdktshEVQ',
    icon: LayoutGrid,
    title: 'Carousels',
    subtitle: 'Mix multiple images or generate variations from a single image',
    color: 'text-amber-600',
    bullets: [
      {
        emoji: '🖼️',
        title: 'Mix mode',
        desc: 'Combine up to 10 different images into a single carousel. Best for lifestyle or variety content with multiple scenes.',
      },
      {
        emoji: '🔁',
        title: 'Variations mode',
        desc: 'Take 1 image and generate multiple cropped or restyled versions. Ideal for same-scene content with subtle differences.',
      },
      {
        emoji: '📐',
        title: 'Always match your platform ratio',
        desc: 'Use 4:5 for feed carousels, 9:16 for stories. Wrong ratio = cropping issues when posting.',
      },
      {
        emoji: '💾',
        title: 'Results auto-saved to Drive',
        desc: 'All carousel files are automatically saved to your Google Drive folder. Check the In Progress tab or Drive directly after generation.',
      },
    ],
  },
  {
    id: '-eiumj9ePO4',
    icon: Wand2,
    title: 'Metadata & Spoofer',
    subtitle: 'Strip EXIF data and add adversarial noise to evade AI detection',
    color: 'text-pink-400',
    bullets: [
      {
        emoji: '🧹',
        title: 'Metadata cleaning',
        desc: 'Removes EXIF data (GPS coordinates, camera model, software tags) that platforms use to flag AI-generated content.',
      },
      {
        emoji: '🛡️',
        title: 'CLIP Adversarial (Tier 3)',
        desc: 'Adds imperceptible pixel noise that confuses AI detection classifiers. The strongest protection available. Runs locally — requires Python setup.',
      },
      {
        emoji: '🔀',
        title: 'Spoofer tiers',
        desc: 'Tier 1 = EXIF wipe. Tier 2 = geometry jitter. Tier 3 = CLIP adversarial. Tier 4 = video variation. Use Cloud mode to skip local Python installation.',
      },
      {
        emoji: '⏱️',
        title: 'Processing time',
        desc: 'Tiers 1, 2, and 4 are fast (seconds per file). Tier 3 takes 10–30s per image depending on your machine.',
      },
      {
        emoji: '📦',
        title: 'Batch processing',
        desc: 'Upload multiple files at once. All processed files are bundled into a single zip for download.',
      },
    ],
  },
  {
    id: 'ihQJvJnV3cY',
    icon: BarChart2,
    title: 'Results',
    subtitle: 'Monitor runs, access generated content, and track performance',
    color: 'text-blue-400',
    bullets: [
      {
        emoji: '📊',
        title: 'In Progress tab',
        desc: 'Real-time dashboard showing all active and past runs. Each run displays per-generation status: complete, failed, or in progress.',
      },
      {
        emoji: '📁',
        title: 'Google Drive auto-upload',
        desc: 'All generated images and videos are automatically saved to the Drive folder configured in Settings. No manual download needed.',
      },
      {
        emoji: '🔗',
        title: 'Direct links',
        desc: 'Click any result to open the full-resolution file. Generated images link directly to the Higgsfield CDN URL.',
      },
      {
        emoji: '📈',
        title: 'KPI tab',
        desc: 'Tracks credits used, generation success rate, model breakdown, and cost estimates over time.',
      },
      {
        emoji: '🔄',
        title: 'Handling failed generations',
        desc: 'Check the error message in the In Progress tab. Most failures are caused by expired tokens (Higgsfield or Drive) — reconnect in Settings and relaunch the run.',
      },
    ],
  },
]

export default function TutorialsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tutorials</h1>
              <p className="text-gray-700 text-sm mt-1">
                Watch the full walkthrough for each module, then check the recap below each video.
              </p>
            </div>

            {/* ── Getting Started (Settings) — full-width banner ── */}
            <div className="mb-10 bg-white/70 backdrop-blur-xl rounded-2xl border border-violet-200/60 shadow-[0_4px_24px_rgba(109,40,217,0.10)] overflow-hidden">
              {/* Header */}
              <div className="px-8 py-5 border-b border-violet-100/60" style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.06) 0%, rgba(167,139,250,0.04) 100%)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-100">
                    <Settings size={18} className="text-violet-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 text-lg">Getting Started — Setup Guide</h2>
                    <p className="text-gray-600 text-sm">Complete this setup once before using any feature</p>
                  </div>
                </div>
              </div>

              {/* Warning */}
              {SETTINGS_TUTORIAL.warning && (
                <div className="px-8 pt-5">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-sm leading-relaxed">
                    {SETTINGS_TUTORIAL.warning}
                  </div>
                </div>
              )}

              {/* Video embed — full width */}
              <div className="px-8 pt-6 pb-4">
                <div className="relative w-full rounded-xl overflow-hidden shadow-md" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube-nocookie.com/embed/${SETTINGS_TUTORIAL.id}`}
                    title="Settings Setup Guide"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>

              {/* Written step-by-step guide */}
              <div className="px-8 pb-8">
                <h3 className="font-semibold text-gray-900 mb-5 flex items-center gap-2">
                  <span className="text-violet-600">📖</span> Step-by-step written guide
                </h3>

                <div className="space-y-6">
                  {/* STEP 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">1</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Create your Character & Connect Higgsfield</h4>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        <li>• On <span className="font-medium text-violet-700">higgsfield.ai</span>, create a <span className="font-medium">Soul Cinema</span> Character — this is your base model for image generation</li>
                        <li>• ⚠️ <span className="font-medium">Log into your Higgsfield account in the same browser first</span>, before clicking Connect in Settings</li>
                        <li>• Then go to <span className="font-medium">Settings → Connect Higgsfield</span> and scan the QR code / approve the device</li>
                      </ul>
                    </div>
                  </div>

                  {/* STEP 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">2</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Transform your Character into an Element <span className="text-sm font-normal text-gray-500">(required for videos)</span></h4>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        <li>• <span className="font-medium">Character</span> = generates images &nbsp;|&nbsp; <span className="font-medium">Element</span> = generates videos — these are two separate things</li>
                        <li>• On higgsfield.ai → <span className="font-medium">Video → Seedance 2.0 → Elements → Check Eligibility</span></li>
                        <li>• If eligibility ✅ passes: the Element is ready to use</li>
                        <li>• If eligibility ❌ fails: create an Element by uploading 30 photos of the model (<span className="font-medium">non-sensitive images only</span> — sort your photos to exclude any flagged content)</li>
                        <li>• <span className="font-medium">Finding your Element ID:</span> Open DevTools (F12) → Network tab → filter by <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&quot;reference-elements&quot;</code> → reload the Elements page → find the UUID in the API response. Copy that ID into <span className="font-medium">Settings → Reference Elements</span></li>
                        <li>• Same process for the Character ID (filter by <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">&quot;characters&quot;</code>)</li>
                      </ul>
                    </div>
                  </div>

                  {/* STEP 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">3</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Connect your Claude API Key</h4>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        <li>• This is <span className="font-medium">independent from your Claude.ai account</span> — you need a separate API account</li>
                        <li>• Go to <span className="font-medium text-violet-700">platform.anthropic.com</span> → sign up → Billing → add credits</li>
                        <li>• Then go to <span className="font-medium">API Keys</span> → create a new key → copy it</li>
                        <li>• Paste it into <span className="font-medium">Settings → Anthropic API Key</span></li>
                      </ul>
                    </div>
                  </div>

                  {/* STEP 4 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">4</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Connect your OpenAI API Key</h4>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        <li>• Go to <span className="font-medium text-violet-700">platform.openai.com</span> → API Keys → Create new secret key</li>
                        <li>• Copy it and paste it into <span className="font-medium">Settings → OpenAI API Key</span></li>
                        <li>• Used automatically as the audio transcription (Whisper) engine in Prompt Lab&apos;s &quot;From Video&quot; mode</li>
                      </ul>
                    </div>
                  </div>

                  {/* STEP 5 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 text-white text-sm font-bold flex items-center justify-center">5</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Connect Google Drive</h4>
                      <ul className="space-y-1.5 text-sm text-gray-700">
                        <li>• Go to <span className="font-medium text-violet-700">drive.google.com</span>, sign in, then click <span className="font-medium">New → New folder</span> and name it (e.g. &quot;Modelify Content&quot;)</li>
                        <li>• Open the folder and look at your browser&apos;s address bar — everything after <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">/folders/</code> is your folder ID</li>
                        <li>• Example URL: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs break-all">https://drive.google.com/drive/folders/1ABCdef...XYZ</code></li>
                        <li>• Copy just that ID (not the full URL) and paste it into <span className="font-medium">Settings → Target Drive folder</span></li>
                        <li>• Click <span className="font-medium">Connect Google Drive</span> and approve access — this may need reconnecting roughly weekly</li>
                        <li>• Once both are set, every image/video generated afterward uploads there automatically — no manual downloading needed</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Remaining 5 tutorial sections ── */}
            {TUTORIALS.map((tut) => {
              const Icon = tut.icon
              return (
                <div
                  key={tut.id}
                  className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/85 shadow-[0_4px_24px_rgba(109,40,217,0.10),inset_0_0_0_1px_rgba(255,255,255,0.60)] p-6 space-y-5"
                >
                  {/* Section header */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/80 border border-white/70 shadow-[0_2px_8px_rgba(109,40,217,0.08)] flex items-center justify-center shrink-0">
                      <Icon size={17} strokeWidth={1.75} className={tut.color} />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-black leading-tight">{tut.title}</h2>
                      <p className="text-xs text-gray-700 leading-tight mt-0.5">{tut.subtitle}</p>
                    </div>
                  </div>

                  {/* 16:9 YouTube embed */}
                  <div className="relative w-full rounded-xl overflow-hidden shadow-xl" style={{ paddingBottom: '56.25%' }}>
                    <iframe
                      className="absolute inset-0 w-full h-full"
                      src={`https://www.youtube-nocookie.com/embed/${tut.id}`}
                      title={tut.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>

                  {/* Recap bullets */}
                  <div className="space-y-3 pt-1">
                    <p className="text-[11px] uppercase tracking-[0.1em] text-gray-800 font-semibold">Key takeaways</p>
                    <ul className="space-y-2.5">
                      {tut.bullets.map((b, idx) => (
                        <li key={idx} className="flex gap-3 items-start">
                          <span className="text-base leading-tight shrink-0 mt-0.5">{b.emoji}</span>
                          <div>
                            <span className="text-sm font-medium text-gray-900">{b.title}</span>
                            <span className="text-gray-800"> — </span>
                            <span className="text-sm text-gray-800">{b.desc}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            })}

            <div className="h-8" />
          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
