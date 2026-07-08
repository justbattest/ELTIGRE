/**
 * GET /api/google-auth/callback
 * Reçoit le code d'autorisation Google après le consentement de l'user.
 * Échange le code contre des tokens, sauvegarde le refresh_token en DB.
 * Ferme la popup (postMessage vers l'opener) ou redirige vers /dashboard.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function GET(req: NextRequest) {
  console.log('[google-auth/callback] HIT — url:', req.url)
  try {
    const { searchParams } = new URL(req.url)
    const code  = searchParams.get('code')
    const error = searchParams.get('error')
    const state = searchParams.get('state') // userId

    console.log('[google-auth/callback] params — code:', !!code, 'error:', error, 'state:', state)

    const redirectUri = `${process.env.NEXTAUTH_URL}/api/google-auth/callback`
    console.log('[google-auth/callback] redirectUri:', redirectUri, 'NEXTAUTH_URL:', process.env.NEXTAUTH_URL)

    if (error) {
      return htmlPage(false, `Google refused access: ${error}`)
    }

    if (!code || !state) {
      return htmlPage(false, 'Missing parameters (code or state)')
    }

    const clientId     = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error('[google-auth/callback] MISSING ENV — clientId:', !!clientId, 'clientSecret:', !!clientSecret)
      return htmlPage(false, 'Server configuration error: missing Google credentials')
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[google-auth/callback] token exchange error:', errText)
      return htmlPage(false, `Google token exchange error: ${errText}`)
    }

    const tokens = await tokenRes.json()
    const refreshToken: string | undefined = tokens.refresh_token
    console.log('[google-auth/callback] tokens received — refresh_token:', !!refreshToken)

    if (!refreshToken) {
      return htmlPage(false, 'No refresh_token received. Go to myaccount.google.com/permissions, revoke access for this app, then reconnect.')
    }

    const userId = state
    try {
      await prisma.userCredentials.upsert({
        where:  { userId },
        create: { userId, googleRefreshToken: refreshToken },
        update: { googleRefreshToken: refreshToken },
      })
      console.log('[google-auth/callback] SUCCESS — saved refresh token for user:', userId)
    } catch (dbErr) {
      console.error('[google-auth/callback] DB error:', dbErr)
      return htmlPage(false, 'Database error saving token')
    }

    return htmlPage(true)
  } catch (err) {
    console.error('[google-auth/callback] UNHANDLED ERROR:', err)
    return htmlPage(false, `Unexpected error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Helper : page HTML qui ferme la popup ou redirige ────────────────────────
function htmlPage(success: boolean, errorMsg?: string) {
  const body = success
    ? `
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <div style="font-size:48px">✅</div>
        <h2 style="color:#22c55e">Google Drive connecté !</h2>
        <p style="color:#6b7280">Cette fenêtre va se fermer automatiquement...</p>
      </div>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'google-drive-connected' }, '*');
          setTimeout(() => window.close(), 1500);
        } else {
          setTimeout(() => window.location.href = '/dashboard', 1500);
        }
      </script>`
    : `
      <div style="font-family:sans-serif;text-align:center;padding:40px">
        <div style="font-size:48px">❌</div>
        <h2 style="color:#ef4444">Erreur de connexion</h2>
        <p style="color:#6b7280">${errorMsg ?? 'Erreur inconnue'}</p>
        <button onclick="window.close()" style="margin-top:20px;padding:8px 16px;background:#374151;color:white;border:none;border-radius:8px;cursor:pointer">
          Fermer
        </button>
      </div>`

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Google Drive</title></head><body style="background:#111827;color:white">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}
