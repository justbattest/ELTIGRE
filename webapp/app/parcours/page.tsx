'use client'

import Link from 'next/link'
import { Sidebar } from '@/components/Sidebar'
import { PageWrapper } from '@/components/PageWrapper'
import { STEPS, TRANSVERSE, STATUS_META, type Status } from '@/lib/journey'
import { ArrowRight, Check, Circle, CircleDot } from 'lucide-react'

function StatusChip({ status }: { status: Status }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${m.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

function StepIcon({ status, n }: { status: Status; n: number }) {
  const base = 'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border'
  if (status === 'done')
    return <div className={`${base} bg-emerald-500/15 border-emerald-500/40 text-emerald-300`}><Check size={16} /></div>
  if (status === 'partial')
    return <div className={`${base} bg-amber-500/15 border-amber-500/40 text-amber-300`}><CircleDot size={16} /></div>
  return <div className={`${base} bg-white/[0.03] border-white/10 text-zinc-500`}>{n}</div>
}

export default function ParcoursPage() {
  const done = STEPS.filter(s => s.status === 'done').length
  const partial = STEPS.filter(s => s.status === 'partial').length

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <PageWrapper>
          <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">

            {/* ── Hero ─────────────────────────────────────────── */}
            <header className="space-y-3">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-violet-400 uppercase">Parcours de création</p>
              <h1 className="text-3xl font-bold text-white">D'une idée à une modèle qui rapporte</h1>
              <p className="text-zinc-400 text-[15px] leading-relaxed max-w-2xl">
                Le process complet de l'OFM IA, étape par étape. Chaque étape montre ce qui est
                déjà construit, ce qui reste à faire, et les outils branchés. C'est la carte de
                tout ce qu'on doit mettre en place.
              </p>
              <div className="flex items-center gap-3 pt-1 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> {done} faites</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> {partial} partielles</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-500" /> {STEPS.length - done - partial} à faire</span>
              </div>
            </header>

            {/* ── Timeline des étapes ──────────────────────────── */}
            <section className="space-y-3">
              {STEPS.map((step, i) => (
                <Link
                  key={step.slug}
                  href={`/parcours/${step.slug}`}
                  className={`group relative block rounded-2xl border bg-white/[0.02] hover:bg-white/[0.04] border-white/[0.07] hover:border-violet-500/40 transition-all p-5`}
                >
                  {/* ligne verticale reliant les étapes */}
                  {i < STEPS.length - 1 && (
                    <span className="absolute left-[37px] top-[68px] bottom-[-12px] w-px bg-white/[0.07]" />
                  )}
                  <div className="flex items-start gap-4">
                    <StepIcon status={step.status} n={step.n} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-semibold tracking-wide text-zinc-500">ÉTAPE {step.n}</span>
                        <StatusChip status={step.status} />
                      </div>
                      <h2 className="text-lg font-semibold text-white mt-1 flex items-center gap-2">
                        <span>{step.emoji}</span> {step.title}
                      </h2>
                      <p className="text-sm text-zinc-400 mt-0.5">{step.tagline}</p>
                      <p className="text-[13px] text-zinc-500 mt-2 leading-relaxed">{step.goal}</p>
                    </div>
                    <ArrowRight size={18} className="text-zinc-600 group-hover:text-violet-400 group-hover:translate-x-0.5 transition shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </section>

            {/* ── Modules transverses (roadmap Tristan) ────────── */}
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-white">Modules transverses</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  De la roadmap Tristan — utiles à toutes les étapes, pas rattachés à une seule.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {TRANSVERSE.map(m => (
                  <div key={m.label} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-white text-sm">{m.label}</h3>
                      <StatusChip status={m.status} />
                    </div>
                    <p className="text-[13px] text-zinc-500 mt-2 leading-relaxed">{m.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <p className="text-[11px] text-zinc-600 pt-4 border-t border-white/[0.05]">
              Vue placeholder — aucune donnée enregistrée pour l'instant. On branche chaque étape sur le code réel au fur et à mesure.
            </p>
          </div>
        </PageWrapper>
      </main>
    </div>
  )
}
