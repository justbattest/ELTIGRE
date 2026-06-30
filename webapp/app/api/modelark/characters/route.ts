/**
 * GET /api/modelark/characters  — liste les personnages sauvegardés
 * POST /api/modelark/characters — crée/met à jour un personnage (photos base64)
 * DELETE /api/modelark/characters?id=xxx — supprime un personnage
 *
 * Réservé au compte justbattest@gmail.com.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_EMAIL = 'justbattest@gmail.com'

type CharacterPhoto = string // data URL base64
type ModelArkCharacter = {
  id: string
  name: string
  photoDataUrls: CharacterPhoto[] // max 9
  createdAt: string
}

function guard(email: string | null | undefined) {
  if (!email || email !== ALLOWED_EMAIL) return false
  return true
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !guard(session.user.email)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { modelArkCharacters: true },
  })

  const characters: ModelArkCharacter[] = creds?.modelArkCharacters
    ? JSON.parse(creds.modelArkCharacters)
    : []

  return NextResponse.json({ characters })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !guard(session.user.email)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json()
  const { id, name, photoDataUrls } = body as {
    id?: string
    name: string
    photoDataUrls: string[]
  }

  if (!name || !photoDataUrls || photoDataUrls.length === 0) {
    return NextResponse.json({ error: 'name + photoDataUrls requis' }, { status: 400 })
  }
  if (photoDataUrls.length > 9) {
    return NextResponse.json({ error: 'Maximum 9 photos par personnage (limite API Seedance)' }, { status: 400 })
  }

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { modelArkCharacters: true },
  })

  const characters: ModelArkCharacter[] = creds?.modelArkCharacters
    ? JSON.parse(creds.modelArkCharacters)
    : []

  const charId = id || `char_${Date.now()}`
  const existing = characters.findIndex(c => c.id === charId)

  const updated: ModelArkCharacter = {
    id: charId,
    name,
    photoDataUrls,
    createdAt: existing >= 0 ? characters[existing].createdAt : new Date().toISOString(),
  }

  if (existing >= 0) {
    characters[existing] = updated
  } else {
    characters.push(updated)
  }

  await prisma.userCredentials.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, modelArkCharacters: JSON.stringify(characters) },
    update: { modelArkCharacters: JSON.stringify(characters) },
  })

  return NextResponse.json({ ok: true, character: updated })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !guard(session.user.email)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { modelArkCharacters: true },
  })

  const characters: ModelArkCharacter[] = creds?.modelArkCharacters
    ? JSON.parse(creds.modelArkCharacters)
    : []

  const filtered = characters.filter(c => c.id !== id)

  await prisma.userCredentials.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, modelArkCharacters: JSON.stringify(filtered) },
    update: { modelArkCharacters: JSON.stringify(filtered) },
  })

  return NextResponse.json({ ok: true })
}
