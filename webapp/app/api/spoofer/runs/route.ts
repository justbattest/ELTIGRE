/**
 * GET /api/spoofer/runs
 * Liste les runs Spoofer 2.0 actifs/récents depuis le singleton en mémoire.
 * Utilisé par la page "En cours" pour afficher les runs spoofer.
 * Mirror de webapp/app/api/metadata/runs/route.ts et webapp/app/api/carousel/runs/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { spooferRuns } from '@/lib/spoofer-state'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const result = []

  for (const [runId, state] of spooferRuns.entries()) {
    // Sécurité : ne retourner que les runs de l'utilisateur courant
    if (state.userId && state.userId !== session.user.id) continue

    let total = 0
    let completed = 0

    for (const eventStr of state.events) {
      try {
        const ev = JSON.parse(eventStr)
        if (ev.type === 'start')    total = ev.total_variations
        if (ev.type === 'progress') { completed = ev.current; if (!total) total = ev.total }
        if (ev.type === 'done')     { total = ev.total_outputs; completed = ev.total_outputs }
      } catch { /* ignore malformed */ }
    }

    result.push({
      runId,
      done: state.done,
      total,
      completed,
      level: state.level || '',
      totalFiles: state.totalFiles || 0,
      variations: state.variations || 0,
      startedAt: state.startedAt,
    })
  }

  // Plus récents en premier
  result.sort((a, b) => b.startedAt - a.startedAt)

  return NextResponse.json({ runs: result })
}
