/**
 * Handler partagé des événements émis par les subprocesses Python.
 * Utilisé par /api/run (scraping) et /api/studio/start (prompt studio).
 */
import { prisma } from '@/lib/prisma'

type GenerationCompleteEvent = Record<string, unknown>

// Cache pour éviter les doublons (runId:shortcode → generationId)
const generationIdCache: Map<string, number> = new Map()

export async function handlePipelineEvent(
  runId: string,
  userId: string,
  event: Record<string, unknown>
) {
  switch (event.type) {
    case 'phase':
      if (event.phase === 'scraping' && event.pct === 100) {
        const total = (event.total_posts as number) || (event.total_carousels as number) || 0
        await prisma.run.update({
          where: { id: runId },
          data: { totalPosts: total },
        })
      }
      break

    case 'generation_start':
      if (typeof event.total === 'number') {
        await prisma.run.update({
          where: { id: runId },
          data: { totalPosts: event.total },
        })
      }
      break

    case 'analysis':
      // Progression visible — pas de DB update nécessaire
      break

    case 'generation':
      if (event.status === 'started') {
        // Crée un Generation record "processing" → la card passe de "pending" à "génération..."
        await getOrCreateGenerationId(runId, userId, event as GenerationCompleteEvent)
      } else if (event.status === 'complete') {
        const genId = await getOrCreateGenerationId(runId, userId, event as GenerationCompleteEvent)
        // update (pas upsert) car getOrCreateGenerationId crée toujours le record en avance
        await prisma.generation.update({
          where: { id: genId },
          data: {
            sourcePostUrl:     (event.post_url as string)        || '',
            sourceLikes:       (event.likes as number)            || 0,
            sourceComments:    (event.comments as number)         || 0,
            sourceCaption:     (event.caption as string)          || '',
            sourceRank:        (event.rank as number)             || 0,
            slideIndex:        (event.slide_index as number)      || 0,
            localImagePath:    (event.local_image_path as string) || null,
            promptUsed:        (event.prompt as string)           || null,
            sceneDescription:  (event.scene as string)            || null,
            modelUsed:         event.model as string,
            fallbackUsed:      (event.fallback as boolean)        || false,
            generatedImageUrl: event.url as string,
            generationStatus:  'complete',
            generatedAt:       new Date(),
          },
        })

        await prisma.run.update({
          where: { id: runId },
          data: {
            completedPosts: { increment: 1 },
            ...(event.fallback ? { fallbackCount: { increment: 1 } } : {}),
          },
        })
      } else if (event.status === 'failed') {
        // Crée ou met à jour un Generation record "failed" → la card affiche "❌ Échec"
        const shortcode = event.shortcode as string
        const cacheKey = `${runId}:${shortcode}`
        let genId: number

        if (generationIdCache.has(cacheKey)) {
          genId = generationIdCache.get(cacheKey)!
        } else {
          const existing = await prisma.generation.findFirst({
            where: { runId, sourceShortcode: shortcode },
            select: { id: true },
          })
          if (existing) {
            genId = existing.id
          } else {
            const created = await prisma.generation.create({
              data: {
                runId,
                userId,
                sourceShortcode: shortcode,
                sourceRank: (event.rank as number) || 0,
                generationStatus: 'failed',
              },
            })
            genId = created.id
          }
          generationIdCache.set(cacheKey, genId)
        }

        await prisma.generation.update({
          where: { id: genId },
          data: {
            generationStatus: 'failed',
            fallbackReason: (event.error as string) || null,
          },
        })

        await prisma.run.update({
          where: { id: runId },
          data: { failedPosts: { increment: 1 } },
        })
      }
      break

    case 'done': {
      // N'écrase les compteurs que si l'event les fournit explicitement.
      // motion_control.py n'envoie que {run_id, total} → on ne touche pas completedPosts.
      const doneData: Record<string, unknown> = { status: 'completed' }
      if (typeof event.completed === 'number') doneData.completedPosts = event.completed
      if (typeof event.failed    === 'number') doneData.failedPosts    = event.failed
      if (typeof event.fallbacks === 'number') doneData.fallbackCount  = event.fallbacks
      await prisma.run.update({ where: { id: runId }, data: doneData })
      break
    }

    case 'error':
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'failed' },
      })
      break
  }
}

async function getOrCreateGenerationId(
  runId: string,
  userId: string,
  event: GenerationCompleteEvent
): Promise<number> {
  const cacheKey = `${runId}:${event.shortcode}`
  if (generationIdCache.has(cacheKey)) return generationIdCache.get(cacheKey)!

  const existing = await prisma.generation.findFirst({
    where: { runId, sourceShortcode: event.shortcode as string },
    select: { id: true },
  })

  if (existing) {
    generationIdCache.set(cacheKey, existing.id)
    return existing.id
  }

  const rank = event.rank as number | undefined
  const created = await prisma.generation.create({
    data: {
      runId,
      userId,
      sourceShortcode: event.shortcode as string,
      // Inclure le rank dès la création pour que les cards s'affichent dans le bon ordre
      ...(rank !== undefined && rank !== null ? { sourceRank: rank } : {}),
      generationStatus: 'processing',
    },
  })

  generationIdCache.set(cacheKey, created.id)
  return created.id
}
