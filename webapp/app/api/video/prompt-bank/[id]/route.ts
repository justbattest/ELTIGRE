/**
 * DELETE /api/video/prompt-bank/[id] — supprime un prompt de la banque
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

  await prisma.videoPromptBank.deleteMany({
    where: { id: Number(id), userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
