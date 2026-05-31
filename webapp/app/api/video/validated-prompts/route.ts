/**
 * GET /api/video/validated-prompts?niche=conference_sport
 * Retourne les prompts validés actifs pour la niche.
 * Le promptJson N'EST PAS exposé au client (boîte noire côté UI).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const niche = req.nextUrl.searchParams.get('niche') ?? 'conference_sport'

  const prompts = await prisma.validatedPrompt.findMany({
    where: { niche, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      subNiche: true,
      title: true,
      isBest: true,
      outfitText: true,        // exposé pour affichage dans le mode variations
      speakerLine: true,       // exposé pour affichage dans le mode variations
      phraseVariations: true,  // JSON array — parsé avant envoi
      authorName: true,        // auteur du prompt (communautaire)
      userDescription: true,   // description courte du concept
      // promptJson intentionnellement omis
    },
  })

  // Parser phraseVariations JSON avant envoi au client
  const parsed = prompts.map(p => ({
    ...p,
    phraseVariations: p.phraseVariations ? JSON.parse(p.phraseVariations) as string[] : null,
  }))

  return NextResponse.json({ prompts: parsed })
}
