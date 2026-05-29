/**
 * POST /api/auth/register
 * Crée un nouveau compte utilisateur (email + password).
 *
 * Contrôlé par la variable d'environnement REGISTRATION_ENABLED :
 *   REGISTRATION_ENABLED=true  (ou absent) → inscription ouverte
 *   REGISTRATION_ENABLED=false              → inscription fermée (retourne 403)
 *
 * Body JSON : { email, password }
 * Retourne  : { ok: true } — l'utilisateur peut ensuite se connecter via /login
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export async function POST(req: NextRequest) {
  // Vérifier si l'inscription est activée
  const registrationEnabled = process.env.REGISTRATION_ENABLED !== 'false'
  if (!registrationEnabled) {
    return NextResponse.json(
      { error: 'Les inscriptions sont actuellement fermées.' },
      { status: 403 }
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const { email, password } = body

  // Validation
  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Le mot de passe doit faire au moins 8 caractères' },
      { status: 400 }
    )
  }

  // Vérifier que l'email n'existe pas déjà
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'Un compte avec cet email existe déjà' },
      { status: 409 }
    )
  }

  // Créer l'utilisateur
  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.create({
    data: { email, passwordHash },
  })

  console.log(`[register] Nouveau compte créé : ${email}`)

  return NextResponse.json({ ok: true })
}
