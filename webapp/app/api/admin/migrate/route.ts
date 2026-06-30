/**
 * GET /api/admin/migrate
 * Ajoute les colonnes ModelArk manquantes via SQL brut.
 * Réservé à justbattest@gmail.com. À supprimer après usage.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.email !== 'justbattest@gmail.com') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const results: string[] = []

  try {
    await prisma.$executeRaw`
      ALTER TABLE user_credentials
      ADD COLUMN IF NOT EXISTS modelark_api_key TEXT,
      ADD COLUMN IF NOT EXISTS modelark_characters TEXT
    `
    results.push('✅ Colonnes modelark_api_key + modelark_characters ajoutées (ou déjà présentes)')
  } catch (err) {
    results.push('❌ Erreur: ' + String(err))
  }

  return NextResponse.json({ ok: true, results })
}
