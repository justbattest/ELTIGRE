/**
 * POST /api/run — lance un nouveau run de génération.
 * Crée l'entrée en DB, démarre le subprocess Python, retourne le run ID.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { handlePipelineEvent } from '@/lib/pipeline-events'
import { canStartNow, onRunComplete, type ResourceGroup } from '@/lib/resource-queue'

/** Écrit /tmp/run_<id>.pid pour que le stop puisse tuer le process même après un hot-reload. */
export function writePidFile(runId: string, pid: number | undefined) {
  if (!pid) return
  try { fs.writeFileSync(`/tmp/run_${runId}.pid`, String(pid)) } catch {}
}

/** Supprime le fichier PID. */
export function deletePidFile(runId: string) {
  try { fs.unlinkSync(`/tmp/run_${runId}.pid`) } catch {}
}

/** Tue un process via PID file (fallback quand runningProcesses est vide). */
export function killByPidFile(runId: string) {
  try {
    const pidFile = `/tmp/run_${runId}.pid`
    if (!fs.existsSync(pidFile)) return false
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10)
    if (!isNaN(pid)) {
      try { process.kill(pid, 'SIGKILL') } catch {}
    }
    fs.unlinkSync(pidFile)
    return true
  } catch { return false }
}

// Map globale : runId → process (pour pause/stop)
export const runningProcesses: Map<string, ReturnType<typeof spawn>> = new Map()

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    profiles,
    maxPosts = 50,
    soulId,
    elementId,
    model = 'auto',
    aspectRatio = '2:3',
    quality = '2k',
    characterName = '',
  } = body

  if (!profiles?.length) {
    return NextResponse.json({ error: 'Au moins un profil requis' }, { status: 400 })
  }
  if (!soulId) return NextResponse.json({ error: 'Soul ID requis' }, { status: 400 })
  if (!elementId) return NextResponse.json({ error: 'Element ID requis' }, { status: 400 })

  // Récupérer les credentials déchiffrés
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const apifyKey = decryptIfPresent(creds?.apifyApiKey)
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null
  const instagramSessionCookie = decryptIfPresent(creds?.instagramSessionCookie) || null
  const scrapingProxyUrl = creds?.scrapingProxyUrl || null
  const hikerApiKey = creds?.hikerApiKey || null  // HikerAPI token — méthode scraping principale

  // Apify est optionnel — utilisé uniquement en fallback si pas de cookie Instagram.
  // Avec instagrapi (cookie) ou instaloader, Apify n'est pas nécessaire.
  if (!anthropicKey || !higgsToken) {
    return NextResponse.json({ error: 'Credentials incomplets (Anthropic + Higgsfield requis). Vérifier les Settings.' }, { status: 400 })
  }

  const resourceGroup: ResourceGroup = 'soul_cinematic'

  // Vérifier la disponibilité AVANT de créer le run
  // (si on crée d'abord avec status='running', canStartNow se bloquerait lui-même)
  const canStart = await canStartNow(resourceGroup)

  const run = await prisma.run.create({
    data: {
      userId: session.user.id,
      inputProfiles: JSON.stringify(profiles),
      maxPosts,
      selectedSoulId: soulId,
      selectedElementId: elementId,
      modelSetting: model,
      aspectRatio,
      quality,
      status: canStart ? 'running' : 'queued',
      resourceGroup,
    },
  })

  const workDir = path.join(process.cwd(), '..', 'temp', run.id)

  if (!canStart) {
    // Queue ce run — stocker les params pour le démarrer plus tard
    const queuedParams = {
      scriptModule: 'pipeline.main',
      args: [
        '--profiles', JSON.stringify(profiles),
        '--max-posts', String(maxPosts),
        '--soul-id', soulId,
        '--element-id', elementId,
        '--model', model,
        '--aspect-ratio', aspectRatio,
        '--quality', quality,
        '--work-dir', workDir,
      ],
      env: {
        ...(apifyKey ? { APIFY_KEY: apifyKey } : {}),
        ANTHROPIC_KEY: anthropicKey || '',
        HIGGSFIELD_TOKEN: higgsToken || '',
        ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(instagramSessionCookie ? { INSTAGRAM_SESSION_COOKIE: instagramSessionCookie } : {}),
        ...(scrapingProxyUrl ? { SCRAPING_PROXY_URL: scrapingProxyUrl } : {}),
        ...(hikerApiKey ? { HIKERAPI_TOKEN: hikerApiKey } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
    }
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'queued', queuedParams },
    })
    return NextResponse.json({ runId: run.id, queued: true, message: 'Run en attente — démarrera automatiquement' })
  }

  // Lancer le pipeline Python en subprocess
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.main',
      '--run-id', run.id,
      '--profiles', JSON.stringify(profiles),
      '--max-posts', String(maxPosts),
      '--soul-id', soulId,
      '--element-id', elementId,
      '--model', model,
      '--aspect-ratio', aspectRatio,
      '--quality', quality,
      '--work-dir', workDir,
    ],
    {
      cwd: path.join(process.cwd(), '..'), // root du projet
      env: {
        ...process.env,
        ...(apifyKey ? { APIFY_KEY: apifyKey } : {}),
        ANTHROPIC_KEY: anthropicKey,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(instagramSessionCookie ? { INSTAGRAM_SESSION_COOKIE: instagramSessionCookie } : {}),
        ...(scrapingProxyUrl ? { SCRAPING_PROXY_URL: scrapingProxyUrl } : {}),
        ...(hikerApiKey ? { HIKERAPI_TOKEN: hikerApiKey } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)

  // Lire stdout et mettre à jour la DB en temps réel
  proc.stdout.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[run:${run.id}]`, JSON.stringify(event))
        await handlePipelineEvent(run.id, session.user.id, event)
      } catch {
        // Ligne non JSON (ex: logs Apify colorés) — afficher quand même
        if (line.trim()) console.log(`[run:${run.id}][stdout]`, line)
      }
    }
  })

  // Capturer stderr Python pour debug
  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString()
    // Filtrer les logs Apify colorés (informatifs, pas des erreurs)
    if (!text.includes('apify.instagram-scraper')) {
      console.error(`[run:${run.id}][stderr]`, text.trim())
    }
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
    await onRunComplete(resourceGroup)
  })

  return NextResponse.json({ runId: run.id })
}

// GET /api/run — liste les runs de l'user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const runs = await prisma.run.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      totalPosts: true,
      completedPosts: true,
      failedPosts: true,
      inputProfiles: true,
      modelSetting: true,
    },
  })

  return NextResponse.json(runs)
}

// handlePipelineEvent est maintenant dans @/lib/pipeline-events (partagé avec /api/studio/start)
