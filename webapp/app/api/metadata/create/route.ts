/**
 * POST /api/metadata/create
 * Reçoit des images et vidéos en multipart/form-data, sauvegarde sur disque,
 * lance pipeline/metadata_batch.py en subprocess.
 * Retourne { runId } immédiatement, puis stream SSE via /api/metadata/events/[runId].
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

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  const characterName = (formData.get('characterName') as string) || ''

  if (!files || files.length === 0) {
    return NextResponse.json(
      { error: 'Aucun fichier reçu' },
      { status: 400 }
    )
  }

  // Récupérer les credentials Drive
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  if (!googleRefreshToken || !driveFolderId) {
    return NextResponse.json(
      { error: 'Google Drive non configuré. Vérifier les Settings.' },
      { status: 400 }
    )
  }

  // Générer un runId unique pour ce batch
  const runId = `metadata_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Sauvegarder les fichiers sur disque
  const uploadDir = path.join('/tmp', runId, 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })

  let savedCount = 0
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = path.join(uploadDir, safeName)
    const buffer = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
    savedCount++
  }
  console.log(`[metadata:${runId}] ${savedCount} fichiers sauvegardés dans ${uploadDir}`)

  // Initialiser le slot en mémoire
  metadataRuns.set(runId, {
    events: [],
    done: false,
    characterName: characterName || '',
    startedAt: Date.now(),
    userId: session.user.id,
  })

  // Lancer metadata_batch.py en subprocess
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  console.log(`[metadata:${runId}] spawning ${pythonPath}`)

  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.metadata_batch',
      '--run-id', runId,
      '--files-dir', uploadDir,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        GOOGLE_REFRESH_TOKEN: googleRefreshToken,
        DRIVE_FOLDER_ID: driveFolderId,
        ...(process.env.GOOGLE_CLIENT_ID    ? { GOOGLE_CLIENT_ID:     process.env.GOOGLE_CLIENT_ID    } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  // Lire stdout et stocker dans le singleton partagé
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
    console.log(`[metadata:${runId}] process exited with code ${code}`)
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
    // Nettoyer la map après 30 minutes
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

  return NextResponse.json({ runId, fileCount: files.length })
}
