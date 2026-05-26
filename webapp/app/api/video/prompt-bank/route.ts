/**
 * GET  /api/video/prompt-bank?niche=conference  — liste les prompts sauvegardés
 * POST /api/video/prompt-bank                   — ajoute un prompt à la banque
 *
 * Isolation : chaque entrée est tagged avec characterName + modelType.
 * Lors du fetch pour génération, seuls les prompts du bon personnage ET du bon
 * modèle sont utilisés → pas de contamination inter-personnage ni inter-type.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Map display name (depuis sceneDescription) → scenario key Python
const SCENARIO_MAP: Record<string, string> = {
  // Conférence
  'Standing Pacing': 'standing_pacing',
  'Seated Undertable': 'seated_undertable',
  'Back To Audience': 'back_to_audience',
  'Microphone Standing': 'microphone_standing',
  // Golf
  'Full Swing': 'golf_full_swing',
  'Putting Bent': 'golf_putting_bent',
  'Cart Seated': 'golf_cart_seated',
  'Flag Retrieve': 'golf_flag_retrieve',
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const niche = req.nextUrl.searchParams.get('niche') || 'conference'

  const entries = await prisma.videoPromptBank.findMany({
    where: { userId: session.user.id, niche },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ entries })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { generationId, notes } = body

  if (!generationId) {
    return NextResponse.json({ error: 'generationId requis' }, { status: 400 })
  }

  // Récupérer la génération + les métadonnées du run associé
  const gen = await prisma.generation.findFirst({
    where: { id: Number(generationId), userId: session.user.id },
    select: {
      promptUsed: true,
      sceneDescription: true,
      modelUsed: true,
      run: {
        select: {
          modelSetting: true,
          characterName: true,
        },
      },
    },
  })

  if (!gen || !gen.promptUsed) {
    return NextResponse.json({ error: 'Génération introuvable ou prompt manquant' }, { status: 404 })
  }

  // ── Inférer le niche depuis le préfixe de sceneDescription ──
  // Format: "Conference · Standing Pacing" ou "Golf · Full Swing"
  const sceneDesc = gen.sceneDescription || ''
  const scenePrefix = sceneDesc.split(' · ')[0].toLowerCase().trim()
  const niche = ['golf', 'conference'].includes(scenePrefix) ? scenePrefix : 'conference'

  // ── Extraire le scenario depuis la deuxième partie de sceneDescription ──
  let scenario: string | null = null
  const scenePart = sceneDesc.split(' · ')[1] || ''
  for (const [display, key] of Object.entries(SCENARIO_MAP)) {
    if (scenePart.includes(display)) { scenario = key; break }
  }

  // ── modelType : préférer modelSetting du run (plus précis), fallback sur modelUsed ──
  const modelType = gen.run?.modelSetting || gen.modelUsed || null

  // ── characterName : récupéré depuis le run (sauvegardé au lancement) ──
  const characterName = gen.run?.characterName || null

  const entry = await prisma.videoPromptBank.create({
    data: {
      userId: session.user.id,
      niche,
      scenario,
      promptJson: gen.promptUsed,
      notes: notes || null,
      modelType,
      characterName,
    },
  })

  return NextResponse.json({ entry })
}
