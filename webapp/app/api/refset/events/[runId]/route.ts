/**
 * GET /api/refset/events/[runId] — SSE des events du moteur de set de référence.
 * Pattern identique à /api/mc-prep/events/[runId].
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { refsetRuns } from '@/lib/refset-state'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Non authentifié', { status: 401 })

  const { runId } = await params
  const state = refsetRuns.get(runId)

  if (!state) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', msg: `Run ${runId} introuvable (serveur redémarré ?)` })}\n\n`,
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } }
    )
  }
  if (state.userId !== session.user.id) return new Response('Accès refusé', { status: 403 })

  let sentIndex = 0
  const runState = state

  const stream = new ReadableStream({
    start(controller) {
      function send(data: string) {
        try { controller.enqueue(`data: ${data}\n\n`) } catch { /* client gone */ }
      }
      let lastWrite = Date.now()
      function flush() {
        try {
          while (sentIndex < runState.events.length) {
            send(runState.events[sentIndex++])
            lastWrite = Date.now()
          }
          if (runState.done) { controller.close(); return }
          if (Date.now() - lastWrite > 15_000) {
            try { controller.enqueue(': keepalive\n\n') } catch { /* client gone */ }
            lastWrite = Date.now()
          }
          setTimeout(flush, 200)
        } catch { /* stream closed */ }
      }
      flush()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
