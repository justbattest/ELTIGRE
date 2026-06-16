'use client'

import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { Settings, ImageIcon, VideoIcon, LayoutGrid, Wand2, BarChart2 } from 'lucide-react'

const TUTORIALS = [
  {
    id: '1dv8371-Hhg',
    icon: Settings,
    title: 'Settings',
    subtitle: 'Connect every integration — Higgsfield, Drive, Anthropic, HikerAPI',
    color: 'text-violet-400',
    bullets: [
      {
        emoji: '🔄',
        title: 'Reconnect Higgsfield every ~30 min',
        desc: 'The CLI session token expires quickly. If image or video generation fails with an auth error, go to Settings → Reconnect Higgsfield.',
      },
      {
        emoji: '🔑',
        title: 'Higgsfield Session Token (Motion Control)',
        desc: 'This is separate from the CLI token. Get it from F12 → Network → any request to fnf.higgsfield.ai → Authorization: Bearer eyJ… Expires when you close your browser.',
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
  },
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
    color: 'text-emerald-400',
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
        desc: 'Uses Kling v3 to transfer motion from a reference video onto your character image. Requires the Higgsfield Session Token (Clerk JWT) set in Settings.',
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
    color: 'text-amber-400',
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
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-4">

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white tracking-tight">Tutorials</h1>
              <p className="text-zinc-500 text-sm mt-1">
                Watch the full walkthrough for each module, then check the recap below each video.
              </p>
            </div>

            {/* Tutorial sections */}
            {TUTORIALS.map((tut) => {
              const Icon = tut.icon
              return (
                <div
                  key={tut.id}
                  className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 space-y-5"
                >
                  {/* Section header */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
                      <Icon size={17} strokeWidth={1.75} className={tut.color} />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-white leading-tight">{tut.title}</h2>
                      <p className="text-xs text-zinc-500 leading-tight mt-0.5">{tut.subtitle}</p>
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
                    <p className="text-[11px] uppercase tracking-[0.1em] text-zinc-600 font-semibold">Key takeaways</p>
                    <ul className="space-y-2.5">
                      {tut.bullets.map((b, idx) => (
                        <li key={idx} className="flex gap-3 items-start">
                          <span className="text-base leading-tight shrink-0 mt-0.5">{b.emoji}</span>
                          <div>
                            <span className="text-sm font-medium text-zinc-200">{b.title}</span>
                            <span className="text-zinc-500"> — </span>
                            <span className="text-sm text-zinc-400">{b.desc}</span>
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
