/**
 * POST /api/mc-prep/batch
 *
 * Lance un pipeline MC Prep batch sur plusieurs items (URLs + fichiers vidéo).
 * Reçoit un FormData, spawn le subprocess Python mc_prep batch, retourne { runId, totalItems }.
 * Progress via SSE : GET /api/mc-prep/events/[runId]
 *
 * Supports two modes:
 *
 * Mode 1 — Pre-extracted frames (batchExtractId + selectedFrames present):
 *   batchExtractId    (string) — ID from batch-extract endpoint
 *   selectedFrames    (string) — JSON array: [{videoIndex, frameIndex}, ...]
 *   modelPhoto        (File) — photo de référence du modèle
 *   numVariations     (string — int, default 4)
 *   characterName     (string)
 *
 * Mode 2 — Direct URLs/files (backward compat):
 *   urls              (string) — JSON array of Instagram URLs
 *   videoFiles        (File[]) — uploaded video files
 *   modelPhoto        (File) — photo de référence du modèle
 *   numVariations     (string — int, default 4)
 *   characterName     (string) — nom du personnage pour le dossier Drive
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { mcPrepBatchRuns, mcPrepBatchExtracts } from '@/lib/mc-prep-state'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const modelPhotoFile = formData.get('modelPhoto') as File | null
  const numVariations = Math.min(8, Math.max(1, parseInt((formData.get('numVariations') as string) || '4', 10)))
  const characterName = (formData.get('characterName') as string) || ''
  const batchExtractId = (formData.get('batchExtractId') as string) || ''
  const selectedFramesRaw = (formData.get('selectedFrames') as string) || ''

  if (!modelPhotoFile) return NextResponse.json({ error: 'modelPhoto requis' }, { status: 400 })

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

  let workDir: string
  let itemsFilePath: string
  let totalItems: number
  let extraArgs: string[] = []

  // --- NEW mode: pre-extracted frames from batch-extract ---
  if (batchExtractId && selectedFramesRaw) {
    const extractState = mcPrepBatchExtracts.get(batchExtractId)
    if (!extractState) {
      return NextResponse.json({ error: 'batchExtractId non trouvé ou expiré' }, { status: 404 })
    }
    if (extractState.userId !== session.user.id) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    let selectedFrames: { videoIndex: number; frameIndex: number }[]
    try {
      selectedFrames = JSON.parse(selectedFramesRaw)
      if (!Array.isArray(selectedFrames) || selectedFrames.length === 0) {
        return NextResponse.json({ error: 'selectedFrames doit être un JSON array non vide' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'selectedFrames JSON invalide' }, { status: 400 })
    }

    // Re-use the batch-extract workDir as base, create a sub-dir for this run
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcprep-batch-'))

    // Build items with frame_path and video_path from pre-extracted data
    const allItems: { type: string; value: string; frame_path: string; video_path: string }[] = []
    for (const sel of selectedFrames) {
      const video = extractState.videos.find(v => v.videoIndex === sel.videoIndex)
      if (!video) continue
      const frame = video.frames.find(f => f.index === sel.frameIndex)
      if (!frame) continue
      allItems.push({
        type: video.source.startsWith('/') || video.source.startsWith('file://') ? 'file' : 'url',
        value: video.source,
        frame_path: frame.path,
        video_path: video.videoPath,
      })
    }

    if (allItems.length === 0) {
      return NextResponse.json({ error: 'Aucun item valide après résolution des frames' }, { status: 400 })
    }

    itemsFilePath = path.join(workDir, 'items.json')
    fs.writeFileSync(itemsFilePath, JSON.stringify(allItems, null, 2))
    totalItems = allItems.length
    extraArgs = ['--skip-extract']

  // --- EXISTING mode: URLs + video files ---
  } else {
    const urlsRaw = (formData.get('urls') as string) || '[]'
    const videoFiles = formData.getAll('videoFiles') as File[]

    // Parse URLs
    let urls: string[] = []
    try {
      urls = JSON.parse(urlsRaw)
      if (!Array.isArray(urls)) urls = []
    } catch {
      return NextResponse.json({ error: 'urls doit être un JSON array valide' }, { status: 400 })
    }

    if (urls.length === 0 && videoFiles.length === 0) {
      return NextResponse.json({ error: 'Au moins une URL ou un fichier vidéo requis' }, { status: 400 })
    }

    // Créer un workDir temporaire
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcprep-batch-'))

    // Sauvegarder les fichiers vidéo uploadés
    const uploadsDir = path.join(workDir, 'uploads')
    fs.mkdirSync(uploadsDir, { recursive: true })

    const fileItems: { type: string; value: string }[] = []
    for (let i = 0; i < videoFiles.length; i++) {
      const file = videoFiles[i]
      const filePath = path.join(uploadsDir, `video_${i}.mp4`)
      const buffer = await file.arrayBuffer()
      fs.writeFileSync(filePath, Buffer.from(buffer))
      fileItems.push({ type: 'file', value: filePath })
    }

    // Construire items.json : URLs + fichiers
    const urlItems = urls.map((u) => ({ type: 'url', value: u }))
    const allItems = [...urlItems, ...fileItems]
    itemsFilePath = path.join(workDir, 'items.json')
    fs.writeFileSync(itemsFilePath, JSON.stringify(allItems, null, 2))
    totalItems = allItems.length
  }

  // Sauvegarder la photo du modèle
  const modelPhotoPath = path.join(workDir, 'model_reference.jpg')
  const modelPhotoBuffer = await modelPhotoFile.arrayBuffer()
  fs.writeFileSync(modelPhotoPath, Buffer.from(modelPhotoBuffer))

  // Générer un runId pour le SSE
  const runId = `mcprep_batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Initialiser le slot SSE
  mcPrepBatchRuns.set(runId, {
    userId: session.user.id,
    events: [],
    done: false,
    workDir,
    startedAt: Date.now(),
    totalItems,
  })

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  const args = [
    '-m', 'pipeline.mc_prep', 'batch',
    '--run-id', runId,
    '--items-file', itemsFilePath,
    '--model-photo-path', modelPhotoPath,
    '--num-variations', String(numVariations),
    '--output-dir', workDir,
    '--character-name', characterName,
    ...extraArgs,
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
      ...(process.env.INSTAGRAM_COOKIES ? { INSTAGRAM_COOKIES: process.env.INSTAGRAM_COOKIES } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const runState = mcPrepBatchRuns.get(runId)!
  runState.proc = proc

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      console.log(`[mc-prep-batch:${runId}]`, line)
      runState.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[mc-prep-batch:${runId}][stderr]`, text.slice(0, 300))
    }
  })

  proc.on('close', (code) => {
    console.log(`[mc-prep-batch:${runId}] process exited with code ${code}`)
    const state = mcPrepBatchRuns.get(runId)
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

    // Nettoyer le workDir après 3h
    setTimeout(() => {
      mcPrepBatchRuns.delete(runId)
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {}
    }, 3 * 60 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[mc-prep-batch:${runId}] spawn error:`, err)
    const state = mcPrepBatchRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', msg: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ runId, totalItems })
}
