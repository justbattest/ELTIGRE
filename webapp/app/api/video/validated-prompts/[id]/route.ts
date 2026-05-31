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

  const { id: idStr } = await params
  const id = Number(idStr)
  if (isNaN(id)) return NextResponse.json({ error: 'ID invalide' }, { status: 400 })

  const prompt = await prisma.validatedPrompt.findUnique({
    where: { id },
    select: { id: true, authorName: true },
  })

  if (!prompt) return NextResponse.json({ error: 'Prompt introuvable' }, { status: 404 })
  if (!prompt.authorName) {
    return NextResponse.json({ error: 'Seuls les prompts communautaires peuvent être supprimés' }, { status: 403 })
  }

  await prisma.validatedPrompt.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
