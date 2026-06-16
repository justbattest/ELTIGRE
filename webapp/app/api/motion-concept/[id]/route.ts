/**
 * /api/motion-concept/[id]
 *
 * PATCH — met à jour un concept (name, notes, isFavorite, viewCount)
 * DELETE — supprime un concept
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

  // Vérifier l'ownership avant modification
  const concept = await prisma.motionConcept.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!concept) return NextResponse.json({ error: 'Concept introuvable' }, { status: 404 })
  if (concept.userId !== session.user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  let body: {
    name?: string
    notes?: string
    isFavorite?: boolean
    viewCount?: number
    incrementViewCount?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const { name, notes, isFavorite, viewCount, incrementViewCount } = body

  const updated = await prisma.motionConcept.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(isFavorite !== undefined ? { isFavorite } : {}),
      ...(viewCount !== undefined ? { viewCount } : {}),
      ...(incrementViewCount ? { viewCount: { increment: 1 } } : {}),
    },
  })

  return NextResponse.json({ concept: updated })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

  const concept = await prisma.motionConcept.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (!concept) return NextResponse.json({ error: 'Concept introuvable' }, { status: 404 })
  if (concept.userId !== session.user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  await prisma.motionConcept.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
