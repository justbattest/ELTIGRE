/**
 * GET /api/characters/scan-elements
 * Scanne les custom references Higgsfield via l'API fnf.higgsfield.ai
 * et retourne la liste avec id, name, type, thumbnail_url.
 *
 * Endpoint découvert dans le binaire CLI : /agents/custom-references
 * Retourne soul_cinematic, soul_2 — utilisables comme <<<element_id>>> dans les prompts.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

const HIGGS_API = 'https://fnf.higgsfield.ai/agents/custom-references'

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

  try {
    const res = await fetch(HIGGS_API, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'higgsfield-cli/0.1.40',
      },
      // Node.js 18+ : ignorer les erreurs SSL (même env que le CLI)
      // @ts-expect-error — dispatcher non typé dans les types de base
      dispatcher: undefined,
    })

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: `Higgsfield API error ${res.status}: ${body.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    const items: { id: string; name: string; type: string; status: string; thumbnail_url?: string }[] =
      (data.items ?? []).filter((i: { status: string }) => i.status === 'completed')

    // ── Sauvegarder automatiquement en DB ───────────────────────────────────
    // Merge avec les éléments existants (évite de perdre les entrées manuelles)
    const existing: { id: string; name: string }[] = creds?.referenceElements
      ? JSON.parse(creds.referenceElements)
      : []

    const scanned = items.map(i => ({ id: i.id, name: i.name, type: i.type }))

    // Déduplique par id : les éléments scannés écrasent les existants si même id
    const merged = [
      ...scanned,
      ...existing.filter(e => !scanned.some(s => s.id === e.id)),
    ]

    await prisma.userCredentials.update({
      where: { userId: session.user.id },
      data: { referenceElements: JSON.stringify(merged) },
    })

    return NextResponse.json({ elements: merged, scanned: scanned.length })

  } catch (e) {
    return NextResponse.json({ error: `Erreur réseau: ${String(e).slice(0, 200)}` }, { status: 500 })
  }
}
