/**
 * GET /api/motion-concept/list
 *
 * Retourne les MotionConcepts de l'utilisateur courant.
 *
 * Query params :
 *   search?    string   Filtre sur name (ILIKE %search%)
 *   favorite?  'true'   Seulement les favoris
 *   limit?     number   Nombre max (défaut 50)
 *   offset?    number   Pour la pagination (défaut 0)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const search = searchParams.get('search') || ''
  const favOnly = searchParams.get('favorite') === 'true'
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  const concepts = await prisma.motionConcept.findMany({
    where: {
      userId: session.user.id,
      ...(favOnly ? { isFavorite: true } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      name: true,
      sourceVideoUrl: true,
      conceptImageUrl: true,
      outfitImages: true,
      characterName: true,
      elementId: true,
      notes: true,
      viewCount: true,
      isFavorite: true,
      createdAt: true,
      localVideoPath: true,
      // Compter les MC runs liés
      _count: { select: { runs: true } },
    },
  })

  return NextResponse.json({ concepts })
}
