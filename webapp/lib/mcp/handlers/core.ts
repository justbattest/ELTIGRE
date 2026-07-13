/**
 * Modelify MCP — outils GÉNÉRIQUES (core).
 *
 * Outils transverses non liés à une feature précise : profil utilisateur,
 * listing des modèles / runs, lecture d'un run et de ses résultats. Tous en
 * lecture seule (coût 0 crédit), sauf `modelify_list_models` qui requiert le
 * scope `accounts:read`.
 *
 * Les outils de GÉNÉRATION (content), de comptes (accounts) et de revenus
 * (revenue) arrivent en Phase 3 dans leurs fichiers respectifs — voir
 * `handlers/index.ts`.
 */

import { prisma } from '@/lib/prisma'
import { getBalance } from '@/lib/credits'
import type { ToolContext, ToolModule } from '../registry'

const str = (a: Record<string, unknown>, k: string): string | undefined =>
  typeof a[k] === 'string' ? (a[k] as string) : undefined

/**
 * Charge un run et vérifie qu'il appartient au caller. Lève une Error
 * (→ renvoyée comme `isError` au client) si le run est introuvable ou détenu
 * par quelqu'un d'autre — l'équivalent MCP d'un 404 / 403.
 */
async function loadOwnedRun(runId: string, ctx: ToolContext) {
  if (!runId) throw new Error('runId requis')
  const run = await prisma.run.findUnique({ where: { id: runId } })
  if (!run) throw new Error(`Run introuvable: ${runId}`)
  if (run.userId !== ctx.userId) {
    throw new Error(`Run non autorisé: ${runId}`)
  }
  return run
}

export const coreTools: ToolModule = {
  specs: [
    {
      name: 'modelify_get_user',
      title: 'Profil utilisateur',
      description:
        "Récupère l'utilisateur Modelify authentifié par la clé API : son id, son solde de crédits et les scopes accordés à la clé. À appeler en premier pour vérifier que la clé est valide.",
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'modelify_list_models',
      title: 'Lister les modèles',
      description:
        "Liste les modèles (les « filles » IA) de l'utilisateur : id, nom, statut, étape courante du parcours et handles (Instagram / Fanvue). Requiert le scope accounts:read.",
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'modelify_list_runs',
      title: 'Lister les runs récents',
      description:
        "Liste les runs de génération récents de l'utilisateur (id, statut, compteurs de posts, date). Filtre optionnel par statut, limite par défaut 20 (max 100).",
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filtre optionnel sur le statut (ex: running, completed, failed).',
          },
          limit: {
            type: 'number',
            description: 'Nombre max de runs (défaut 20, max 100).',
          },
        },
      },
    },
    {
      name: 'modelify_get_run',
      title: "État d'un run",
      description:
        "Retourne le statut et la progression d'un run (totalPosts / completedPosts / failedPosts). Le run doit appartenir à l'utilisateur de la clé.",
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Identifiant du run.' },
        },
        required: ['runId'],
      },
    },
    {
      name: 'modelify_get_results',
      title: "Résultats d'un run",
      description:
        "Retourne les résultats finis d'un run : pour chaque génération aboutie, l'URL de l'image générée, l'URL Drive et le statut. Le run doit appartenir à l'utilisateur de la clé.",
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Identifiant du run.' },
        },
        required: ['runId'],
      },
    },
  ],

  scopes: {
    modelify_list_models: 'accounts:read',
    // get_user / list_runs / get_run / get_results : lecture seule, aucun scope.
  },

  handlers: {
    modelify_get_user: async (_args, ctx) => {
      const creditBalance = await getBalance(ctx.userId)
      return { userId: ctx.userId, creditBalance, scopes: ctx.scopes }
    },

    modelify_list_models: async (_args, ctx) => {
      const models = await prisma.model.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          currentStep: true,
          instagramHandle: true,
          fanvueHandle: true,
          avatarUrl: true,
          createdAt: true,
        },
      })
      return { models }
    },

    modelify_list_runs: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100)
      const status = str(args, 'status')
      const runs = await prisma.run.findMany({
        where: { userId: ctx.userId, ...(status ? { status } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          status: true,
          totalPosts: true,
          completedPosts: true,
          failedPosts: true,
          characterName: true,
          createdAt: true,
        },
      })
      return { runs }
    },

    modelify_get_run: async (args, ctx) => {
      const run = await loadOwnedRun(str(args, 'runId') ?? '', ctx)
      return {
        runId: run.id,
        status: run.status,
        totalPosts: run.totalPosts,
        completedPosts: run.completedPosts,
        failedPosts: run.failedPosts,
        createdAt: run.createdAt,
      }
    },

    modelify_get_results: async (args, ctx) => {
      const run = await loadOwnedRun(str(args, 'runId') ?? '', ctx)
      const results = await prisma.generation.findMany({
        where: {
          runId: run.id,
          OR: [
            { generatedImageUrl: { not: null } },
            { driveGeneratedUrl: { not: null } },
          ],
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          generatedImageUrl: true,
          driveGeneratedUrl: true,
          generationStatus: true,
          slideIndex: true,
        },
      })
      return { runId: run.id, count: results.length, results }
    },
  },
}
