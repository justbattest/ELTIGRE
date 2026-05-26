/**
 * POST /api/video/start — lance un batch de génération vidéo Seedance 2.0.
 * Crée un Run (inputProfiles = "[]"), démarre pipeline.video_studio en subprocess.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import { runningProcesses } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    niche = 'conference',
    mode = 'random_full',
    count = 5,
    selections = {},
    elementId,
    aspectRatio = '9:16',
    resolution = '1080p',
    duration = 5,
    characterName = '',
  } = body

  if (!elementId) return NextResponse.json({ error: 'Element ID requis' }, { status: 400 })

  const validModes = ['random_full', 'random_select', 'batch_config']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `Mode invalide (${validModes.join('|')})` }, { status: 400 })
  }

  // Récupérer les credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) {
    return NextResponse.json({ error: 'Higgsfield token requis.' }, { status: 400 })
  }

  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  // Charger les prompts de la banque — isolés par niche + modelType + characterName
  let bankPrompts: object[] = []
  try {
    const bankEntries = await prisma.videoPromptBank.findMany({
      where: {
        userId: session.user.id,
        niche,
        modelType: 'seedance_2_0',
        ...(characterName ? { characterName } : {}),
      },
      orderBy: { usageCount: 'desc' },
      take: 50,
    })
    bankPrompts = bankEntries.map(e => ({
      scenario: e.scenario,
      prompt_json: e.promptJson,
      variables: e.variables ? JSON.parse(e.variables) : {},
    }))
  } catch {
    // Table peut ne pas exister encore — ignorer silencieusement
  }

  // Créer le Run (characterName sauvegardé pour isolation banque de prompts)
  // Note: utilise la syntaxe relation `user: { connect }` pour éviter l'ambiguïté
  // XOR<RunCreateInput, RunUncheckedCreateInput> en Prisma 5 avec characterName dans les deux types.
  const run = await prisma.run.create({
    data: {
      ...(session.user.id ? { user: { connect: { id: session.user.id } } } : {}),
      inputProfiles: '[]',
      maxPosts: count,
      selectedElementId: elementId,
      modelSetting: 'seedance_2_0',
      aspectRatio,
      quality: resolution,
      status: 'running',
      characterName: characterName || null,
    },
  })

  // Écrire les bank prompts dans un fichier temp
  const os = await import('os')
  const fs = await import('fs/promises')
  const bankFile = path.join(os.tmpdir(), `bank_${run.id}.json`)
  await fs.writeFile(bankFile, JSON.stringify(bankPrompts))

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.video_studio',
      '--run-id', run.id,
      '--count', String(count),
      '--mode', mode,
      '--selections', JSON.stringify(selections),
      '--niche', niche,
      '--element-id', elementId,
      '--aspect-ratio', aspectRatio,
      '--resolution', resolution,
      '--duration', String(duration),
      '--bank-prompts-file', bankFile,
    ],
    {
      cwd: path.join(process.cwd(), '..'),
      env: {
        ...process.env,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        DRIVE_NICHE: niche,
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)

  proc.stdout.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[video:${run.id}]`, JSON.stringify(event))
        await handlePipelineEvent(run.id, session.user.id, event)
      } catch {
        if (line.trim()) console.log(`[video:${run.id}][stdout]`, line)
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[video:${run.id}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[video:${run.id}] spawn error:`, err)
    prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed' },
    }).catch(() => {})
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(run.id)
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
