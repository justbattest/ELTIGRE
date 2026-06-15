/**
 * GET /api/spoofer/download/[runId]
 * Zippe et stream le dossier de sortie d'un run Spoofer 2.0 terminé.
 * Nettoie /tmp/{runId} et retire l'entrée de la map une fois le stream terminé.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { spooferRuns } from '@/lib/spoofer-state'
import * as path from 'path'
import * as fs from 'fs'
import archiver from 'archiver'
import { Readable } from 'stream'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { runId } = await params
  const state = spooferRuns.get(runId)

  if (!state) {
    return NextResponse.json(
      { error: `Run ${runId} introuvable (déjà téléchargé, expiré ou serveur redémarré)` },
      { status: 404 }
    )
  }

  if (state.userId !== session.user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  if (!state.done) {
    return NextResponse.json({ error: "Le traitement n'est pas encore terminé" }, { status: 400 })
  }

  const outputDir = state.outputDir || path.join('/tmp', runId, `output_${runId}`)
  if (!fs.existsSync(outputDir) || fs.readdirSync(outputDir).length === 0) {
    return NextResponse.json({ error: 'Aucun fichier de sortie trouvé pour ce run' }, { status: 404 })
  }

  const archive = archiver('zip', { zlib: { level: 9 } })
  archive.directory(outputDir, false)
  archive.finalize()

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    try { fs.rmSync(path.join('/tmp', runId), { recursive: true, force: true }) } catch {}
    spooferRuns.delete(runId)
  }
  archive.on('end', cleanup)
  archive.on('error', cleanup)

  const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream<Uint8Array>

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="spoof_${runId}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
