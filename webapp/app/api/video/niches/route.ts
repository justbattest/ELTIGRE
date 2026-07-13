/**
 * GET /api/video/niches
 * Retourne les niches connues (source de vérité : lib/niches.ts) + les niches
 * custom ajoutées par les utilisateurs via Prompt Lab (toute niche DB hors
 * KNOWN_DB_NICHES).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { STATIC_VIDEO_TABS, KNOWN_DB_NICHES } from '@/lib/niches'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Niches custom (créées par les utilisateurs via Prompt Lab)
  const customRows = await prisma.validatedPrompt.findMany({
    where: { niche: { notIn: KNOWN_DB_NICHES }, isActive: true },
    distinct: ['niche'],
    select: { niche: true, subNiche: true },
  })

  const customNiches = customRows.map(r => ({
    dbNiche: r.niche,
    tabKey: r.subNiche,
    label: r.niche.charAt(0).toUpperCase() + r.niche.slice(1).replace(/_/g, ' '),
    emoji: '🆕',
    isCustom: true,
  }))

  return NextResponse.json({ niches: [...STATIC_VIDEO_TABS, ...customNiches] })
}
