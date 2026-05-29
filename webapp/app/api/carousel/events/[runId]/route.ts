/**
 * GET /api/carousel/events/[runId]
 * SSE stream des events du carousel creator.
 * Lit depuis le singleton partagé lib/carousel-state.
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { carouselRuns } from '@/lib/carousel-state'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Non authentifié', { status: 401 })

  const { runId } = await params
  const state = carouselRuns.get(runId)

  if (!state) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: `Run ${runId} introuvable (serveur redémarré ?)` })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      }
    )
  }

  // Vérifier que le run appartient à l'utilisateur courant
  if (state.userId && state.userId !== session.user.id) {
    return new Response('Accès refusé', { status: 403 })
  }

  let sentIndex = 0
  const runState = state  // capture locale : TS perd le narrowing dans les closures

  const stream = new ReadableStream({
    start(controller) {
      function send(data: string) {
        try {
          controller.enqueue(`data: ${data}\n\n`)
        } catch {
          // client disconnected
        }
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
        } catch {
          // stream closed
        }
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
