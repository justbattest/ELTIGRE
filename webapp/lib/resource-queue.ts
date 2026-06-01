/**
 * Resource Queue — évite les conflits entre runs qui utilisent les mêmes quotas Higgsfield.
 * soul_cinematic: Scraping + Prompt Studio (max 1 run simultané)
 * seedance: Vidéos Seedance 2.0 (max 1 run simultané)
 * independent: Bulk Edit, Metadata, Carousel, Motion Control (pas de limite)
 */
import { prisma } from '@/lib/prisma'
import { spawn } from 'child_process'
import { runningProcesses } from '@/app/api/run/route'
import * as path from 'path'

export type ResourceGroup = 'soul_cinematic' | 'seedance' | 'independent'

/** Heal zombie runs — runs marqués 'running' depuis >20min sans processus actif */
async function healZombies(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 3 * 60 * 1000) // 3 minutes
    const zombies = await prisma.run.findMany({
      where: { status: 'running', createdAt: { lt: cutoff } },
      select: { id: true, resourceGroup: true },
    })
    for (const z of zombies) {
      // Si aucun process Node actif pour ce run → zombie
      if (!runningProcesses.has(z.id)) {
        await prisma.run.update({ where: { id: z.id }, data: { status: 'failed' } }).catch(() => {})
        console.log(`[resource-queue] Healed zombie run ${z.id}`)
      }
    }
  } catch { /* silencieux */ }
}

/** Vérifie si un groupe peut démarrer maintenant */
export async function canStartNow(group: ResourceGroup): Promise<boolean> {
  if (group === 'independent') return true
  const running = await prisma.run.findFirst({
    where: { status: 'running', resourceGroup: group }
  })
  if (!running) return true
  // Si le run "running" n'a pas de processus actif → zombie → laisser démarrer
  if (!runningProcesses.has(running.id)) {
    await prisma.run.update({ where: { id: running.id }, data: { status: 'failed' } }).catch(() => {})
    return true
  }
  return false
}

/**
 * Scan global — appelé périodiquement ou au démarrage.
 * Heal les zombies et démarre les runs en queue si le slot est libre.
 */
export async function scanAndStartQueued(): Promise<void> {
  await healZombies()
  for (const group of ['soul_cinematic', 'seedance'] as ResourceGroup[]) {
    const free = await canStartNow(group)
    if (free) {
      await onRunComplete(group)
    }
  }
}

/**
 * Appelé quand un run se termine.
 * Cherche le prochain run en queue pour ce groupe et le démarre.
 */
export async function onRunComplete(group: ResourceGroup | null | undefined): Promise<void> {
  if (!group || group === 'independent') return

  try {
    // Chercher le prochain run en queue pour ce groupe (le plus ancien)
    const next = await prisma.run.findFirst({
      where: { status: 'queued', resourceGroup: group },
      orderBy: { createdAt: 'asc' }
    })

    if (!next || !next.queuedParams) return

    const params = next.queuedParams as Record<string, unknown>

    // Marquer comme running
    await prisma.run.update({
      where: { id: next.id },
      data: { status: 'running' }
    })

    // Spawner le subprocess selon le type
    await spawnQueuedRun(next.id, group, params)
  } catch (e) {
    console.error('[resource-queue] onRunComplete error:', e)
  }
}

/** Spawne un run qui était en queue */
async function spawnQueuedRun(
  runId: string,
  group: ResourceGroup,
  params: Record<string, unknown>
): Promise<void> {
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  let cmd: string[]
  let env: Record<string, string> = {}

  if (group === 'soul_cinematic') {
    const scriptModule = params.scriptModule as string || 'pipeline.main'
    cmd = ['-m', scriptModule, '--run-id', runId]

    // Reconstruire les args depuis queuedParams
    const args = params.args as string[] || []
    cmd = cmd.concat(args)
    env = params.env as Record<string, string> || {}
  } else if (group === 'seedance') {
    cmd = ['-m', 'pipeline.video_studio', '--run-id', runId]
    const args = params.args as string[] || []
    cmd = cmd.concat(args)
    env = params.env as Record<string, string> || {}
  } else {
    return
  }

  const proc = spawn(pythonPath, cmd, {
    cwd: projectRoot,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  runningProcesses.set(runId, proc)

  // Import dynamique pour éviter les dépendances circulaires
  const { handlePipelineEvent } = await import('@/lib/pipeline-events')

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        handlePipelineEvent(runId, '', event).catch(() => {})
      } catch {
        if (line.trim()) console.log(`[queue:${runId}][stdout]`, line)
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    console.error(`[queue:${runId}][stderr]`, data.toString().trim().slice(0, 200))
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(runId)
    const status = code === 0 ? 'completed' : 'failed'
    await prisma.run.update({ where: { id: runId }, data: { status } }).catch(() => {})
    await onRunComplete(group)
  })

  proc.on('error', async (err) => {
    console.error(`[queue:${runId}] spawn error:`, err)
    await prisma.run.update({ where: { id: runId }, data: { status: 'failed' } }).catch(() => {})
    runningProcesses.delete(runId)
    await onRunComplete(group)
  })

  console.log(`[resource-queue] Started queued run ${runId} (group: ${group})`)
}
