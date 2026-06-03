/**
 * GET  /api/instagram/posts  → liste les posts planifiés (avec filtres)
 * POST /api/instagram/posts  → créer un post planifié
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // pending|processing|posted|failed|cancelled
  const accountId = searchParams.get('accountId')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  const posts = await prisma.instagramPost.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
      ...(accountId ? { accountId } : {}),
    },
    orderBy: { scheduledFor: 'asc' },
    take: limit,
    include: {
      account: {
        select: { id: true, username: true, networkName: true, warmupPhase: true, status: true },
      },
    },
  })

  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    accountId,
    driveFileId,
    driveFileUrl,
    caption,
    mediaType = 'reel',
    scheduledFor,
    generationId,
  } = body

  if (!accountId) return NextResponse.json({ error: 'accountId requis' }, { status: 400 })
  if (!driveFileId && !driveFileUrl) {
    return NextResponse.json({ error: 'driveFileId ou driveFileUrl requis' }, { status: 400 })
  }

  // Vérifier que le compte appartient à l'utilisateur
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  })
  if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  // Vérifier que le compte n'est pas banni/challenge
  if (account.status === 'banned') {
    return NextResponse.json({ error: `Le compte @${account.username} est banni` }, { status: 400 })
  }
  if (account.status === 'challenge') {
    return NextResponse.json({ error: `Le compte @${account.username} nécessite une vérification manuelle` }, { status: 400 })
  }

  // Décaler légèrement si l'heure est exactement sur H:00 ou H:30 (anti-bot)
  let finalScheduledFor: Date | null = null
  if (scheduledFor) {
    const d = new Date(scheduledFor)
    const minutes = d.getMinutes()
    if (minutes === 0 || minutes === 30) {
      // Décaler de ±7 à ±23 minutes
      const offset = Math.floor(Math.random() * 17) + 7 // 7..23
      const sign = Math.random() < 0.5 ? 1 : -1
      d.setMinutes(d.getMinutes() + sign * offset)
    }
    finalScheduledFor = d
  }

  const post = await prisma.instagramPost.create({
    data: {
      userId: session.user.id,
      accountId,
      generationId: generationId ? Number(generationId) : null,
      driveFileId: driveFileId || null,
      driveFileUrl: driveFileUrl || null,
      caption: caption || null,
      mediaType,
      scheduledFor: finalScheduledFor,
      status: 'pending',
    },
    include: {
      account: {
        select: { id: true, username: true, networkName: true },
      },
    },
  })

  return NextResponse.json({ post }, { status: 201 })
}
