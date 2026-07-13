/**
 * /mcp — serveur MCP « Modelify ».
 *
 * Expose les features Modelify (génération, comptes, lecture de runs) à des
 * agents externes (Claude, n8n, ...) en JSON-RPC 2.0 sur HTTP. Chaque requête
 * s'authentifie avec une clé API utilisateur (`mk_live_...`) — header
 * `modelify-api-key` (ou `x-api-key`, ou `Authorization: Bearer`). Le serveur
 * est donc nativement multi-tenant : chaque appel est scopé au propriétaire de
 * la clé.
 *
 * Câblage côté client :
 *   claude mcp add --transport http modelify https://<host>/mcp \
 *     --header "modelify-api-key: mk_live_xxx"
 *
 * Pattern repris de PetitPanda (`src/app/mcp/route.ts`), adapté à Prisma +
 * NextAuth + clés API Modelify. Les erreurs d'outil sont renvoyées comme des
 * RÉSULTATS (`isError: true`), pas des erreurs de protocole, pour que l'agent
 * puisse les lire et réagir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyApiKey } from '@/lib/api-keys'
import { listToolSpecs, callTool } from '@/lib/mcp/tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SERVER_INFO = { name: 'modelify', version: '1.0.0' }
const PROTOCOL_VERSION = '2024-11-05'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers':
    'content-type, authorization, modelify-api-key, x-api-key',
}

type Id = string | number | null

function ok(id: Id, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CORS })
}
function rpcError(id: Id, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status, headers: CORS },
  )
}
/** Résultat d'outil MCP (content text + flag isError). */
function toolResult(id: Id, text: string, isError = false) {
  return ok(id, { content: [{ type: 'text', text }], isError })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// Certains clients sondent en GET — on renvoie un petit descripteur.
export async function GET() {
  return NextResponse.json(
    { ...SERVER_INFO, transport: 'http', endpoint: '/mcp' },
    { headers: CORS },
  )
}

export async function POST(req: NextRequest) {
  let msg: { id?: Id; method?: string; params?: Record<string, unknown> }
  try {
    msg = (await req.json()) as typeof msg
  } catch {
    return rpcError(null, -32700, 'Parse error', 400)
  }

  const id: Id = msg.id ?? null
  const method = msg.method
  const params = msg.params ?? {}

  // Notifications — pas de corps de réponse attendu.
  if (
    method === 'notifications/initialized' ||
    method === 'notifications/cancelled'
  ) {
    return new NextResponse(null, { status: 202, headers: CORS })
  }

  // Handshake — aucune auth requise.
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: true } },
      serverInfo: SERVER_INFO,
    })
  }

  // Tout le reste exige une clé API valide. Échec ⇒ résultat isError (pas une
  // erreur de protocole), pour rester lisible côté agent.
  const auth = await verifyApiKey(req)
  if (!auth) {
    return toolResult(id, 'Clé API invalide ou manquante', true)
  }
  const ctx = { userId: auth.userId, scopes: auth.scopes }

  if (method === 'tools/list') {
    return ok(id, { tools: listToolSpecs() })
  }

  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : ''
    const args =
      params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {}
    const result = await callTool(name, args, ctx)
    return toolResult(id, result.text, result.isError)
  }

  return rpcError(id, -32601, `Méthode non supportée: ${method}`)
}
