/**
 * GET /api/run/[id] — état d'un run spécifique.
 * POST /api/run/[id] — action sur un run (pause/stop).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { runningProcesses } from '../route'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params

  const run = await prisma.run.findFirst({
    where: { id, userId: session.user.id },
    include: {
      generations: {
        orderBy: { sourceRank: 'asc' },
      },
    },
  })

  if (!run) return NextResponse.json({ error: 'Run introuvable' }, { status: 404 })

  // Compter les jobs actifs
  const activeJobs = runningProcesses.has(id) ? 1 : 0

  return NextResponse.json({ ...run, activeJobs })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { id } = await params
  const { action } = await req.json()

  const run = await prisma.run.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!run) return NextResponse.json({ error: 'Run introuvable' }, { status: 404 })

  if (action === 'stop') {
    const proc = runningProcesses.get(id)
    if (proc) {
      proc.kill('SIGTERM')
      runningProcesses.delete(id)
    }
    await prisma.run.update({
      where: { id },
      data: { status: 'failed' },
    })
    return NextResponse.json({ ok: true, status: 'stopped' })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
