/**
 * GET /api/refset/image/[runId]/[name] — sert une image PNG générée du set de référence.
 * Lit depuis le workDir en mémoire du run (auto-nettoyé). Garde anti path-traversal.
 */
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { refsetRuns } from '@/lib/refset-state'
import * as path from 'path'
import * as fs from 'fs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string; name: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Non authentifié', { status: 401 })

  const { runId, name } = await params
  const state = refsetRuns.get(runId)
  if (!state) return new Response('Run introuvable', { status: 404 })
  if (state.userId !== session.user.id) return new Response('Accès refusé', { status: 403 })

  // Anti path-traversal : on n'autorise qu'un basename simple
  const safe = path.basename(name)
  if (safe !== name || safe.includes('..')) return new Response('Nom invalide', { status: 400 })

  const filePath = path.join(state.workDir, safe)
  if (!fs.existsSync(filePath)) return new Response('Image introuvable', { status: 404 })

  const buf = fs.readFileSync(filePath)
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  })
}
