/**
 * GET /api/metadata/download/[runId]
 * Zippe et stream le dossier de sortie d'un run Metadata Batch terminé.
 * Nettoie /tmp/{runId} et retire l'entrée de la map une fois le stream terminé.
 * Mirror de /api/spoofer/download/[runId].
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { metadataRuns } from '@/lib/metadata-state'
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
  const state = metadataRuns.get(runId)

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
    metadataRuns.delete(runId)
  }
  archive.on('end', cleanup)
  archive.on('error', cleanup)

  const webStream = Readable.toWeb(archive as unknown as Readable) as ReadableStream<Uint8Array>

  return new Response(webStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="metadata_${runId}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
