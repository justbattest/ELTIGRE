import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const results: string[] = []
  try {
    await prisma.$executeRaw`
      ALTER TABLE user_credentials
      ADD COLUMN IF NOT EXISTS groq_api_key TEXT,
      ADD COLUMN IF NOT EXISTS openai_api_key TEXT
    `
    results.push('✅ Colonnes groq_api_key + openai_api_key ajoutées (ou déjà présentes)')
  } catch (e) {
    results.push(`❌ ${String(e)}`)
  }
  return NextResponse.json({ ok: true, results })
}
