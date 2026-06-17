/**
 * GET /api/mc-prep/frame/[extractId]/[index]
 *
 * Sert l'image JPEG d'une frame extraite.
 * Utilisé par le frontend pour afficher les thumbnails de sélection de frame.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { mcPrepExtracts } from '@/lib/mc-prep-state'
import * as fs from 'fs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ extractId: string; index: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse('Non authentifié', { status: 401 })

  const { extractId, index: indexStr } = await params
  const index = parseInt(indexStr, 10)

  const state = mcPrepExtracts.get(extractId)
  if (!state) {
    return new NextResponse('Extract session not found or expired', { status: 404 })
  }
  if (state.userId !== session.user.id) {
    return new NextResponse('Accès refusé', { status: 403 })
  }

  const frame = state.frames.find(f => f.index === index)
  if (!frame) {
    return new NextResponse(`Frame ${index} not found`, { status: 404 })
  }

  try {
    const imageBuffer = fs.readFileSync(frame.path)
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new NextResponse('Frame file not found', { status: 404 })
  }
}
