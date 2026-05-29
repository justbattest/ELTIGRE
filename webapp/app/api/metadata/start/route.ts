/**
 * POST /api/metadata/start
 * Phase 2/2 — lance le subprocess Python sur les fichiers déjà enregistrés.
 * Appelé après que tous les chunks ont été uploadés via /api/metadata/upload.
 *
 * Body JSON : { runId, characterName }
 * Retourne  : { ok: true }
 * Stream SSE via : GET /api/metadata/events/[runId]
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { metadataRuns } from '@/lib/metadata-state'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { runId, characterName } = await req.json() as { runId: string; characterName?: string }

  if (!runId) return NextResponse.json({ error: 'runId manquant' }, { status: 400 })

  const uploadDir = path.join('/tmp', runId, 'uploads')
  if (!fs.existsSync(uploadDir)) {
    return NextResponse.json({ error: `Dossier ${runId} introuvable (session expirée ?)` }, { status: 404 })
  }

  const fileCount = fs.readdirSync(uploadDir).length
  if (fileCount === 0) {
    return NextResponse.json({ error: 'Aucun fichier trouvé pour ce run' }, { status: 400 })
  }

  // Récupérer les credentials Drive
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId      = creds?.driveFolderId      || null

  if (!googleRefreshToken || !driveFolderId) {
    return NextResponse.json(
      { error: 'Google Drive non configuré. Vérifier les Settings.' },
      { status: 400 }
    )
  }

  // Initialiser le slot SSE en mémoire
  metadataRuns.set(runId, {
    events: [],
    done: false,
    characterName: characterName || '',
    startedAt: Date.now(),
    userId: session.user.id,
  })

  const pythonPath  = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  console.log(`[metadata:${runId}] démarrage subprocess — ${fileCount} fichiers`)

  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.metadata_batch',
      '--run-id',    runId,
      '--files-dir', uploadDir,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        GOOGLE_REFRESH_TOKEN: googleRefreshToken,
        DRIVE_FOLDER_ID:      driveFolderId,
        ...(process.env.GOOGLE_CLIENT_ID     ? { GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID     } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    const state = metadataRuns.get(runId)
    if (!state) return
    for (const line of lines) {
      console.log(`[metadata:${runId}]`, line)
      state.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[metadata:${runId}][stderr]`, text)
      const state = metadataRuns.get(runId)
      if (state && !state.done) {
        state.events.push(JSON.stringify({ type: 'stderr', msg: text }))
      }
    }
  })

  proc.on('close', (code) => {
    console.log(`[metadata:${runId}] subprocess terminé (code ${code})`)
    const state = metadataRuns.get(runId)
    if (state) {
      const hasDone = state.events.some(e => {
        try { return JSON.parse(e).type === 'done' } catch { return false }
      })
      if (!hasDone) {
        state.events.push(JSON.stringify({
          type: code === 0 ? 'done' : 'error',
          message: code !== 0 ? `Process exited with code ${code}` : undefined,
          run_id: runId,
        }))
      }
      state.done = true
    }
    // Nettoyer les fichiers uploadés
    try { fs.rmSync(path.join('/tmp', runId), { recursive: true, force: true }) } catch {}
    // Nettoyer la map après 30 min
    setTimeout(() => metadataRuns.delete(runId), 30 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[metadata:${runId}] spawn error:`, err)
    const state = metadataRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', message: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ ok: true, runId, fileCount })
}
