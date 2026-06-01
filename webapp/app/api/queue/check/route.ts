/**
 * GET /api/queue/check
 * Déclenche le scan de la queue : heal les zombies + démarre les runs en attente.
 * Appelé périodiquement par la page En cours.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { scanAndStartQueued } from '@/lib/resource-queue'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  await scanAndStartQueued()
  return NextResponse.json({ ok: true })
}
