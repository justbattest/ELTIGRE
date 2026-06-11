/**
 * GET /api/video/niches
 * Retourne les niches connues + les niches custom ajoutées par les utilisateurs.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const KNOWN_NICHES = ['conference_sport', 'golf', 'vieux', 'meteo', 'serveuse', 'mcdo', 'skatepark']

const STATIC_NICHES = [
  { dbNiche: 'conference_sport', tabKey: 'conference', label: 'Conférence', emoji: '🎓' },
  { dbNiche: 'conference_sport', tabKey: 'sport',      label: 'Coach',       emoji: '🏃' },
  { dbNiche: 'golf',            tabKey: 'golf',       label: 'Golf',        emoji: '⛳' },
  { dbNiche: 'vieux',           tabKey: 'vieux',      label: 'Vieux',       emoji: '👴' },
  { dbNiche: 'meteo',           tabKey: 'meteo',      label: 'Météo',       emoji: '📺' },
  { dbNiche: 'serveuse',        tabKey: 'serveuse',   label: 'Serveuse',    emoji: '🍾' },
  { dbNiche: 'mcdo',            tabKey: 'mcdo',       label: 'McDo',        emoji: '🍔' },
  { dbNiche: 'skatepark',       tabKey: 'skatepark',  label: 'Skatepark',   emoji: '🛴' },
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Niches custom (créées par les utilisateurs via Prompt Lab)
  const customRows = await prisma.validatedPrompt.findMany({
    where: { niche: { notIn: KNOWN_NICHES }, isActive: true },
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

  return NextResponse.json({ niches: [...STATIC_NICHES, ...customNiches] })
}
