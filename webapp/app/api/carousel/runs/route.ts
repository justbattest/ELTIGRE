/**
 * GET /api/carousel/runs
 * Liste les runs carousel actifs depuis le singleton en mémoire.
 * Utilisé par la page "En cours" pour afficher les runs carousel.
 * Filtre par userId pour ne pas exposer les runs des autres utilisateurs.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { carouselRuns } from '@/lib/carousel-state'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const result = []

  for (const [runId, state] of carouselRuns.entries()) {
    // Sécurité : ne retourner que les runs de l'utilisateur courant
    if (state.userId && state.userId !== session.user.id) continue

    let total = 0
    let completed = 0

    for (const eventStr of state.events) {
      try {
        const ev = JSON.parse(eventStr)
        if (ev.type === 'carousel_start') total = ev.total
        if (ev.type === 'carousel') { completed = ev.n; if (!total) total = ev.total }
        if (ev.type === 'done') total = ev.total
      } catch { /* ignore malformed */ }
    }

    result.push({
      runId,
      done: state.done,
      total,
      completed,
      characterName: state.characterName,
      startedAt: state.startedAt,
    })
  }

  // Plus récents en premier
  result.sort((a, b) => b.startedAt - a.startedAt)

  return NextResponse.json({ runs: result })
}
