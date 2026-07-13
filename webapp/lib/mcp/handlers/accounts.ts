/**
 * Modelify MCP — outils COMPTES (accounts).
 *
 * Outils de gestion des modèles (la « fille » IA), de leurs comptes Instagram
 * et de la planification de posts. Miroir 1:1 des routes web :
 *   - app/api/instagram/accounts/route.ts        (liste / ajout compte IG)
 *   - app/api/instagram/accounts/[id]/route.ts   (update compte IG)
 *   - app/api/instagram/posts/route.ts           (liste / planification + jitter anti-bot)
 *   - app/api/kpi/route.ts                        (dashboard)
 *
 * Scopes : lecture = accounts:read, mutations = accounts:write.
 * Toute lecture/écriture est cloisonnée à `ctx.userId` (équivalent 404/403).
 *
 * NB : `modelify_list_models` vit déjà dans core.ts — il n'est PAS redéfini ici.
 */

import { prisma } from '@/lib/prisma'
import { encryptIfPresent } from '@/lib/crypto'
import type { ToolContext, ToolModule } from '../registry'

const str = (a: Record<string, unknown>, k: string): string | undefined =>
  typeof a[k] === 'string' ? (a[k] as string) : undefined

const trimmed = (a: Record<string, unknown>, k: string): string | undefined => {
  const v = str(a, k)
  const t = v?.trim()
  return t ? t : undefined
}

/**
 * Charge un modèle et vérifie qu'il appartient au caller. Lève une Error
 * (→ renvoyée comme `isError` au client) si introuvable ou détenu par un tiers.
 */
async function loadOwnedModel(modelId: string, ctx: ToolContext) {
  if (!modelId) throw new Error('modelId requis')
  const model = await prisma.model.findUnique({ where: { id: modelId } })
  if (!model) throw new Error(`Modèle introuvable: ${modelId}`)
  if (model.userId !== ctx.userId) throw new Error(`Modèle non autorisé: ${modelId}`)
  return model
}

