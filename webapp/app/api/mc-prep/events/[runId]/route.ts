/**
 * GET /api/mc-prep/events/[runId]
 *
 * SSE stream des événements du pipeline MC Prep (generate phase).
 * Pattern identique à /api/motion-concept/events/[runId].
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { mcPrepRuns } from '@/lib/mc-prep-state'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Non authentifié', { status: 401 })

  const { runId } = await params
  const state = mcPrepRuns.get(runId)

  if (!state) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', msg: `Run ${runId} introuvable (serveur redémarré ?)` })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }
    )
  }

  if (state.userId !== session.user.id) {
    return new Response('Accès refusé', { status: 403 })
  }

  let sentIndex = 0
  const runState = state

  const stream = new ReadableStream({
    start(controller) {
      function send(data: string) {
        try { controller.enqueue(`data: ${data}\n\n`) } catch { /* client disconnected */ }
      }

      function flush() {
        try {
          while (sentIndex < runState.events.length) {
            send(runState.events[sentIndex++])
          }
          if (runState.done) {
            controller.close()
            return
          }
          setTimeout(flush, 200)
        } catch { /* stream closed */ }
      }

      flush()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
