/**
 * GET /api/characters/scan-elements
 * Scanne les Reference Elements Higgsfield depuis DEUX endpoints :
 *
 * 1. /reference-elements  → Elements Seedance video (soul_2) — découvert via DevTools web app
 * 2. /agents/custom-references → Elements Nano Banana image (soul_cinematic)
 *
 * Merge les deux listes et sauvegarde en DB.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

const HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/json',
  'User-Agent': 'higgsfield-cli/0.1.40',
  'Origin': 'https://higgsfield.ai',
  'Referer': 'https://higgsfield.ai/',
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const token = decryptIfPresent(creds?.higgsFieldToken)
  if (!token) {
    return NextResponse.json({ error: 'Higgsfield non connecté' }, { status: 400 })
  }

  const allScanned: { id: string; name: string; type: string }[] = []

  // ── 1. Reference Elements (Seedance video) ──────────────────────────────────
  try {
    const res = await fetch('https://fnf.higgsfield.ai/reference-elements', {
      headers: HEADERS(token),
    })
    if (res.ok) {
      const data = await res.json()
      // La réponse peut être un array direct ou { items: [...] } ou { data: [...] }
      const raw: { id: string; name?: string; title?: string; status?: string; type?: string }[] =
        Array.isArray(data) ? data : (data.items ?? data.data ?? [])
      for (const i of raw) {
        if (i.id && (i.name || i.title)) {
          allScanned.push({
            id: i.id,
            name: (i.name || i.title || 'Element').trim(),
            type: i.type ?? 'soul_2',  // reference-elements = soul_2 par défaut
          })
        }
      }
    }
  } catch {
    // Non-fatal — on continue avec custom-references
  }

  // ── 2. Custom References (Nano Banana image) ────────────────────────────────
  try {
    const res = await fetch('https://fnf.higgsfield.ai/agents/custom-references', {
      headers: HEADERS(token),
    })
    if (res.ok) {
      const data = await res.json()
      const raw: { id: string; name: string; type: string; status: string }[] =
        (data.items ?? []).filter((i: { status: string }) => i.status === 'completed')
      for (const i of raw) {
        // Éviter les doublons (même UUID déjà dans reference-elements)
        if (!allScanned.some(s => s.id === i.id)) {
          allScanned.push({ id: i.id, name: i.name, type: i.type })
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // ── Merge avec les éléments existants en DB ─────────────────────────────────
  const existing: { id: string; name: string; type?: string }[] = creds?.referenceElements
    ? JSON.parse(creds.referenceElements)
    : []

  const merged = [
    ...allScanned,
    ...existing.filter(e => !allScanned.some(s => s.id === e.id)),
  ]

  await prisma.userCredentials.update({
    where: { userId: session.user.id },
    data: { referenceElements: JSON.stringify(merged) },
  })

  return NextResponse.json({ elements: merged, scanned: allScanned.length })
}
