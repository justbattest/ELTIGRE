/**
 * GET /api/instagram/pending
 *
 * Endpoint pollé par le Mac local toutes les 30s.
 * Auth: Authorization: Bearer <MAC_API_TOKEN>
 *
 * Retourne le prochain post à traiter (ou 204 si rien).
 * - Vérifie scheduledFor <= now + 5min
 * - Vérifie les limites warmup par compte
 * - Reset postsToday si le jour a changé
 * - Set atomiquement status='processing' avant de retourner (évite double traitement)
 *
 * Inclut dans la réponse les infos de compte chiffrées (session, device, password)
 * pour que le Mac puisse poster sans appel DB supplémentaire.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

// Limites warmup : phase → max posts par jour
const WARMUP_DAILY_LIMITS: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 3,
}

function authMac(req: NextRequest): boolean {
  const macToken = process.env.MAC_API_TOKEN
  if (!macToken) return false
  const header = req.headers.get('authorization') || ''
  return header === `Bearer ${macToken}`
}

export async function GET(req: NextRequest) {
  if (!authMac(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const now = new Date()
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  // Trouver tous les posts pending planifiés dans les 5 prochaines minutes
  const pendingPosts = await prisma.instagramPost.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: fiveMinutesFromNow },
    },
    orderBy: { scheduledFor: 'asc' },
    take: 10, // Chercher parmi les 10 prochains
    include: {
      account: true,
    },
  })

  if (pendingPosts.length === 0) {
    return new NextResponse(null, { status: 204 })
  }

  // Trouver le premier post dont le compte peut encore poster aujourd'hui
  for (const post of pendingPosts) {
    const account = post.account

    // Skip si compte banni ou en challenge
    if (account.status === 'banned' || account.status === 'challenge' || account.status === 'suspended') {
      continue
    }

    // Reset postsToday si c'est un nouveau jour
    const lastDate = account.postsTodayDate
    const isNewDay = !lastDate || lastDate < todayStart
    const currentPostsToday = isNewDay ? 0 : account.postsToday

    // Vérifier limite warmup
    const maxPosts = WARMUP_DAILY_LIMITS[account.warmupPhase] ?? 3
    if (currentPostsToday >= maxPosts) {
      continue // Ce compte a atteint sa limite quotidienne
    }

    // Atomiquement set status='processing' pour éviter double traitement
    const updated = await prisma.instagramPost.updateMany({
      where: { id: post.id, status: 'pending' }, // double-check status
      data: { status: 'processing' },
    })

    if (updated.count === 0) {
      // Un autre processus a pris ce post entre temps — passer au suivant
      continue
    }

    // Décrypter les credentials pour le Mac
    const password = decryptIfPresent(account.passwordEnc)
    const totpSecret = decryptIfPresent(account.totpSecret)
    const sessionJson = account.sessionJson
    const deviceJson = account.deviceJson

    // Si reset du compteur quotidien nécessaire, le faire maintenant
    if (isNewDay) {
      await prisma.instagramAccount.update({
        where: { id: account.id },
        data: { postsToday: 0, postsTodayDate: now },
      })
    }

    return NextResponse.json({
      post: {
        id: post.id,
        driveFileId: post.driveFileId,
        driveFileUrl: post.driveFileUrl,
        caption: post.caption,
        mediaType: post.mediaType,
        scheduledFor: post.scheduledFor,
      },
      account: {
        id: account.id,
        username: account.username,
        password,
        totpSecret,         // Secret TOTP décrypté (généré automatiquement par pyotp au login)
        networkName: account.networkName,
        warmupPhase: account.warmupPhase,
        sessionJson,
        deviceJson,
      },
    })
  }

  // Aucun post éligible trouvé
  return new NextResponse(null, { status: 204 })
}
