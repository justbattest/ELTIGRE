/**
 * Modelify MCP — lanceur de runs de pipeline (factorisation partagée).
 *
 * Tous les outils de génération (`handlers/content.ts`) lancent un subprocess
 * Python `pipeline.<module>` exactement comme les routes `/api/.../start` du
 * webapp (cf. `app/api/video/start/route.ts`, le pattern canonique) : on crée
 * un `Run` en DB pour le suivi de statut, on spawn le process avec le bon
 * environnement, on l'enregistre dans `runningProcesses` (pour pause/stop), on
 * écrit le PID, et on branche les handlers stdout(JSON-lines → handlePipelineEvent)
 * / stderr / close (statut terminal sur close, comme video/start).
 *
 * Ce module factorise CE bloc une seule fois pour que chaque handler reste de
 * l'ordre de ~10 lignes (validation + crédits + appel).
 *
 * ── Familles de pipelines ────────────────────────────────────────────────────
 *  • DB-backed (video_studio, studio, main, bulk_edit, motion_control) :
 *    émettent des events `generation`/`done` que `handlePipelineEvent` matérialise
 *    en `Generation` → VISIBLES via `modelify_get_run` / `modelify_get_results`.
 *  • In-memory (model_refset, model_enhance, carousel_creator, carousel_variations,
 *    metadata_batch, spoofer) : émettent leurs propres formes d'events vers des
 *    Maps en mémoire (refsetRuns, carouselRuns, …) et NON vers la table
 *    `Generation`. On crée quand même le `Run` DB pour le suivi de statut (running
 *    → completed/failed sur close + event `done`), mais leurs résultats ne
 *    remontent PAS dans `modelify_get_results`. C'est documenté outil par outil.
 *
 * `handlePipelineEvent` est résilient : il ne réagit qu'aux types qu'il connaît
 * (`generation`, `done`, `phase`, …) et ignore les autres. On peut donc faire
 * passer les events de tous les pipelines à travers lui sans risque.
 */

import { spawn } from 'child_process'
import * as path from 'path'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { runningProcesses, writePidFile, deletePidFile } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

/** Dictionnaire d'environnement (valeurs `undefined` ignorées au merge). */
export type EnvLike = Record<string, string | undefined>

export interface SpawnPipelineRunOptions {
  /** Propriétaire du run (ctx.userId). */
  userId: string
  /** Nom du module Python sous `pipeline.` (ex: `video_studio`, `model_refset`). */
  module: string
  /**
   * Arguments passés APRÈS `-m pipeline.<module>`.
   *  • Forme tableau : `--run-id <runId>` est inséré automatiquement en tête.
   *  • Forme fonction : reçoit le `runId` (cuid du `Run` créé) et retourne la
   *    liste COMPLÈTE d'arguments (aucun `--run-id` auto). À utiliser quand les
   *    arguments dépendent du runId (fichier temp, dossier de travail,
   *    storage-prefix…) ou nécessitent une sous-commande (`generate …`).
   */
  args: string[] | ((runId: string) => string[] | Promise<string[]>)
  /** Variables d'env supplémentaires (mergées par-dessus `process.env`). */
  extraEnv?: EnvLike | ((runId: string) => EnvLike)
  /** Champs additionnels du `Run` créé (maxPosts, modelSetting, characterName…). */
  runData?: Partial<Omit<Prisma.RunCreateInput, 'user'>>
  /** Préfixe de log (défaut = `module`). */
  label?: string
}

/**
 * Crée le `Run` DB, lance le subprocess Python et branche les handlers d'events.
 * Retourne `{ runId }` immédiatement (exécution asynchrone — le statut se suit
 * via `modelify_get_run`).
 */
export async function spawnPipelineRun(
  opts: SpawnPipelineRunOptions,
): Promise<{ runId: string }> {
  const { userId, module, args, extraEnv, runData, label } = opts
  const tag = label || module

  // 1) Run DB (suivi de statut, propriété, get_run/get_results).
  const run = await prisma.run.create({
    data: {
      inputProfiles: '[]',
      status: 'running',
      ...(runData ?? {}),
      user: { connect: { id: userId } },
    } as Prisma.RunCreateInput,
  })

  // 2) Construire argv + env (résolus après création du run → runId dispo).
  const projectRoot = path.join(process.cwd(), '..')
  const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python')

  const rawArgs =
    typeof args === 'function' ? await args(run.id) : ['--run-id', run.id, ...args]
  const argv = ['-m', `pipeline.${module}`, ...rawArgs]

  const resolvedEnv = typeof extraEnv === 'function' ? extraEnv(run.id) : extraEnv
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const [k, v] of Object.entries(resolvedEnv ?? {})) {
    if (v !== undefined) env[k] = v
  }

  // 3) Spawn + enregistrement (pause/stop) + PID.
  const proc = spawn(pythonPath, argv, {
    cwd: projectRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)
  attachProcessHandlers(proc, run.id, userId, tag)

  return { runId: run.id }
}

/**
 * Handlers d'events du subprocess — copie conforme de `video/start` :
 * stdout JSON-lines → `handlePipelineEvent`, stderr loggé, statut terminal au
 * `close` (completed si exit 0, failed sinon) si le run est encore `running`.
 */
function attachProcessHandlers(
  proc: ReturnType<typeof spawn>,
  runId: string,
  userId: string,
  tag: string,
) {
  proc.stdout!.on('data', async (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[${tag}:${runId}]`, JSON.stringify(event))
        await handlePipelineEvent(runId, userId, event)
      } catch {
        if (line.trim()) console.log(`[${tag}:${runId}][stdout]`, line)
      }
    }
  })

  proc.stderr!.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[${tag}:${runId}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[${tag}:${runId}] spawn error:`, err)
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
