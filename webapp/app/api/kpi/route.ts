/**
 * GET /api/kpi?runId=xxx — données KPI pour le dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const runId = searchParams.get('runId')
  const sortBy = searchParams.get('sortBy') || 'likes'
  const filterModel = searchParams.get('model') || 'all'

  // Récupérer tous les runs de l'user (pour le dropdown)
  const runs = await prisma.run.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      completedPosts: true,
      failedPosts: true,
      fallbackCount: true,
      inputProfiles: true,
    },
  })

  if (!runs.length) return NextResponse.json({ runs: [], generations: [], summary: null })

  // Run sélectionné (défaut: le plus récent)
  const selectedRunId = runId || runs[0].id
  const selectedRun = runs.find((r) => r.id === selectedRunId) || runs[0]

  // Construire le filtre
  const where: Record<string, unknown> = {
    runId: selectedRun.id,
    userId: session.user.id,
    generationStatus: 'complete',
  }
  if (filterModel !== 'all') {
    where.modelUsed = filterModel
  }

  // Tri
  const orderBy: Record<string, string> = {}
  if (sortBy === 'likes') orderBy.sourceLikes = 'desc'
  else if (sortBy === 'comments') orderBy.sourceComments = 'desc'
  else if (sortBy === 'rank') orderBy.sourceRank = 'asc'
  else if (sortBy === 'generated') orderBy.generatedAt = 'desc'

  const generations = await prisma.generation.findMany({
    where,
    orderBy,
    select: {
      id: true,
      sourceShortcode: true,
      sourcePostUrl: true,
      sourceLikes: true,
      sourceComments: true,
      sourceCaption: true,
      sourceRank: true,
      slideIndex: true,
      localImagePath: true,
      sceneDescription: true,
      promptUsed: true,
      modelUsed: true,
      fallbackUsed: true,
      generatedImageUrl: true,
      generatedAt: true,
    },
  })

  // Résumé du run sélectionné
  const allGens = await prisma.generation.findMany({
    where: { runId: selectedRun.id, userId: session.user.id },
    select: { modelUsed: true, fallbackUsed: true, generationStatus: true },
  })

  const summary = {
    total: allGens.length,
    completed: allGens.filter((g) => g.generationStatus === 'complete').length,
    failed: allGens.filter((g) => g.generationStatus === 'failed').length,
    soulCinema: allGens.filter((g) => g.modelUsed === 'soul_cinematic').length,
    seedream: allGens.filter((g) => g.modelUsed === 'seedream_v4_5').length,
    nanoBanana: allGens.filter((g) => g.modelUsed === 'nano_banana_2').length,
    fallbacks: allGens.filter((g) => g.fallbackUsed).length,
  }

  return NextResponse.json({
    runs,
    selectedRunId: selectedRun.id,
    generations,
    summary,
  })
}
