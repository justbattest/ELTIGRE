/**
 * Modelify MCP — outils REVENUS (revenue).
 *
 * S'appuie sur la table `model_revenues` (modèle Prisma `ModelRevenue`) :
 *   modelId, userId, amount (Float), currency (défaut EUR), source
 *   (fanvue|tips|other), periodMonth ("YYYY-MM"), note.
 *
 * Ces trois outils CONSTITUENT le dashboard revenus v1 : ils lisent/écrivent
 * réellement la table — rien n'est stubé. Toute lecture/écriture est cloisonnée
 * à `ctx.userId`, et l'écriture vérifie la propriété du modèle.
 *
 * Scopes : lecture = accounts:read, écriture = accounts:write.
 */

import { prisma } from '@/lib/prisma'
import type { ToolContext, ToolModule } from '../registry'

const str = (a: Record<string, unknown>, k: string): string | undefined =>
  typeof a[k] === 'string' ? (a[k] as string) : undefined

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** Vérifie qu'un modèle existe et appartient au caller. */
async function assertOwnedModel(modelId: string, ctx: ToolContext) {
  if (!modelId) throw new Error('modelId requis')
  const model = await prisma.model.findUnique({ where: { id: modelId } })
  if (!model) throw new Error(`Modèle introuvable: ${modelId}`)
  if (model.userId !== ctx.userId) throw new Error(`Modèle non autorisé: ${modelId}`)
  return model
}

export const revenueTools: ToolModule = {
  specs: [
    {
      name: 'modelify_list_revenue',
      title: 'Lister les revenus',
      description:
        "Liste les lignes de revenu de l'utilisateur (id, modelId, amount, currency, source, periodMonth, note, date), triées de la plus récente à la plus ancienne. Filtres optionnels : modelId, periodMonth (format YYYY-MM). limit défaut 50 (max 200). Requiert le scope accounts:read.",
      inputSchema: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'Filtre sur un modèle précis (optionnel).' },
          periodMonth: { type: 'string', description: 'Filtre sur un mois au format YYYY-MM (optionnel).' },
          limit: { type: 'number', description: 'Nombre max de lignes (défaut 50, max 200).' },
        },
      },
    },
    {
      name: 'modelify_record_revenue',
      title: 'Enregistrer un revenu',
      description:
        "Enregistre une ligne de revenu pour un modèle de l'utilisateur. Requis : modelId (propriété vérifiée), amount (montant brut > 0), periodMonth (YYYY-MM). Optionnel : currency (défaut EUR), source (fanvue|tips|other, défaut fanvue), note. Requiert le scope accounts:write.",
      inputSchema: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'Modèle concerné (obligatoire).' },
          amount: { type: 'number', description: 'Montant brut, > 0 (obligatoire).' },
          periodMonth: { type: 'string', description: 'Mois de la période, format YYYY-MM (obligatoire).' },
          currency: { type: 'string', description: 'Devise, ex: EUR/USD (défaut EUR).' },
          source: { type: 'string', description: 'fanvue|tips|other (défaut fanvue).' },
          note: { type: 'string', description: 'Note libre (optionnel).' },
        },
        required: ['modelId', 'amount', 'periodMonth'],
      },
    },
    {
      name: 'modelify_revenue_summary',
      title: 'Synthèse des revenus',
      description:
        "Agrège les revenus de l'utilisateur : total net par modèle (avec nom du modèle), total net par mois (periodMonth), et grand total global. C'est la lecture « dashboard » légère. Requiert le scope accounts:read.",
      inputSchema: { type: 'object', properties: {} },
    },
  ],

  scopes: {
    modelify_list_revenue: 'accounts:read',
    modelify_revenue_summary: 'accounts:read',
    modelify_record_revenue: 'accounts:write',
  },

  handlers: {
    modelify_list_revenue: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200)
      const modelId = str(args, 'modelId')
      const periodMonth = str(args, 'periodMonth')

      const rows = await prisma.modelRevenue.findMany({
        where: {
          userId: ctx.userId,
          ...(modelId ? { modelId } : {}),
          ...(periodMonth ? { periodMonth } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          modelId: true,
          amount: true,
          currency: true,
          source: true,
          periodMonth: true,
          note: true,
          createdAt: true,
        },
      })
      return { revenues: rows }
    },

    modelify_record_revenue: async (args, ctx) => {
      await assertOwnedModel(str(args, 'modelId') ?? '', ctx)

      const amount = Number(args.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('amount doit être un nombre strictement positif')
      }
      const periodMonth = str(args, 'periodMonth')
      if (!periodMonth || !PERIOD_RE.test(periodMonth)) {
        throw new Error('periodMonth requis au format YYYY-MM (ex: 2026-06)')
      }

      const revenue = await prisma.modelRevenue.create({
        data: {
          modelId: str(args, 'modelId')!,
          userId: ctx.userId,
          amount,
          currency: str(args, 'currency')?.trim() || 'EUR',
          source: str(args, 'source')?.trim() || 'fanvue',
          periodMonth,
          note: str(args, 'note')?.trim() || null,
        },
        select: {
          id: true,
          modelId: true,
          amount: true,
          currency: true,
          source: true,
          periodMonth: true,
          note: true,
          createdAt: true,
        },
      })
      return { revenue }
    },

    modelify_revenue_summary: async (_args, ctx) => {
      const [byModel, byMonth, total, models] = await Promise.all([
        prisma.modelRevenue.groupBy({
          by: ['modelId'],
          where: { userId: ctx.userId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.modelRevenue.groupBy({
          by: ['periodMonth'],
          where: { userId: ctx.userId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.modelRevenue.aggregate({
          where: { userId: ctx.userId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
        prisma.model.findMany({
          where: { userId: ctx.userId },
          select: { id: true, name: true },
        }),
      ])

      const nameById = new Map(models.map((m) => [m.id, m.name]))

      const perModel = byModel
        .map((r) => ({
          modelId: r.modelId,
          modelName: nameById.get(r.modelId) ?? null,
          total: r._sum.amount ?? 0,
          entries: r._count._all,
        }))
        .sort((a, b) => b.total - a.total)

      const perMonth = byMonth
        .map((r) => ({
          periodMonth: r.periodMonth,
          total: r._sum.amount ?? 0,
          entries: r._count._all,
        }))
        .sort((a, b) => (a.periodMonth < b.periodMonth ? 1 : -1))

      return {
        grandTotal: total._sum.amount ?? 0,
        totalEntries: total._count._all,
        perModel,
        perMonth,
      }
    },
  },
}
