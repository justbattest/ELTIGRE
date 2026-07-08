/**
 * GET /api/dashboard/status — agrège le statut des 5 étapes de setup en un seul appel.
 * Utilisé par la page /dashboard (5 cartes + compteur "N/5") et par /login
 * (décider si l'utilisateur doit être redirigé vers /dashboard après connexion).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { checkHiggsfieldStatus } from '@/lib/higgsfield-status'
import { checkAnthropicValidity, checkOpenAIValidity } from '@/lib/provider-status'
import { clearLowBalance } from '@/lib/low-balance'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const userId = session.user.id

  const creds = await prisma.userCredentials.findUnique({ where: { userId } })

  const higgsfieldStatus = await checkHiggsfieldStatus(userId)

  const referenceElements: { id: string; type?: string }[] = creds?.referenceElements
    ? JSON.parse(creds.referenceElements)
    : []
  const elementCount = referenceElements.length
  const hasVideo = referenceElements.some(e => e.type === 'soul_2')
  const hasImage = referenceElements.some(e => e.type === 'soul_cinematic' || !e.type)

  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  const openaiKey = decryptIfPresent(creds?.openaiApiKey)

  const [anthropicCheck, openaiCheck] = await Promise.all([
    anthropicKey ? checkAnthropicValidity(anthropicKey) : Promise.resolve(null),
    openaiKey ? checkOpenAIValidity(openaiKey) : Promise.resolve(null),
  ])

  // Un recheck manuel réussi efface l'alerte "solde bas" précédemment posée.
  if (anthropicCheck?.ok && creds?.anthropicLowBalance) {
    await clearLowBalance(userId, 'anthropic')
  }
  if (openaiCheck?.ok && creds?.openaiLowBalance) {
    await clearLowBalance(userId, 'openai')
  }

  const driveConnected = !!creds?.googleRefreshToken

  const steps = {
    higgsfield: {
      connected: higgsfieldStatus.valid,
      refreshed: higgsfieldStatus.refreshed,
    },
    elements: {
      count: elementCount,
      hasVideo,
      hasImage,
    },
    anthropic: {
      configured: !!anthropicKey,
      valid: anthropicCheck?.ok ?? null,
      lowBalance: (anthropicCheck?.ok ? false : creds?.anthropicLowBalance) || false,
      lowBalanceAt: creds?.anthropicLowBalanceAt ?? null,
    },
    openai: {
      configured: !!openaiKey,
      valid: openaiCheck?.ok ?? null,
      lowBalance: (openaiCheck?.ok ? false : creds?.openaiLowBalance) || false,
      lowBalanceAt: creds?.openaiLowBalanceAt ?? null,
    },
    drive: {
      connected: driveConnected,
      folderId: creds?.driveFolderId || '',
    },
  }

  const completed = [
    steps.higgsfield.connected,
    steps.elements.count > 0,
    steps.anthropic.configured,
    steps.openai.configured,
    steps.drive.connected,
  ].filter(Boolean).length

  return NextResponse.json({ ...steps, completed, total: 5 })
}
