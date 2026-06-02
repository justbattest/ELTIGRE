/**
 * POST /api/motion-control/start
 *
 * Reçoit en FormData :
 *   image        — image concept (File)
 *   video        — vidéo de référence (File)
 *
 * Sauvegarde image + vidéo dans /tmp/mc_<timestamp>/,
 * crée un Run (modelSetting='kling_motion_control'),
 * spawn pipeline/motion_control.py,
 * retourne { runId }.
 *
 * Phase 1 : Flux Kontext Max — édition ciblée outfit uniquement (pas d'element_id requis)
 * Phase 2 : Kling 3.0 Motion Control API — applique la motion de la vidéo de référence
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { runningProcesses, writePidFile, deletePidFile } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const imageFile = formData.get('image') as File | null
  const videoFile = formData.get('video') as File | null
  const characterName = (formData.get('characterName') as string | null) || ''

  if (!imageFile) return NextResponse.json({ error: 'Image concept requise' }, { status: 400 })
  if (!videoFile) return NextResponse.json({ error: 'Vidéo de référence requise' }, { status: 400 })

  // Récupérer les credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) {
    return NextResponse.json({ error: 'Higgsfield token requis.' }, { status: 400 })
  }

  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const klingAccessKey = decryptIfPresent(creds?.klingAccessKey) || ''
  const klingSecretKey = decryptIfPresent(creds?.klingSecretKey) || ''
  if (!klingAccessKey || !klingSecretKey) {
    return NextResponse.json({ error: 'Clés API Kling requises pour Motion Control. Ajoutez-les dans les Paramètres.' }, { status: 400 })
  }
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  // Sauvegarder les fichiers sur disque
  const runDir = path.join('/tmp', `mc_${Date.now()}`)
  fs.mkdirSync(runDir, { recursive: true })

  const imageExt = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
  const videoExt = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4'
  const imagePath = path.join(runDir, `concept.${imageExt}`)
  const videoPath = path.join(runDir, `concept.${videoExt}`)

  fs.writeFileSync(imagePath, Buffer.from(await imageFile.arrayBuffer()))
  fs.writeFileSync(videoPath, Buffer.from(await videoFile.arrayBuffer()))

  // Créer le Run
  const run = await prisma.run.create({
    data: {
      ...(session.user.id ? { user: { connect: { id: session.user.id } } } : {}),
      inputProfiles: '[]',
      maxPosts: 4,
      modelSetting: 'kling_motion_control',
      status: 'running',
    },
  })

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.motion_control',
      '--run-id', run.id,
      '--concept-image', imagePath,
      '--concept-video', videoPath,
    ],
    {
      cwd: path.join(process.cwd(), '..'),
      env: {
        ...process.env,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
        KLING_ACCESS_KEY: klingAccessKey,
        KLING_SECRET_KEY: klingSecretKey,
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)

  // Chaîne de promesses pour traiter les chunks stdout en séquence stricte.
  // Sans ça, plusieurs chunks async peuvent s'exécuter en parallèle → race condition
  // où getOrCreateGenerationId voit un cache vide alors qu'un autre chunk l'a déjà rempli.
  let stdoutChain = Promise.resolve()

  proc.stdout.on('data', (data: Buffer) => {
    stdoutChain = stdoutChain.then(async () => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          console.log(`[mc:${run.id}]`, JSON.stringify(event))
          await handlePipelineEvent(run.id, session.user.id, event)
        } catch (err) {
          console.error(`[mc:${run.id}] handlePipelineEvent error:`, err instanceof Error ? err.message : err, '| line:', line.slice(0, 150))
        }
      }
    })
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[mc:${run.id}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[mc:${run.id}] spawn error:`, err)
    prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed' },
    }).catch(() => {})
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(run.id)
    deletePidFile(run.id)
    // Nettoyer les fichiers temporaires
    try { fs.rmSync(runDir, { recursive: true, force: true }) } catch {}
    const currentRun = await prisma.run.findUnique({ where: { id: run.id } })
    if (currentRun?.status === 'running') {
      await prisma.run.update({
        where: { id: run.id },
        data: { status: code === 0 ? 'completed' : 'failed' },
      })
    }
  })

  return NextResponse.json({ runId: run.id })
}
