/**
 * POST /api/prompt-lab/save
 * Sauvegarde un prompt généré par le Prompt Lab dans la table validated_prompts.
 * Le prompt apparaîtra ensuite dans l'onglet Vidéos avec le nom de l'auteur.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const NICHE_MAP: Record<string, { niche: string; subNiche: string }> = {
  conference:  { niche: 'conference_sport', subNiche: 'conference' },
  sport:       { niche: 'conference_sport', subNiche: 'sport' },
  golf:        { niche: 'golf',             subNiche: 'golf' },
  nurse:       { niche: 'vieux',            subNiche: 'nurse' },
  restaurant:  { niche: 'vieux',            subNiche: 'restaurant' },
  meteo:       { niche: 'meteo',            subNiche: 'meteo' },
  reporter:    { niche: 'meteo',            subNiche: 'reporter' },
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    promptJson,        // string — JSON stringifié du prompt
    authorName,        // string — prénom/pseudo
    userDescription,   // string — description courte
    categoryKey,       // string — clé du mapping ci-dessus
  } = body

  if (!promptJson || !authorName?.trim() || !userDescription?.trim() || !categoryKey) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  const mapping = NICHE_MAP[categoryKey]
  if (!mapping) {
    return NextResponse.json({ error: `Catégorie inconnue: ${categoryKey}` }, { status: 400 })
  }

  // Valider que promptJson est un JSON valide
  try {
    JSON.parse(promptJson)
  } catch {
    return NextResponse.json({ error: 'promptJson invalide — doit être du JSON valide' }, { status: 400 })
  }

  const saved = await prisma.validatedPrompt.create({
    data: {
      niche:           mapping.niche,
      subNiche:        mapping.subNiche,
      title:           `[${authorName.trim()}] ${userDescription.trim().slice(0, 55)}`,
      promptJson,
      authorName:      authorName.trim(),
      userDescription: userDescription.trim(),
      isBest:          false,
      isActive:        true,
      sortOrder:       999,  // En bas de liste — admin peut ajuster
    },
    select: { id: true, title: true },
  })

  return NextResponse.json({ success: true, promptId: saved.id, title: saved.title })
}
