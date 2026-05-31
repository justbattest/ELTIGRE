/**
 * POST /api/bulk-edit/start
 * Lance un batch Seedream 4.5 i2i sur les images déjà uploadées dans /tmp/{uploadRunId}/uploads/
 *
 * Body :
 *   uploadRunId  — runId retourné par /api/metadata/upload
 *   prompt       — prompt commun à toutes les images
 *   elementId    — soul_cinematic element ID (optionnel — préfixe <<<id>>> dans le prompt)
 *   quality      — "low" | "medium" | "high" (défaut: "high")
 *   characterName — nom du personnage pour le dossier Drive (optionnel)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { runningProcesses, writePidFile, deletePidFile } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    uploadRunId,
    prompt,
    elementId = '',
    quality = 'high',
    characterName = '',
  } = body

  if (!uploadRunId) return NextResponse.json({ error: 'uploadRunId requis' }, { status: 400 })
  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt requis' }, { status: 400 })

  // ── Vérifier que le dossier d'images existe ──────────────────────────────
  const imagesDir = path.join(os.tmpdir(), uploadRunId, 'uploads')
  if (!fs.existsSync(imagesDir)) {
    return NextResponse.json({ error: `Dossier images introuvable: ${uploadRunId}` }, { status: 400 })
  }

  const imageFiles = fs.readdirSync(imagesDir).filter(f =>
    /\.(jpg|jpeg|png|webp)$/i.test(f)
  )
  if (imageFiles.length === 0) {
    return NextResponse.json({ error: 'Aucune image trouvée dans le dossier' }, { status: 400 })
  }

  // ── Credentials ───────────────────────────────────────────────────────────
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) return NextResponse.json({ error: 'Higgsfield token requis' }, { status: 400 })
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  // ── Créer le Run en DB ────────────────────────────────────────────────────
  const run = await prisma.run.create({
    data: {
      ...(session.user.id ? { user: { connect: { id: session.user.id } } } : {}),
      inputProfiles: '[]',
      maxPosts: imageFiles.length,
      selectedElementId: elementId || null,
      modelSetting: 'bulk_edit',
      aspectRatio: '1:1',
      quality,
      status: 'running',
      characterName: characterName || null,
    },
  })

  // ── Spawn Python subprocess ───────────────────────────────────────────────
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.bulk_edit',
      '--run-id', run.id,
      '--images-dir', imagesDir,
      '--prompt', prompt,
      '--element-id', elementId,
      '--quality', quality,
    ],
    {
      cwd: path.join(process.cwd(), '..'),
      env: {
        ...process.env,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        DRIVE_NICHE: 'bulk_edit',
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
        ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)

  // ── Event handlers ────────────────────────────────────────────────────────
  proc.stdout!.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[bulk-edit:${run.id}]`, JSON.stringify(event))
        await handlePipelineEvent(run.id, session.user.id, event)
      } catch {
        if (line.trim()) console.log(`[bulk-edit:${run.id}][stdout]`, line)
      }
    }
  })

  proc.stderr!.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[bulk-edit:${run.id}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[bulk-edit:${run.id}] spawn error:`, err)
    prisma.run.update({ where: { id: run.id }, data: { status: 'failed' } }).catch(() => {})
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

  return NextResponse.json({ runId: run.id, imageCount: imageFiles.length })
}
