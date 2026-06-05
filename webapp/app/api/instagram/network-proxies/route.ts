/**
 * GET  /api/instagram/network-proxies  → retourne les proxies configurés par réseau
 * POST /api/instagram/network-proxies  → sauvegarde les proxies par réseau
 *
 * Format stocké : JSON {"iPhone 12promax": "http://user:pass@host:port", ...}
 * 1 proxy par téléphone = 1 proxy pour les 3 comptes qui partagent ce réseau
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { networkProxies: true },
  })

  let proxies: Record<string, string> = {}
  if (creds?.networkProxies) {
    try { proxies = JSON.parse(creds.networkProxies) } catch { /* ignore */ }
  }

  return NextResponse.json({ proxies })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { proxies } = await req.json()
  // proxies = { "iPhone 12promax": "http://...", "iPhone 15promax": "" }

  if (typeof proxies !== 'object') {
    return NextResponse.json({ error: 'proxies doit être un objet' }, { status: 400 })
  }

  // Nettoyer les valeurs vides
  const cleaned: Record<string, string> = {}
  for (const [network, url] of Object.entries(proxies)) {
    if (url && typeof url === 'string' && url.trim()) {
      cleaned[network] = url.trim()
    }
  }

  await prisma.userCredentials.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, networkProxies: JSON.stringify(cleaned) },
    update: { networkProxies: JSON.stringify(cleaned) },
  })

  return NextResponse.json({ ok: true, saved: Object.keys(cleaned).length })
}
