'use client'

import { useEffect, useState } from 'react'
import { useParams, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { getStep, STEPS, STATUS_META, type Status, type Step } from '@/lib/journey'
import { ArrowLeft, ArrowRight, Check, ExternalLink, Hammer, Wrench } from 'lucide-react'

function StatusChip({ status }: { status: Status }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${m.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

/** Checklist cochable — état stocké en localStorage (aucune DB). */
function Checklist({ step }: { step: Step }) {
  const storageKey = `parcours:${step.slug}`
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setChecked(JSON.parse(raw))
    } catch {}
    setReady(true)
  }, [storageKey])

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const doneCount = step.checklist.filter(c => checked[c.id]).length

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-white">Checklist de l'étape</h2>
        <span className="text-xs text-zinc-500">{ready ? `${doneCount}/${step.checklist.length}` : ''}</span>
      </div>
      <ul className="space-y-2.5">
        {step.checklist.map(item => {
          const isOn = !!checked[item.id]
          return (
            <li key={item.id}>
              <button
                onClick={() => toggle(item.id)}
                className="w-full text-left flex items-start gap-3 group"
              >
                <span className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                  isOn ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'border-white/15 text-transparent group-hover:border-violet-500/50'
                }`}>
                  <Check size={13} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`text-sm transition ${isOn ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{item.label}</span>
                  {item.hint && (
                    <span className="block text-[12px] text-amber-300/70 mt-0.5">⚠ {item.hint}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function StepDetailPage() {
  const params = useParams()
  const slug = String(params.step)
  const step = getStep(slug)
  if (!step) return notFound()

  const idx = STEPS.findIndex(s => s.slug === step.slug)
  const prev = STEPS[idx - 1]
  const next = STEPS[idx + 1]

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">

            <Link href="/parcours" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition">
              <ArrowLeft size={15} /> Tous les étapes
            </Link>

            {/* ── En-tête de l'étape ───────────────────────────── */}
            <header className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold tracking-wide text-zinc-500">ÉTAPE {step.n} / {STEPS.length}</span>
                <StatusChip status={step.status} />
              </div>
              <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                <span className="text-2xl">{step.emoji}</span> {step.title}
              </h1>
              <p className="text-zinc-400">{step.tagline}</p>
              <p className="text-[15px] text-zinc-300 bg-violet-500/[0.06] border border-violet-500/20 rounded-xl px-4 py-3 leading-relaxed">
                🎯 {step.goal}
              </p>
            </header>

            {/* ── Checklist ────────────────────────────────────── */}
            <Checklist step={step} />

            {/* ── Outils branchés ──────────────────────────────── */}
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-1">
                <Wrench size={16} className="text-violet-400" /> Outils branchés
              </h2>
              <p className="text-[13px] text-zinc-500 mb-4">Les modules de Modelify qui servent cette étape.</p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {step.tools.map(tool => {
                  const m = STATUS_META[tool.status]
                  const inner = (
                    <div className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 transition ${
                      tool.href ? 'border-white/[0.08] bg-white/[0.02] hover:border-violet-500/40 hover:bg-white/[0.04]' : 'border-dashed border-white/[0.08] bg-white/[0.01]'
                    }`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium ${tool.href ? 'text-zinc-100' : 'text-zinc-400'}`}>{tool.label}</p>
                        <span className={`inline-flex items-center gap-1 text-[11px] mt-1 ${m.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} /> {m.label}
                        </span>
                      </div>
                      {tool.href
                        ? <ExternalLink size={15} className="text-zinc-500 shrink-0" />
                        : <span className="text-[10px] uppercase tracking-wide text-zinc-600 shrink-0">à construire</span>}
                    </div>
                  )
                  return tool.href
                    ? <Link key={tool.label} href={tool.href}>{inner}</Link>
                    : <div key={tool.label}>{inner}</div>
                })}
              </div>
            </section>

            {/* ── À construire ─────────────────────────────────── */}
            <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
              <h2 className="font-semibold text-white flex items-center gap-2 mb-4">
                <Hammer size={16} className="text-amber-400" /> Ce qu'on doit construire
              </h2>
              <ul className="space-y-2.5">
                {step.toBuild.map((b, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400/70 shrink-0" />
                    <span className="text-sm text-zinc-300 leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Navigation entre étapes ──────────────────────── */}
            <nav className="flex items-center justify-between gap-3 pt-2">
              {prev ? (
                <Link href={`/parcours/${prev.slug}`} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition">
                  <ArrowLeft size={15} /> <span className="hidden sm:inline">Étape {prev.n} —</span> {prev.title}
                </Link>
              ) : <span />}
              {next ? (
                <Link href={`/parcours/${next.slug}`} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition text-right">
                  {next.title} <span className="hidden sm:inline">— Étape {next.n}</span> <ArrowRight size={15} />
                </Link>
              ) : <span />}
            </nav>

          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
