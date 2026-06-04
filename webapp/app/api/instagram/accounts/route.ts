/**
 * GET  /api/instagram/accounts  → liste tous les comptes Instagram de l'utilisateur
 * POST /api/instagram/accounts  → créer un nouveau compte
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptIfPresent, decryptIfPresent } from '@/lib/crypto'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const accounts = await prisma.instagramAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      networkName: true,
      characterName: true,
      warmupPhase: true,
      status: true,
      lastPostedAt: true,
      postsToday: true,
      postsTodayDate: true,
      createdAt: true,
      // Ne PAS retourner sessionJson / deviceJson / passwordEnc / totpSecret (sensitive)
    },
  })

  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { username, password, networkName, warmupPhase = 1, totpSecret, characterName } = body

  if (!username?.trim()) return NextResponse.json({ error: 'Username requis' }, { status: 400 })
  if (!networkName?.trim()) return NextResponse.json({ error: 'NetworkName requis (ex: iPhone_SIM1)' }, { status: 400 })

  // Vérifier doublon
  const existing = await prisma.instagramAccount.findFirst({
    where: { userId: session.user.id, username: username.trim() },
  })
  if (existing) {
    return NextResponse.json({ error: `Le compte @${username} existe déjà` }, { status: 400 })
  }

  const account = await prisma.instagramAccount.create({
    data: {
      userId: session.user.id,
      username: username.trim(),
      passwordEnc: encryptIfPresent(password),
      totpSecret: encryptIfPresent(totpSecret?.trim() || null),
      characterName: characterName?.trim() || null,
      networkName: networkName.trim(),
      warmupPhase: Number(warmupPhase),
      status: 'warmup',
    },
    select: {
      id: true,
      username: true,
      networkName: true,
      warmupPhase: true,
      status: true,
      createdAt: true,
    },
  })

  return NextResponse.json({ account }, { status: 201 })
}
