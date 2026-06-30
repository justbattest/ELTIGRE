/**
 * POST /api/modelark/generate
 *
 * Lance une génération vidéo via l'API ModelArk/Seedance 2.0.
 * Réservé au compte justbattest@gmail.com.
 *
 * Body JSON:
 *   characterId  string   — ID du personnage sauvegardé
 *   promptText   string   — Texte du prompt vidéo
 *   duration     number   — Durée en secondes (4-15)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

const ALLOWED_EMAIL = 'justbattest@gmail.com'
const MODELARK_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
const MODELARK_MODEL = 'doubao-seedance-2-0-260128'

type ModelArkCharacter = {
  id: string
  name: string
  photoDataUrls: string[]
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { characterId, promptText, duration } = body as {
    characterId: string
    promptText: string
    duration: number
  }

  if (!characterId || !promptText) {
    return NextResponse.json({ error: 'characterId + promptText requis' }, { status: 400 })
  }

  // Récupérer le personnage et la clef API
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { modelArkCharacters: true, modelArkApiKey: true },
  })

  // Clef API : priorité env var (Railway), fallback DB
  const apiKey = process.env.MODELARK_API_KEY || decryptIfPresent(creds?.modelArkApiKey)
  if (!apiKey) {
    return NextResponse.json({ error: 'MODELARK_API_KEY non configurée dans les variables Railway.' }, { status: 400 })
  }

  const characters: ModelArkCharacter[] = creds?.modelArkCharacters
    ? JSON.parse(creds.modelArkCharacters)
    : []

  const character = characters.find(c => c.id === characterId)
  if (!character) {
    return NextResponse.json({ error: `Personnage ${characterId} introuvable` }, { status: 404 })
  }

  if (character.photoDataUrls.length === 0) {
    return NextResponse.json({ error: 'Ce personnage n\'a pas de photos' }, { status: 400 })
  }

  // Construire le content array :
  // 1. Toutes les photos comme reference_image
  // 2. Le texte du prompt avec @Image1 ... @ImageN en préfixe
  const photoItems = character.photoDataUrls.map((url) => ({
    type: 'image_url',
    image_url: { url },
    role: 'reference_image',
  }))

  const imageRefs = character.photoDataUrls
    .map((_, i) => `@Image${i + 1}`)
    .join(' ')

  const fullPromptText = `${imageRefs} ${promptText}`

  const requestBody = {
    model: MODELARK_MODEL,
    content: [
      ...photoItems,
      {
        type: 'text',
        text: fullPromptText,
      },
    ],
    resolution: '720p',
    ratio: '9:16',
    duration: Math.min(15, Math.max(4, Math.round(duration || 5))),
    generate_audio: false,
  }

  console.log('[modelark/generate] Calling ModelArk API...', {
    model: MODELARK_MODEL,
    photos: character.photoDataUrls.length,
    promptLen: fullPromptText.length,
    duration: requestBody.duration,
  })

  const res = await fetch(MODELARK_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[modelark/generate] API error:', res.status, errText)
    return NextResponse.json(
      { error: `ModelArk API error ${res.status}: ${errText}` },
      { status: 502 }
    )
  }

  const data = await res.json()
  console.log('[modelark/generate] Task created:', data?.id, 'status:', data?.status)

  return NextResponse.json({
    taskId: data.id,
    status: data.status,
    characterName: character.name,
  })
}
