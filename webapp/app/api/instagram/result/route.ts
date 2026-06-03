/**
 * PATCH /api/instagram/result
 *
 * Le Mac local reporte le résultat d'un post (succès ou échec).
 * Auth: Authorization: Bearer <MAC_API_TOKEN>
 *
 * Body :
 * {
 *   postId: string
 *   status: 'posted' | 'failed'
 *   igPostId?: string        // Instagram post ID si succès
 *   errorMessage?: string    // Message d'erreur si échec
 *   accountStatus?: string   // Nouveau status du compte (ex: 'challenge' si ChallengeRequired)
 *   sessionJson?: string     // Session instagrapi mise à jour (après dump_settings)
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

function authMac(req: NextRequest): boolean {
  const macToken = process.env.MAC_API_TOKEN
  if (!macToken) return false
  const header = req.headers.get('authorization') || ''
  return header === `Bearer ${macToken}`
}

export async function PATCH(req: NextRequest) {
  if (!authMac(req)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const body = await req.json()
  const { postId, status, igPostId, errorMessage, accountStatus, sessionJson } = body

  if (!postId) return NextResponse.json({ error: 'postId requis' }, { status: 400 })
  if (!status) return NextResponse.json({ error: 'status requis' }, { status: 400 })

  const post = await prisma.instagramPost.findUnique({
    where: { id: postId },
    include: { account: true },
  })
  if (!post) return NextResponse.json({ error: 'Post introuvable' }, { status: 404 })

  const now = new Date()

  // Mettre à jour le post
  await prisma.instagramPost.update({
    where: { id: postId },
    data: {
      status,
      ...(status === 'posted' ? { postedAt: now, igPostId: igPostId || null, errorMessage: null } : {}),
      ...(status === 'failed' ? { errorMessage: errorMessage || 'Erreur inconnue' } : {}),
    },
  })

  // Mettre à jour le compte
  const accountUpdate: Record<string, unknown> = {}

  if (status === 'posted') {
    accountUpdate.lastPostedAt = now
    accountUpdate.postsToday = (post.account.postsToday || 0) + 1
    accountUpdate.postsTodayDate = now
  }

  if (accountStatus && accountStatus !== post.account.status) {
    accountUpdate.status = accountStatus
  }

  // Mettre à jour la session instagrapi si fournie (après dump_settings instagrapi)
  if (sessionJson) {
    accountUpdate.sessionJson = sessionJson
  }

  if (Object.keys(accountUpdate).length > 0) {
    await prisma.instagramAccount.update({
      where: { id: post.accountId },
      data: accountUpdate,
    })
  }

  return NextResponse.json({ ok: true, postId, status })
}
