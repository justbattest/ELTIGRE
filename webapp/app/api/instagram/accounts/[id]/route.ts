/**
 * PATCH /api/instagram/accounts/[id]  → modifier warmupPhase, status, sessionJson, deviceJson
 * DELETE /api/instagram/accounts/[id] → supprimer un compte
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encryptIfPresent } from '@/lib/crypto'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const account = await prisma.instagramAccount.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  const body = await req.json()
  const { warmupPhase, status, sessionJson, deviceJson, password, networkName } = body

  const data: Record<string, unknown> = {}
  if (warmupPhase !== undefined) data.warmupPhase = Number(warmupPhase)
  if (status !== undefined) data.status = status
  if (networkName !== undefined) data.networkName = networkName
  if (password !== undefined && password !== null) data.passwordEnc = encryptIfPresent(password)
  // sessionJson / deviceJson sont fournis chiffrés par le Mac script — on stocke tel quel
  if (sessionJson !== undefined) data.sessionJson = sessionJson
  if (deviceJson !== undefined) data.deviceJson = deviceJson

  const updated = await prisma.instagramAccount.update({
    where: { id: params.id },
    data,
    select: {
      id: true,
      username: true,
      networkName: true,
      warmupPhase: true,
      status: true,
      lastPostedAt: true,
      postsToday: true,
    },
  })

  return NextResponse.json({ account: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const account = await prisma.instagramAccount.findFirst({
    where: { id: params.id, userId: session.user.id },
  })
  if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })

  await prisma.instagramAccount.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
