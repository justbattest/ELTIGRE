/**
 * POST /api/metadata/init
 * Crée un slot en mémoire dans metadataRuns DÈS le début de l'upload (Phase 1).
 * Permet à En cours d'afficher le run immédiatement, même avant le démarrage Python.
 *
 * Body JSON : { runId, fileCount }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metadataRuns } from '@/lib/metadata-state'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { runId, fileCount } = await req.json() as { runId: string; fileCount: number }

  if (!runId) return NextResponse.json({ error: 'runId manquant' }, { status: 400 })

  metadataRuns.set(runId, {
    events: [],
    done: false,
    characterName: '',
    startedAt: Date.now(),
    userId: session.user.id,
    uploading: true,
    totalFiles: fileCount,
  })

  console.log(`[metadata:${runId}] init — ${fileCount} fichiers attendus`)
  return NextResponse.json({ ok: true })
}
