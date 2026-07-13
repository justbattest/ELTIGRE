/**
 * Modelify — clés API programmatiques.
 *
 * Génération + hashing (SHA-256) + vérification depuis les headers d'une requête.
 * Consommé par le serveur MCP Modelify (`/mcp`) pour que des agents externes
 * (Claude, n8n, ...) agissent au nom d'un utilisateur avec sa propre clé.
 *
 * Les clés sont stockées en base UNIQUEMENT sous forme de hash SHA-256
 * (`api_keys.key_hash`) ; le texte en clair `mk_live_<64 hex>` n'est jamais
 * persisté ni re-affiché après la création. Une clé valide résout vers son
 * propriétaire (userId) + ses scopes.
 *
 * Porté du pattern PetitPanda (`src/lib/api-keys.ts`), adapté à Prisma + NextAuth.
 */

import { createHash, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const API_KEY_PREFIX = 'mk_live_'

export interface GeneratedApiKey {
  /** Clé en clair complète `mk_live_<64 hex>` — à montrer UNE seule fois. */
  key: string
  /** Préfixe affichable sans révéler le secret. */
  prefix: string
  /** SHA-256 hex de la clé en clair — c'est ce qui est stocké en base. */
  hash: string
}

export interface ApiKeyAuth {
  userId: string
  scopes: string[]
  keyId: string
}

/** SHA-256 hex d'une chaîne. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Génère une nouvelle clé API : `mk_live_` + 64 caractères hex (32 octets).
 * Retourne la clé en clair, son préfixe et son hash SHA-256.
 */
export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('hex')}`
  return {
    key,
    prefix: API_KEY_PREFIX,
    hash: hashApiKey(key),
  }
}

/** Lit la clé depuis les headers, par ordre de priorité. */
function extractKey(req: NextRequest): string | null {
  const direct =
    req.headers.get('modelify-api-key') || req.headers.get('x-api-key')
  if (direct) return direct.trim()

  const auth = req.headers.get('authorization')
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i)
    if (m) return m[1].trim()
  }
  return null
}

/**
 * Vérifie une requête entrante : lit la clé dans les headers
 * (`modelify-api-key` → `x-api-key` → `Authorization: Bearer`), la résout par
 * hash en base, rejette les clés expirées, et touche `lastUsedAt` (best-effort).
 *
 * Retourne `{ userId, scopes, keyId }` ou `null` si invalide/expirée.
 */
export async function verifyApiKey(req: NextRequest): Promise<ApiKeyAuth | null> {
  const raw = extractKey(req)
  if (!raw || !raw.startsWith(API_KEY_PREFIX)) return null

  const keyHash = hashApiKey(raw)

  const record = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, scopes: true, expiresAt: true },
  })

  if (!record) return null

  // Rejette les clés expirées (expiresAt null = ne jamais expirer).
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return null
  }

  // Touche lastUsedAt — best-effort, ne bloque jamais la requête.
  void prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})

  return {
    userId: record.userId,
    scopes: Array.isArray(record.scopes) ? record.scopes : [],
    keyId: record.id,
  }
}
