/**
 * GET /api/generations/recent?limit=30&status=complete
 * Retourne les générations récentes de l'utilisateur (pour la galerie Poster).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '30'), 100)
  const status = searchParams.get('status') || 'complete'

  const generations = await prisma.generation.findMany({
    where: {
      userId: session.user.id,
      generationStatus: status,
      // Avoir au moins une URL (CDN ou Drive)
      OR: [
        { generatedImageUrl: { not: null } },
        { driveGeneratedUrl: { not: null } },
      ],
    },
    orderBy: { generatedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      generatedImageUrl: true,
      driveGeneratedUrl: true,
      driveSourceUrl: true,
      modelUsed: true,
      sceneDescription: true,
      generationStatus: true,
      generatedAt: true,
      runId: true,
      sourceCaption: true,
      // Include post count pour savoir si déjà planifié
      instagramPosts: {
        select: { id: true, status: true },
      },
    },
  })

  return NextResponse.json({ generations })
}
