/**
 * POST /api/video/start — lance un batch de génération vidéo Seedance 2.0.
 *
 * Modes existants (legacy) :
 *   random_full | random_select | batch_config
 *
 * Nouveaux modes (prompts validés) :
 *   direct    — utilise les promptJson exacts, répétés batchCount fois par prompt
 *   variation — applique des overrides outfit/phrase légers sur chaque prompt de base
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

  // ── Champs communs ──
  const {
    elementId,
    characterName = '',
    aspectRatio = '9:16',
    resolution = '1080p',
    duration = 5,
  } = body

  if (!elementId) return NextResponse.json({ error: 'Element ID requis' }, { status: 400 })

  // ── Credentials ──
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) return NextResponse.json({ error: 'Higgsfield token requis.' }, { status: 400 })
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  // ══════════════════════════════════════════════════════════════════
  // NOUVEAUX MODES — direct / variation
  // ══════════════════════════════════════════════════════════════════

  if (body.mode === 'direct' || body.mode === 'variation') {
    const {
      mode,
      validatedPromptIds = [] as number[],
      batchCount = 1,
      outfitOverride = null as string | null,   // texte exact du nouvel outfit
      phraseOverride = null as string | null,    // texte exact de la nouvelle réplique
    } = body

    if (!validatedPromptIds.length) {
      return NextResponse.json({ error: 'Sélectionner au moins un prompt validé' }, { status: 400 })
    }

    // Charger les prompts depuis la DB (promptJson inclus ici côté serveur uniquement)
    const dbPrompts = await prisma.validatedPrompt.findMany({
      where: { id: { in: validatedPromptIds }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, promptJson: true, outfitText: true, speakerLine: true, subNiche: true, phraseVariations: true },
    })

    if (!dbPrompts.length) {
      return NextResponse.json({ error: 'Aucun prompt valide trouvé' }, { status: 404 })
    }

    // Construire la liste des jobs : chaque prompt × batchCount
    const validatedPrompts = dbPrompts.flatMap(p => {
      const phraseVariations = p.phraseVariations ? JSON.parse(p.phraseVariations) : null
      return Array.from({ length: batchCount }, (_, i) => ({
        id: p.id,
        title: p.title,
        promptJson: p.promptJson,
        outfitText: p.outfitText,
        speakerLine: p.speakerLine,
        phraseVariations,   // tableau de phrases dédiées à ce concept
        subNiche: p.subNiche,
        repeatIndex: i,
      }))
    })

    // Créer le Run
    const run = await prisma.run.create({
      data: {
        ...(session.user.id ? { user: { connect: { id: session.user.id } } } : {}),
        inputProfiles: '[]',
        maxPosts: validatedPrompts.length,
        selectedElementId: elementId,
        modelSetting: 'seedance_2_0',
        aspectRatio,
        quality: resolution,
        status: 'running',
        characterName: characterName || null,
      },
    })

    // Écrire le fichier de config des prompts validés
    const os = await import('os')
    const fs = await import('fs/promises')
    const promptsFile = path.join(os.tmpdir(), `validated_${run.id}.json`)
    await fs.writeFile(promptsFile, JSON.stringify({
      mode,
      outfit_override: outfitOverride,
      phrase_override: phraseOverride,
      prompts: validatedPrompts,
    }))

    // Lancer le subprocess Python
    const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
    const proc = spawn(
      pythonPath,
      [
        '-m', 'pipeline.video_studio',
        '--run-id', run.id,
        '--mode', mode,   // 'direct' ou 'variation'
        '--element-id', elementId,
        '--aspect-ratio', aspectRatio,
        '--resolution', resolution,
        '--duration', String(duration),
        '--validated-prompts-file', promptsFile,
      ],
      {
        cwd: path.join(process.cwd(), '..'),
        env: {
          ...process.env,
          HIGGSFIELD_TOKEN: higgsToken,
          ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
          ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
          DRIVE_NICHE: 'conference_sport',
          ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    runningProcesses.set(run.id, proc)
    writePidFile(run.id, proc.pid)
    attachProcessHandlers(proc, run.id, session.user.id)

    return NextResponse.json({ runId: run.id })
  }

  // ══════════════════════════════════════════════════════════════════
  // MODES LEGACY — random_full / random_select / batch_config
  // ══════════════════════════════════════════════════════════════════

  const {
    niche = 'conference',
    mode = 'random_full',
    count = 5,
    selections = {},
  } = body

  const validModes = ['random_full', 'random_select', 'batch_config']
  if (!validModes.includes(mode)) {
    return NextResponse.json({ error: `Mode invalide (${validModes.join('|')})` }, { status: 400 })
  }

  // Charger les bank prompts
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
    // Table peut ne pas exister encore
  }

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

  const os = await import('os')
  const fs = await import('fs/promises')
  const bankFile = path.join(os.tmpdir(), `bank_${run.id}.json`)
  await fs.writeFile(bankFile, JSON.stringify(bankPrompts))

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
  writePidFile(run.id, proc.pid)
  attachProcessHandlers(proc, run.id, session.user.id)

  return NextResponse.json({ runId: run.id })
}

// ── Shared process event handlers ──────────────────────────────────────────────

function attachProcessHandlers(proc: ReturnType<typeof spawn>, runId: string, userId: string) {
  proc.stdout!.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[video:${runId}]`, JSON.stringify(event))
        await handlePipelineEvent(runId, userId, event)
      } catch {
        if (line.trim()) console.log(`[video:${runId}][stdout]`, line)
      }
    }
  })

  proc.stderr!.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[video:${runId}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[video:${runId}] spawn error:`, err)
    prisma.run.update({ where: { id: runId }, data: { status: 'failed' } }).catch(() => {})
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(runId)
    deletePidFile(runId)
    const currentRun = await prisma.run.findUnique({ where: { id: runId } })
    if (currentRun?.status === 'running') {
      await prisma.run.update({
        where: { id: runId },
        data: { status: code === 0 ? 'completed' : 'failed' },
      })
    }
  })
}
