/**
 * DELETE /api/google-auth/poll — déconnecter Drive
 * (Le polling n'est plus nécessaire — on utilise postMessage via popup OAuth)
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  await prisma.userCredentials.update({
    where: { userId: session.user.id },
    data: { googleRefreshToken: null, driveFolderId: null },
  })

  return NextResponse.json({ ok: true })
}
