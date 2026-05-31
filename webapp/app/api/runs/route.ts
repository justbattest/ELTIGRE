/**
 * GET /api/runs?status=running|completed|all — retourne les runs de l'utilisateur.
 * Utilisé par la page EN COURS pour afficher les runs actifs et récents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status') || 'running'

  // Construire le filtre selon le statut demandé
  const where =
    status === 'all'
      ? { userId: session.user.id }
      : status === 'recent'
      ? {
          userId: session.user.id,
          createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // 2h
        }
      : { userId: session.user.id, status }

  const runs = await prisma.run.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      modelSetting: true,
      inputProfiles: true,
      totalPosts: true,
      completedPosts: true,
      failedPosts: true,
      createdAt: true,
    },
  })

  // Déterminer le type de chaque run
  const VIDEO_MODELS = ['seedance_2_0', 'kling_motion_control']
  const enriched = runs.map((r) => ({
    ...r,
    runType: VIDEO_MODELS.includes(r.modelSetting ?? '')
      ? 'video'
      : r.modelSetting === 'bulk_edit'
      ? 'bulk_edit'
      : (r.inputProfiles && r.inputProfiles !== '[]')
      ? 'scraping'
      : 'studio',
  }))

  return NextResponse.json({ runs: enriched })
}