/** Sélection « safe » d'un modèle (pas de secrets chiffrés). */
const MODEL_SELECT = {
  id: true,
  name: true,
  status: true,
  currentStep: true,
  stepState: true,
  avatarUrl: true,
  gmailAddress: true,
  instagramHandle: true,
  fanvueHandle: true,
  phoneLabel: true,
  phoneNumber: true,
  higgsfieldCharacterName: true,
  higgsfieldSoulId: true,
  higgsfieldElementId: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const

export const accountTools: ToolModule = {
  specs: [
    {
      name: 'modelify_create_model',
      title: 'Créer un modèle',
      description:
        "Crée un nouveau modèle (une « fille » IA) pour l'utilisateur. Requis : name. Optionnel : gmailAddress, instagramHandle, fanvueHandle, phoneLabel, phoneNumber, higgsfieldCharacterName, avatarUrl, notes. Le modèle démarre au statut 'creating', étape 1. Requiert le scope accounts:write.",
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du modèle (obligatoire).' },
          gmailAddress: { type: 'string', description: 'Adresse Gmail dédiée (optionnel).' },
          instagramHandle: { type: 'string', description: 'Handle Instagram, ex: @ma_modele (optionnel).' },
          fanvueHandle: { type: 'string', description: 'Handle Fanvue (optionnel).' },
          phoneLabel: { type: 'string', description: 'Device / SIM physique associé (optionnel).' },
          phoneNumber: { type: 'string', description: 'Numéro de téléphone, ex: TextVerified (optionnel).' },
          higgsfieldCharacterName: { type: 'string', description: 'Nom du personnage Higgsfield lié (optionnel).' },
          avatarUrl: { type: 'string', description: 'URL de la photo de profil (optionnel).' },
          notes: { type: 'string', description: 'Notes libres (optionnel).' },
        },
        required: ['name'],
      },
    },
    {
      name: 'modelify_update_model',
      title: 'Mettre à jour un modèle',
      description:
        "Met à jour les champs d'un modèle existant (par id, propriété de l'utilisateur) : name, status, currentStep (1..6), stepState (objet de progression), et tous les champs d'identité/Higgsfield. Seuls les champs fournis sont modifiés. Requiert le scope accounts:write.",
      inputSchema: {
        type: 'object',
        properties: {
          modelId: { type: 'string', description: 'Identifiant du modèle à mettre à jour.' },
          name: { type: 'string' },
          status: {
            type: 'string',
            description: 'creating|content|accounts|launched|monetizing|paused|archived.',
          },
          currentStep: { type: 'number', description: 'Étape courante du parcours (1..6).' },
          stepState: {
            type: 'object',
            description: 'Objet de progression des sous-étapes (remplace stepState).',
          },
          gmailAddress: { type: 'string' },
          instagramHandle: { type: 'string' },
          fanvueHandle: { type: 'string' },
          phoneLabel: { type: 'string' },
          phoneNumber: { type: 'string' },
          higgsfieldCharacterName: { type: 'string' },
          higgsfieldSoulId: { type: 'string' },
          higgsfieldElementId: { type: 'string' },
          avatarUrl: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['modelId'],
      },
    },
    {
      name: 'modelify_list_instagram_accounts',
      title: 'Lister les comptes Instagram',
      description:
        "Liste les comptes Instagram de l'utilisateur : username, networkName, characterName, warmupPhase (1..4), status (warmup|active|challenge|banned|suspended), postsToday, lastPostedAt. Ne renvoie jamais de credentials. Requiert le scope accounts:read.",
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'modelify_add_instagram_account',
      title: 'Ajouter un compte Instagram',
      description:
        "Ajoute un compte Instagram. Requis : username, networkName (ex: iPhone_SIM1). Optionnel : password, totpSecret (secret base32 2FA), characterName, warmupPhase (défaut 1). Les credentials sont chiffrés (AES-256) avant stockage et JAMAIS renvoyés. Rejette les doublons de username. Requiert le scope accounts:write.",
      inputSchema: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Identifiant Instagram (obligatoire).' },
          networkName: { type: 'string', description: 'Réseau / device, ex: iPhone_SIM1 (obligatoire).' },
          password: { type: 'string', description: 'Mot de passe (chiffré au repos, optionnel).' },
          totpSecret: { type: 'string', description: 'Secret base32 Google Authenticator (chiffré, optionnel).' },
          characterName: { type: 'string', description: 'Nom du personnage Higgsfield lié (optionnel).' },
          warmupPhase: { type: 'number', description: 'Phase de chauffe 1..4 (défaut 1).' },
        },
        required: ['username', 'networkName'],
      },
    },
    {
      name: 'modelify_schedule_instagram_post',
      title: 'Planifier un post Instagram',
      description:
        "Planifie un post sur un compte Instagram. Requis : accountId (propriété de l'utilisateur) + au moins une source média (driveFileUrl, driveFileId, mediaUrl ou driveFilesJson pour un carousel). Optionnel : caption, mediaType (reel|photo, défaut reel), scheduledFor (ISO 8601). Anti-bot : si scheduledFor tombe pile sur H:00 ou H:30, l'heure est décalée de ±7 à ±23 min. Refuse les comptes banned/challenge. Le post est créé au statut 'pending'. Requiert le scope accounts:write.",
      inputSchema: {
        type: 'object',
        properties: {
          accountId: { type: 'string', description: 'Identifiant du compte Instagram cible.' },
          driveFileUrl: { type: 'string', description: 'URL Google Drive partageable du média.' },
          driveFileId: { type: 'string', description: 'ID du fichier Google Drive.' },
          mediaUrl: { type: 'string', description: 'Alias de driveFileUrl (URL média directe).' },
          driveFilesJson: { type: 'string', description: 'JSON array d\'URLs pour un carousel.' },
          caption: { type: 'string', description: 'Légende du post (optionnel).' },
          mediaType: { type: 'string', description: 'reel|photo (défaut reel).' },
          scheduledFor: { type: 'string', description: 'Date/heure de publication ISO 8601 (optionnel).' },
        },
        required: ['accountId'],
      },
    },
    {
      name: 'modelify_list_instagram_posts',
      title: 'Lister les posts planifiés',
      description:
        "Liste les posts Instagram planifiés de l'utilisateur, triés par scheduledFor. Filtres optionnels : status (pending|processing|posted|failed|cancelled), accountId. limit défaut 20 (max 100). Requiert le scope accounts:read.",
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filtre statut (pending|processing|posted|failed|cancelled).' },
          accountId: { type: 'string', description: 'Filtre sur un compte précis.' },
          limit: { type: 'number', description: 'Nombre max de posts (défaut 20, max 100).' },
        },
      },
    },
    {
      name: 'modelify_kpi',
      title: 'Dashboard KPI',
      description:
        "Retourne un résumé tableau de bord de l'utilisateur : répartition des comptes Instagram par statut, comptage des posts planifiés par statut, et squelette revenus (total + nombre d'entrées model_revenues). Requiert le scope accounts:read.",
      inputSchema: { type: 'object', properties: {} },
    },
  ],

  scopes: {
    modelify_create_model: 'accounts:write',
    modelify_update_model: 'accounts:write',
    modelify_add_instagram_account: 'accounts:write',
    modelify_schedule_instagram_post: 'accounts:write',
    modelify_list_instagram_accounts: 'accounts:read',
    modelify_list_instagram_posts: 'accounts:read',
    modelify_kpi: 'accounts:read',
  },

  handlers: {
    modelify_create_model: async (args, ctx) => {
      const name = trimmed(args, 'name')
      if (!name) throw new Error('name requis')

      const model = await prisma.model.create({
        data: {
          userId: ctx.userId,
          name,
          gmailAddress: trimmed(args, 'gmailAddress') ?? null,
          instagramHandle: trimmed(args, 'instagramHandle') ?? null,
          fanvueHandle: trimmed(args, 'fanvueHandle') ?? null,
          phoneLabel: trimmed(args, 'phoneLabel') ?? null,
          phoneNumber: trimmed(args, 'phoneNumber') ?? null,
          higgsfieldCharacterName: trimmed(args, 'higgsfieldCharacterName') ?? null,
          avatarUrl: trimmed(args, 'avatarUrl') ?? null,
          notes: trimmed(args, 'notes') ?? null,
        },
        select: MODEL_SELECT,
      })
      return { model }
    },

    modelify_update_model: async (args, ctx) => {
      const model = await loadOwnedModel(str(args, 'modelId') ?? '', ctx)

      const data: Record<string, unknown> = {}
      if (args.name !== undefined) {
        const name = trimmed(args, 'name')
        if (!name) throw new Error('name ne peut pas être vide')
        data.name = name
      }
      if (args.status !== undefined) data.status = str(args, 'status')
      if (args.currentStep !== undefined) {
        const step = Number(args.currentStep)
        if (!Number.isFinite(step)) throw new Error('currentStep doit être un nombre')
        data.currentStep = step
      }
      if (args.stepState !== undefined) {
        if (typeof args.stepState !== 'object' || args.stepState === null || Array.isArray(args.stepState)) {
          throw new Error('stepState doit être un objet')
        }
        data.stepState = args.stepState
      }
      for (const k of [
        'gmailAddress',
        'instagramHandle',
        'fanvueHandle',
        'phoneLabel',
        'phoneNumber',
        'higgsfieldCharacterName',
        'higgsfieldSoulId',
        'higgsfieldElementId',
        'avatarUrl',
        'notes',
      ] as const) {
        if (args[k] !== undefined) data[k] = str(args, k) ?? null
      }

      if (Object.keys(data).length === 0) throw new Error('Aucun champ à mettre à jour')

      const updated = await prisma.model.update({
        where: { id: model.id },
        data,
        select: MODEL_SELECT,
      })
      return { model: updated }
    },

    modelify_list_instagram_accounts: async (_args, ctx) => {
      const accounts = await prisma.instagramAccount.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          username: true,
          networkName: true,
          characterName: true,
          warmupPhase: true,
          status: true,
          lastPostedAt: true,
          postsToday: true,
          postsTodayDate: true,
          createdAt: true,
        },
      })
      return { accounts }
    },

    modelify_add_instagram_account: async (args, ctx) => {
      const username = trimmed(args, 'username')
      if (!username) throw new Error('username requis')
      const networkName = trimmed(args, 'networkName')
      if (!networkName) throw new Error('networkName requis (ex: iPhone_SIM1)')

      const existing = await prisma.instagramAccount.findFirst({
        where: { userId: ctx.userId, username },
      })
      if (existing) throw new Error(`Le compte @${username} existe déjà`)

      const warmupPhase = args.warmupPhase !== undefined ? Number(args.warmupPhase) : 1
      if (!Number.isFinite(warmupPhase)) throw new Error('warmupPhase doit être un nombre')

      const account = await prisma.instagramAccount.create({
        data: {
          userId: ctx.userId,
          username,
          passwordEnc: encryptIfPresent(str(args, 'password') ?? null),
          totpSecret: encryptIfPresent(trimmed(args, 'totpSecret') ?? null),
          characterName: trimmed(args, 'characterName') ?? null,
          networkName,
          warmupPhase,
          status: 'warmup',
        },
        select: {
          id: true,
          username: true,
          networkName: true,
          characterName: true,
          warmupPhase: true,
          status: true,
          createdAt: true,
        },
      })
      // Ne JAMAIS renvoyer password / totpSecret.
      return { account }
    },

    modelify_schedule_instagram_post: async (args, ctx) => {
      const accountId = str(args, 'accountId')
      if (!accountId) throw new Error('accountId requis')

      const driveFileId = trimmed(args, 'driveFileId')
      // mediaUrl est un alias de driveFileUrl côté agent.
      const driveFileUrl = trimmed(args, 'driveFileUrl') ?? trimmed(args, 'mediaUrl')
      const driveFilesJson = trimmed(args, 'driveFilesJson')
      if (!driveFileId && !driveFileUrl && !driveFilesJson) {
        throw new Error('driveFileId, driveFileUrl, mediaUrl ou driveFilesJson requis')
      }

      const account = await prisma.instagramAccount.findFirst({
        where: { id: accountId, userId: ctx.userId },
      })
      if (!account) throw new Error('Compte introuvable')
      if (account.status === 'banned') throw new Error(`Le compte @${account.username} est banni`)
      if (account.status === 'challenge') {
        throw new Error(`Le compte @${account.username} nécessite une vérification manuelle`)
      }

      // Anti-bot : décaler si l'heure tombe pile sur H:00 ou H:30.
      let finalScheduledFor: Date | null = null
      const scheduledFor = str(args, 'scheduledFor')
      if (scheduledFor) {
        const d = new Date(scheduledFor)
        if (Number.isNaN(d.getTime())) throw new Error('scheduledFor invalide (attendu ISO 8601)')
        const minutes = d.getMinutes()
        if (minutes === 0 || minutes === 30) {
          const offset = Math.floor(Math.random() * 17) + 7 // 7..23
          const sign = Math.random() < 0.5 ? 1 : -1
          d.setMinutes(d.getMinutes() + sign * offset)
        }
        finalScheduledFor = d
      }

      const post = await prisma.instagramPost.create({
        data: {
          userId: ctx.userId,
          accountId,
          driveFileId: driveFileId ?? null,
          driveFileUrl: driveFileUrl ?? null,
          driveFilesJson: driveFilesJson ?? null,
          caption: trimmed(args, 'caption') ?? null,
          mediaType: trimmed(args, 'mediaType') ?? 'reel',
          scheduledFor: finalScheduledFor,
          status: 'pending',
        },
        select: {
          id: true,
          status: true,
          scheduledFor: true,
          mediaType: true,
          accountId: true,
        },
      })
      return { post }
    },

    modelify_list_instagram_posts: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100)
      const status = str(args, 'status')
      const accountId = str(args, 'accountId')

      const posts = await prisma.instagramPost.findMany({
        where: {
          userId: ctx.userId,
          ...(status ? { status } : {}),
          ...(accountId ? { accountId } : {}),
        },
        orderBy: { scheduledFor: 'asc' },
        take: limit,
        select: {
          id: true,
          status: true,
          mediaType: true,
          caption: true,
          scheduledFor: true,
          postedAt: true,
          driveFileUrl: true,
          driveFilesJson: true,
          createdAt: true,
          account: {
            select: { id: true, username: true, networkName: true, warmupPhase: true, status: true },
          },
        },
      })
      return { posts }
    },

    modelify_kpi: async (_args, ctx) => {
      const [accountsByStatus, postsByStatus, revenueAgg] = await Promise.all([
        prisma.instagramAccount.groupBy({
          by: ['status'],
          where: { userId: ctx.userId },
          _count: { _all: true },
        }),
        prisma.instagramPost.groupBy({
          by: ['status'],
          where: { userId: ctx.userId },
          _count: { _all: true },
        }),
        prisma.modelRevenue.aggregate({
          where: { userId: ctx.userId },
          _sum: { amount: true },
          _count: { _all: true },
        }),
      ])

      const accounts: Record<string, number> = {}
      for (const row of accountsByStatus) accounts[row.status] = row._count._all
      const posts: Record<string, number> = {}
      for (const row of postsByStatus) posts[row.status] = row._count._all

      return {
        accounts: {
          total: accountsByStatus.reduce((s, r) => s + r._count._all, 0),
          byStatus: accounts,
        },
        posts: {
          total: postsByStatus.reduce((s, r) => s + r._count._all, 0),
          byStatus: posts,
        },
        revenue: {
          entries: revenueAgg._count._all,
          totalAmount: revenueAgg._sum.amount ?? 0,
        },
      }
    },
  },
}
