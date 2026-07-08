'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { TutorialVideo } from '@/components/TutorialVideo'
import { HiggsfieldConnect } from '@/components/setup/HiggsfieldConnect'
import { ReferenceElementsManager } from '@/components/setup/ReferenceElementsManager'
import { GoogleDriveConnect } from '@/components/setup/GoogleDriveConnect'
import { DASHBOARD_STEPS } from '@/lib/dashboard-tutorial-content'

type SoulCharacter = { id: string; name: string; status?: string }

type DashboardStatus = {
  higgsfield: { connected: boolean; refreshed?: boolean }
  elements: { count: number; hasVideo: boolean; hasImage: boolean }
  anthropic: { configured: boolean; valid: boolean | null; lowBalance: boolean; lowBalanceAt: string | null }
  openai: { configured: boolean; valid: boolean | null; lowBalance: boolean; lowBalanceAt: string | null }
  drive: { connected: boolean; folderId: string }
  completed: number
  total: number
}

/** Floating numbered/done badge — overlaid on top of a step's own card, no extra card chrome added. */
function NumberBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <div className={`absolute -left-3 -top-3 w-7 h-7 rounded-full text-white text-xs font-bold flex items-center justify-center shadow-[0_2px_8px_rgba(109,40,217,0.35)] z-10 ${
      done ? 'bg-gradient-to-br from-green-500 to-green-600' : 'bg-gradient-to-br from-violet-600 to-violet-700'
    }`}>
      {done ? '✓' : n}
    </div>
  )
}

