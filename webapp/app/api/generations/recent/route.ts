/**
 * GET /api/generations/recent
 *
 * Retourne les générations récentes pour l'onglet Contenu du Poster.
 *
 * Query params :
 *   limit        — max résultats (défaut 60)
 *   characterName — filtre par personnage (ex: "EMMAGOOD")
 *   mediaType    — filtre par type : "video" | "image" | "all" (défaut "all")
 *   hidePosted   — "true" (défaut) : masque les déjà postés avec succès
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '60'), 200)
  const characterName = searchParams.get('characterName') || null
  const mediaType = searchParams.get('mediaType') || 'all'
  const hidePosted = searchParams.get('hidePosted') !== 'false' // défaut true

  // Récupérer les générations avec leurs runs (pour le characterName) et leurs posts Instagram
  const generations = await prisma.generation.findMany({
    where: {
      userId: session.user.id,
      generationStatus: 'complete',
      OR: [
        { generatedImageUrl: { not: null } },
        { driveGeneratedUrl: { not: null } },
      ],
    },
    orderBy: { generatedAt: 'desc' },
    take: limit * 2, // Prendre plus pour compenser les filtrages
    select: {
      id: true,
      runId: true,
      generatedImageUrl: true,
      driveGeneratedUrl: true,
      driveSourceUrl: true,
      modelUsed: true,
      sceneDescription: true,
      generationStatus: true,
      generatedAt: true,
      promptUsed: true,
      run: {
        select: {
          characterName: true,
          modelSetting: true,
        },
      },
      instagramPosts: {
        select: { id: true, status: true, accountId: true, postedAt: true },
        where: { status: { not: 'cancelled' } },
      },
    },
  })

  // Filtrer et enrichir
  let filtered = generations.map(gen => {
    const isPosted = gen.instagramPosts.some(p => p.status === 'posted')
    const isPending = gen.instagramPosts.some(p => ['pending', 'processing'].includes(p.status))
    const characterNameValue = gen.run?.characterName || null

    // Détecter le type de média depuis le modèle ou l'URL
    const model = gen.modelUsed || ''
    const url = gen.driveGeneratedUrl || gen.generatedImageUrl || ''
    const isVideo = url.includes('.mp4') || url.includes('video') || model.includes('seedance') || model.includes('kling')

    return {
      id: gen.id,
      runId: gen.runId,
      generatedImageUrl: gen.generatedImageUrl,
      driveGeneratedUrl: gen.driveGeneratedUrl,
      modelUsed: gen.modelUsed,
      sceneDescription: gen.sceneDescription,
      generatedAt: gen.generatedAt,
      characterName: characterNameValue,
      isVideo,
      isPosted,
      isPending,
      postCount: gen.instagramPosts.length,
    }
  })

  // Appliquer les filtres
  if (hidePosted) {
    filtered = filtered.filter(g => !g.isPosted)
  }

  if (characterName) {
    filtered = filtered.filter(g => g.characterName === characterName)
  }

  if (mediaType === 'video') {
    filtered = filtered.filter(g => g.isVideo)
  } else if (mediaType === 'image') {
    filtered = filtered.filter(g => !g.isVideo)
  }

  // Extraire les personnages uniques pour les filtres de l'UI
  const allChars = [...new Set(
    generations.map(g => g.run?.characterName).filter(Boolean) as string[]
  )]

  return NextResponse.json({
    generations: filtered.slice(0, limit),
    characters: allChars,
    total: filtered.length,
  })
}
