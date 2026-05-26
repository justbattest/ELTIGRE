/**
 * POST /api/google-auth/start
 * Génère l'URL d'autorisation Google OAuth2 (Authorization Code Flow).
 * Le frontend ouvre cette URL dans une popup.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({
      error: 'GOOGLE_CLIENT_ID manquant dans .env'
    }, { status: 500 })
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/google-auth/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',   // Pour obtenir un refresh_token
    prompt: 'consent',        // Forcer le consentement → refresh_token garanti
    state: session.user.id,   // Pour identifier l'user dans le callback
  })

  const authUrl = `${GOOGLE_AUTH_URL}?${params}`
  return NextResponse.json({ authUrl, redirectUri })
}
