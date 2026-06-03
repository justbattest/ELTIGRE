/**
 * GET /api/instagram/setup-credentials
 *
 * Endpoint de setup unique — retourne les credentials Google Drive
 * nécessaires pour configurer le Mac poster.
 *
 * Auth: Authorization: Bearer <MAC_API_TOKEN>
 * Utilisé UNE SEULE FOIS pendant le setup du Mac local.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

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

  // Récupérer le premier user qui a un refresh token Google
  const creds = await prisma.userCredentials.findFirst({
    where: { googleRefreshToken: { not: null } },
    select: { googleRefreshToken: true },
  })

  if (!creds?.googleRefreshToken) {
    return NextResponse.json({
      error: 'Aucun refresh token Google en DB. Connecte Google Drive dans les Paramètres de la webapp.',
    }, { status: 404 })
  }

  const refreshToken = decryptIfPresent(creds.googleRefreshToken)

  return NextResponse.json({
    google_refresh_token: refreshToken,
    google_client_id: process.env.GOOGLE_CLIENT_ID,
    google_client_secret: process.env.GOOGLE_CLIENT_SECRET,
    message: 'Utilise ces valeurs dans instagram_poster/config.json',
  })
}
