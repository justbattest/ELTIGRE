/**
 * GET /api/modelark/prompts?subNiche=conference
 *
 * Retourne tous les prompts validés avec promptJson inclus.
 * Réservé au compte justbattest@gmail.com (le promptJson est exposé ici).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_EMAIL = 'justbattest@gmail.com'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const subNiche = req.nextUrl.searchParams.get('subNiche')

  const where = subNiche
    ? { subNiche, isActive: true }
    : { isActive: true }

  const prompts = await prisma.validatedPrompt.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      niche: true,
      subNiche: true,
      title: true,
      promptJson: true,
      isBest: true,
      suggestedDuration: true,
    },
  })

  // Dédupliquer les subNiches disponibles
  const availableSubNiches = [...new Set(prompts.map(p => p.subNiche))].sort()

  return NextResponse.json({ prompts, availableSubNiches })
}
