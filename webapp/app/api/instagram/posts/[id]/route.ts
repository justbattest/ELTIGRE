/**
 * PATCH /api/instagram/posts/[id]  → modifier (reschedule, cancel)
 * DELETE /api/instagram/posts/[id] → supprimer un post
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const post = await prisma.instagramPost.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!post) return NextResponse.json({ error: 'Post introuvable' }, { status: 404 })

  const body = await req.json()
  const { status, scheduledFor, caption } = body

  const data: Record<string, unknown> = {}
  if (status !== undefined) data.status = status
  if (caption !== undefined) data.caption = caption
  if (scheduledFor !== undefined) data.scheduledFor = scheduledFor ? new Date(scheduledFor) : null

  // Reset retryCount si on replanifie un post failed
  if (status === 'pending' && post.status === 'failed') {
    data.retryCount = (post.retryCount || 0) + 1
    data.errorMessage = null
  }

  const updated = await prisma.instagramPost.update({
    where: { id },
    data,
    include: {
      account: { select: { id: true, username: true, networkName: true } },
    },
  })

  return NextResponse.json({ post: updated })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const post = await prisma.instagramPost.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!post) return NextResponse.json({ error: 'Post introuvable' }, { status: 404 })

  if (post.status === 'processing') {
    return NextResponse.json({ error: 'Impossible de supprimer un post en cours de traitement' }, { status: 400 })
  }

  await prisma.instagramPost.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
