/**
 * POST /api/studio/start — lance un batch de génération Prompt Studio.
 * Crée un Run (inputProfiles = "[]"), démarre pipeline.studio en subprocess.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import { runningProcesses, writePidFile, deletePidFile } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    selections = {},
    mode = 'batch_config',
    count = 10,
    soulId,
    elementId,
    model = 'auto',
    aspectRatio = '2:3',
    quality = '2k',
    characterName = '',
  } = body

  if (!soulId) return NextResponse.json({ error: 'Soul ID requis' }, { status: 400 })
  if (!elementId) return NextResponse.json({ error: 'Element ID requis' }, { status: 400 })

  const validModes = ['batch_config', 'random_select', 'random_full']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `Mode invalide (${validModes.join('|')})` }, { status: 400 })
  }

  // Récupérer les credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  if (!anthropicKey || !higgsToken) {
    return NextResponse.json({ error: 'Credentials incomplets (Anthropic + Higgsfield requis).' }, { status: 400 })
  }

  // Créer le Run (inputProfiles vide = marqueur studio)
  const run = await prisma.run.create({
    data: {
      userId: session.user.id,
      inputProfiles: '[]',
      maxPosts: count,
      selectedSoulId: soulId,
      selectedElementId: elementId,
      modelSetting: model,
      aspectRatio,
      quality,
      status: 'running',
    },
  })

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.studio',
      '--run-id', run.id,
      '--selections', JSON.stringify(selections),
      '--mode', mode,
      '--count', String(count),
      '--soul-id', soulId,
      '--element-id', elementId,
      '--model', model,
      '--aspect-ratio', aspectRatio,
      '--quality', quality,
    ],
    {
      cwd: path.join(process.cwd(), '..'),
      env: {
        ...process.env,
        ANTHROPIC_KEY: anthropicKey,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)

  proc.stdout.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[studio:${run.id}]`, JSON.stringify(event))
        await handlePipelineEvent(run.id, session.user.id, event)
      } catch {
        if (line.trim()) console.log(`[studio:${run.id}][stdout]`, line)
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[studio:${run.id}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[studio:${run.id}] spawn error:`, err)
    prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed' },
    }).catch(() => {})
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(run.id)
    deletePidFile(run.id)
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
