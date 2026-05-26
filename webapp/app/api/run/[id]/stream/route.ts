/**
 * GET /api/run/[id]/stream — Server-Sent Events pour le monitoring temps réel.
 * Poll la DB toutes les secondes et envoie les updates au client.
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return new Response('Non authentifié', { status: 401 })
  }

  const { id } = await params

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Controller fermé
        }
      }

      let done = false
      let errorCount = 0

      while (!done) {
        try {
          const run = await prisma.run.findFirst({
            where: { id, userId: session.user.id },
            include: {
              generations: {
                orderBy: { sourceRank: 'asc' },
                select: {
                  id: true,
                  sourceShortcode: true,
                  sourceRank: true,
                  sourceLikes: true,
                  sourceComments: true,
                  generationStatus: true,
                  modelUsed: true,
                  fallbackUsed: true,
                  generatedImageUrl: true,
                  sceneDescription: true,
                  promptUsed: true,
                  fallbackReason: true,
                },
              },
            },
          })

          if (!run) {
            send({ error: 'Run introuvable' })
            break
          }

          // Calculer les métriques temps réel
          const activeJobs = run.generations.filter(
            (g) => g.generationStatus === 'processing'
          ).length
          const soulCount = run.generations.filter(
            (g) => g.modelUsed === 'soul_cinematic' && g.generationStatus === 'complete'
          ).length
          const seedreamCount = run.generations.filter(
            (g) => g.modelUsed === 'seedream_v4_5' && g.generationStatus === 'complete'
          ).length
          const nanoBananaCount = run.generations.filter(
            (g) => g.modelUsed === 'nano_banana_2' && g.generationStatus === 'complete'
          ).length

          send({
            id: run.id,
            status: run.status,
            totalPosts: run.totalPosts,
            completedPosts: run.completedPosts,
            failedPosts: run.failedPosts,
            fallbackCount: run.fallbackCount,
            activeJobs,
            soulCount,
            seedreamCount,
            nanoBananaCount,
            generations: run.generations,
          })

          errorCount = 0

          if (run.status === 'completed' || run.status === 'failed') {
            done = true
          }
        } catch (e) {
          errorCount++
          if (errorCount > 5) {
            send({ error: 'Erreur de connexion DB' })
            break
          }
        }

        if (!done) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Désactiver le buffering nginx
    },
  })
}
