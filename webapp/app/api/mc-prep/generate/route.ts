/**
 * POST /api/mc-prep/generate
 *
 * Phase 2 : lance le pipeline AI (swap Nano Banana Pro + variations Seedream + upload Drive).
 * Reçoit un FormData, spawn le subprocess Python mc_prep generate, retourne { runId }.
 * Progress via SSE : GET /api/mc-prep/events/[runId]
 *
 * FormData fields :
 *   extractId         (string) — extractId de la Phase 1
 *   selectedFrameIndex (string — int) — index de la frame choisie
 *   modelPhoto        (File) — photo de référence du modèle
 *   numVariations     (string — int, default 4) — nombre de variations d'outfit
 *   characterName     (string) — nom du personnage pour le dossier Drive
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { mcPrepExtracts, mcPrepRuns } from '@/lib/mc-prep-state'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const extractId = formData.get('extractId') as string
  const selectedFrameIndex = parseInt((formData.get('selectedFrameIndex') as string) || '0', 10)
  const modelPhotoFile = formData.get('modelPhoto') as File | null
  const numVariations = Math.min(8, Math.max(1, parseInt((formData.get('numVariations') as string) || '4', 10)))
  const characterName = (formData.get('characterName') as string) || ''

  if (!extractId) return NextResponse.json({ error: 'extractId requis' }, { status: 400 })
  if (!modelPhotoFile) return NextResponse.json({ error: 'modelPhoto requis' }, { status: 400 })

  // Vérifier l'extract session
  const extractState = mcPrepExtracts.get(extractId)
  if (!extractState) {
    return NextResponse.json({ error: 'Extract session expirée ou introuvable. Relancer l\'extraction.' }, { status: 422 })
  }
  if (extractState.userId !== session.user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const selectedFrame = extractState.frames.find(f => f.index === selectedFrameIndex)
  if (!selectedFrame) {
    return NextResponse.json({ error: `Frame ${selectedFrameIndex} introuvable` }, { status: 400 })
  }

  // Récupérer les credentials Higgsfield + Drive
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const googleRefreshToken = creds?.googleRefreshToken || ''
  const driveFolderId = creds?.driveFolderId || ''

  if (!higgsToken) {
    return NextResponse.json({ error: 'Higgsfield non connecté. Vérifier les Settings.' }, { status: 400 })
  }

  // Sauvegarder la photo du modèle dans le workDir de l'extract
  const modelPhotoPath = path.join(extractState.workDir, 'model_reference.jpg')
  const modelPhotoBuffer = await modelPhotoFile.arrayBuffer()
  fs.writeFileSync(modelPhotoPath, Buffer.from(modelPhotoBuffer))

  // Générer un runId pour le SSE
  const runId = `mcprep_gen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Initialiser le slot SSE
  mcPrepRuns.set(runId, {
    userId: session.user.id,
    events: [],
    done: false,
    workDir: extractState.workDir,
    startedAt: Date.now(),
  })

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  const args = [
    '-m', 'pipeline.mc_prep', 'generate',
    '--run-id', runId,
    '--frame-path', selectedFrame.path,
    '--model-photo-path', modelPhotoPath,
    '--num-variations', String(numVariations),
    '--output-dir', extractState.workDir,
    '--character-name', characterName,
    ...(extractState.videoPath ? ['--video-path', extractState.videoPath] : []),
  ]

  const proc = spawn(pythonPath, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      HIGGSFIELD_TOKEN: higgsToken,
      ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
      ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
      ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
      ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
      ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const runState = mcPrepRuns.get(runId)!
  runState.proc = proc

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      console.log(`[mc-prep-gen:${runId}]`, line)
      runState.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[mc-prep-gen:${runId}][stderr]`, text.slice(0, 300))
    }
  })

  proc.on('close', (code) => {
    console.log(`[mc-prep-gen:${runId}] process exited with code ${code}`)
    const state = mcPrepRuns.get(runId)
    if (state) {
      const hasDone = state.events.some(e => {
        try { return ['done', 'error'].includes(JSON.parse(e).type) } catch { return false }
      })
      if (!hasDone) {
        state.events.push(JSON.stringify({
          type: code === 0 ? 'done' : 'error',
          msg: code !== 0 ? `Process exited with code ${code}` : undefined,
        }))
      }
      state.done = true
    }

    // Nettoyer le workDir (extract + generate) après 1h
    setTimeout(() => {
      mcPrepExtracts.delete(extractId)
      mcPrepRuns.delete(runId)
      try {
        if (extractState.workDir) fs.rmSync(extractState.workDir, { recursive: true, force: true })
      } catch {}
    }, 60 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[mc-prep-gen:${runId}] spawn error:`, err)
    const state = mcPrepRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', msg: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ runId })
}
