/**
 * GET /api/modelark/status/[taskId]
 *
 * Poll le statut d'une tâche de génération vidéo ModelArk.
 * Réservé au compte justbattest@gmail.com.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

const ALLOWED_EMAIL = 'justbattest@gmail.com'
const MODELARK_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.email !== ALLOWED_EMAIL) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { taskId } = await params

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { modelArkApiKey: true },
  })

  const apiKey = process.env.MODELARK_API_KEY || decryptIfPresent(creds?.modelArkApiKey)
  if (!apiKey) {
    return NextResponse.json({ error: 'MODELARK_API_KEY non configurée' }, { status: 400 })
  }

  const res = await fetch(`${MODELARK_BASE}/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json(
      { error: `ModelArk status error ${res.status}: ${errText}` },
      { status: 502 }
    )
  }

  const data = await res.json()

  // Extraire l'URL vidéo si la tâche est terminée
  let videoUrl: string | null = null
  if (data.status === 'succeeded' && data.content) {
    const videoItem = data.content.find(
      (c: { type: string; video_url?: { url: string } }) => c.type === 'video_url'
    )
    videoUrl = videoItem?.video_url?.url ?? null
  }

  return NextResponse.json({
    taskId: data.id,
    status: data.status,       // 'pending' | 'running' | 'succeeded' | 'failed'
    videoUrl,
    error: data.error?.message ?? null,
  })
}
