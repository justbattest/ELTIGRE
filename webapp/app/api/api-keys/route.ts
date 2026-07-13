/**
 * /api/api-keys — gestion des clés API Modelify (auth par session NextAuth).
 *
 * POST   : génère une nouvelle clé, stocke son hash, renvoie le texte en clair
 *          UNE seule fois.
 * GET    : liste les clés de l'appelant (jamais le clair ni le hash).
 * DELETE : révoque une clé par id (scopée à l'appelant).
 *
 * Porté du pattern PetitPanda `src/app/api/api-keys/route.ts`, adapté à
 * Prisma + getServerSession(authOptions).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/api-keys'

export const dynamic = 'force-dynamic'

const ALLOWED_SCOPES = [
  'content:generate',
  'accounts:read',
  'accounts:write',
] as const

type Scope = (typeof ALLOWED_SCOPES)[number]

const DEFAULT_SCOPES: Scope[] = [
  'content:generate',
  'accounts:read',
  'accounts:write',
]

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      keyPrefix: true,
      label: true,
      scopes: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ keys })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    /* corps vide autorisé */
  }

  const label =
    typeof body.label === 'string' && body.label.trim().length > 0
      ? body.label.trim().slice(0, 100)
      : null

  const requestedScopes = Array.isArray(body.scopes)
    ? (body.scopes.filter(
        (s): s is Scope =>
          typeof s === 'string' &&
          (ALLOWED_SCOPES as readonly string[]).includes(s),
      ) as Scope[])
    : []

  const scopes: Scope[] =
    requestedScopes.length > 0 ? requestedScopes : [...DEFAULT_SCOPES]

  const { key, prefix, hash } = generateApiKey()

  const created = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      keyHash: hash,
      keyPrefix: prefix,
      label,
      scopes,
    },
    select: { id: true, keyPrefix: true, label: true, scopes: true },
  })

  // Le texte en clair n'est renvoyé qu'ICI, une seule fois.
  return NextResponse.json({
    id: created.id,
    key,
    prefix: created.keyPrefix,
    label: created.label,
    scopes: created.scopes,
  })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  let id = searchParams.get('id')
  if (!id) {
    try {
      const body = (await req.json()) as Record<string, unknown>
      if (typeof body.id === 'string') id = body.id
    } catch {
      /* pas de corps */
    }
  }

  if (!id) {
    return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  }

  // Scopé à l'appelant : deleteMany ne supprime que si la clé lui appartient.
  const result = await prisma.apiKey.deleteMany({
    where: { id, userId: session.user.id },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'Clé introuvable' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
