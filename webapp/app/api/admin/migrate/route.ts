import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const results: string[] = []
  try {
    await prisma.$executeRaw`
      ALTER TABLE user_credentials
      ADD COLUMN IF NOT EXISTS groq_api_key TEXT
    `
    results.push('✅ Colonne groq_api_key ajoutée (ou déjà présente)')
  } catch (e) {
    results.push(`❌ ${String(e)}`)
  }
  return NextResponse.json({ ok: true, results })
}