/** Collapsible written instructions for a given step, sourced from the shared tutorial content. */
function StepGuide({ step }: { step: number }) {
  const [open, setOpen] = useState(false)
  const content = DASHBOARD_STEPS.find(s => s.step === step)
  if (!content) return null
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs font-medium text-violet-600 hover:text-violet-700 transition"
      >
        {open ? '▲ Hide instructions' : '▼ Show instructions'}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 text-xs text-gray-700">
          {content.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-violet-400 shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Self-contained card for the two API-key steps (no pre-existing shared component to reuse here). */
function ApiKeyStep({
  n, title, docsUrl, billingUrl, placeholder, fieldName, helpText,
  configured, valid, lowBalance,
  onSaved,
}: {
  n: number
  title: string
  docsUrl: string
  billingUrl: string
  placeholder: string
  fieldName: 'anthropicApiKey' | 'openaiApiKey'
  helpText: string
  configured: boolean
  valid: boolean | null
  lowBalance: boolean
  onSaved: () => void
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setValue(data[fieldName] || ''))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: value }),
      })
      onSaved()
    } catch {
      // best-effort
    }
  }

  return (
    <div className="relative">
      <NumberBadge n={n} done={configured} />
      <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09),inset_0_0_0_1px_rgba(255,255,255,0.55)] p-5 pt-6">
        <h2 className="font-medium mb-3 text-gray-900">{title}</h2>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          placeholder={placeholder}
          className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder-slate-400 focus:outline-none focus:border-violet-500 transition font-mono text-sm"
        />
        <p className="text-gray-800 text-xs mt-1.5">{helpText}</p>

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {configured && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              valid === true ? 'bg-green-50 text-green-700 border border-green-200'
                : valid === false ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-white/80 text-gray-600 border border-gray-200'
            }`}>
              {valid === true ? '✓ Connected' : valid === false ? '✗ Invalid key' : 'Checking…'}
            </span>
          )}
          <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-700 underline">
            Get a key ↗
          </a>
          <a href={billingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:text-violet-700 underline">
            Check balance ↗
          </a>
        </div>

        {lowBalance && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-red-600 text-xs">⚠ Low balance detected during a recent generation — top up, then recheck.</p>
            <button
              onClick={onSaved}
              className="text-xs text-red-700 font-medium hover:underline whitespace-nowrap"
            >
              ↺ Recheck
            </button>
          </div>
        )}

        <StepGuide step={n} />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [status, setStatus] = useState<DashboardStatus | null>(null)
  const [higgsConnected, setHiggsConnected] = useState(false)
  const [soulCharacters, setSoulCharacters] = useState<SoulCharacter[] | null>(null)

  const refreshStatus = useCallback(() => {
    fetch('/api/dashboard/status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!higgsConnected) {
      setSoulCharacters(null)
      return
    }
    fetch('/api/characters')
      .then(r => r.json())
      .then(data => setSoulCharacters(data.soulCharacters || []))
      .catch(() => setSoulCharacters([]))
  }, [higgsConnected])

  const completed = status?.completed ?? 0
  const total = status?.total ?? 5
  const pct = Math.round((completed / total) * 100)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-2xl mx-auto px-8 py-8 space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Setup Dashboard</h1>
              <p className="text-gray-700 text-sm mt-1">
                Complete these 5 steps in any order to fully configure Modelify.
              </p>
            </div>

            {/* Progress */}
            <div className="bg-white/75 backdrop-blur-xl rounded-xl border border-white/85 shadow-[0_4px_20px_rgba(109,40,217,0.09)] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">{completed}/{total} complete</span>
                <span className="text-xs text-gray-600">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-600 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <TutorialVideo videoId="1dv8371-Hhg" title="Full Setup Walkthrough" />

            <div className="space-y-8">
              {/* Step 1 — Higgsfield */}
              <div className="relative">
                <NumberBadge n={1} done={higgsConnected} />
                <HiggsfieldConnect onStatusChange={(c) => { setHiggsConnected(c); refreshStatus() }}>
                  <StepGuide step={1} />
                </HiggsfieldConnect>
              </div>

              {/* Step 2 — Elements + Soul Characters */}
              <div className="relative">
                <NumberBadge n={2} done={(status?.elements.count ?? 0) > 0} />
                <ReferenceElementsManager
                  higgsConnected={higgsConnected}
                  onChange={() => refreshStatus()}
                >
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <h3 className="text-xs font-semibold text-gray-800 mb-1.5">Soul Characters (images)</h3>
                    {!higgsConnected ? (
                      <p className="text-xs text-gray-500 italic">Connect Higgsfield first to detect characters.</p>
                    ) : soulCharacters === null ? (
                      <p className="text-xs text-gray-500">Loading…</p>
                    ) : soulCharacters.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">No Soul Characters yet — create one on higgsfield.ai.</p>
                    ) : (
                      <p className="text-xs text-green-700">
                        ✓ {soulCharacters.length} detected: {soulCharacters.map(c => c.name).join(', ')}
                      </p>
                    )}
                  </div>
                  <StepGuide step={2} />
                </ReferenceElementsManager>
              </div>

              {/* Step 3 — Anthropic */}
              <ApiKeyStep
                n={3}
                title="Anthropic (Claude) API Key"
                fieldName="anthropicApiKey"
                placeholder="sk-ant-api03-xxxxxxxxxxxxxxxxx"
                helpText="console.anthropic.com → API Keys"
                docsUrl="https://console.anthropic.com/settings/keys"
                billingUrl="https://console.anthropic.com/settings/billing"
                configured={status?.anthropic.configured ?? false}
                valid={status?.anthropic.valid ?? null}
                lowBalance={status?.anthropic.lowBalance ?? false}
                onSaved={refreshStatus}
              />

              {/* Step 4 — OpenAI */}
              <ApiKeyStep
                n={4}
                title="OpenAI API Key"
                fieldName="openaiApiKey"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                helpText='platform.openai.com/api-keys — used for audio transcription (Whisper) in Prompt Lab "From Video".'
                docsUrl="https://platform.openai.com/api-keys"
                billingUrl="https://platform.openai.com/settings/organization/billing/overview"
                configured={status?.openai.configured ?? false}
                valid={status?.openai.valid ?? null}
                lowBalance={status?.openai.lowBalance ?? false}
                onSaved={refreshStatus}
              />

              {/* Step 5 — Drive */}
              <div className="relative">
                <NumberBadge n={5} done={status?.drive.connected ?? false} />
                <GoogleDriveConnect onConnectedChange={() => refreshStatus()}>
                  <StepGuide step={5} />
                </GoogleDriveConnect>
              </div>
            </div>

            <div className="h-8" />
          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
