/**
 * Shared lightweight validity checks for third-party providers.
 * Used by /api/settings/test and /api/dashboard/status so both surfaces
 * report identical results without duplicating the HTTP calls.
 */

export type ProviderCheckResult = { ok: boolean; message: string; email?: string }

export async function checkAnthropicValidity(apiKey: string): Promise<ProviderCheckResult> {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    })
    if (resp.ok) {
      return { ok: true, message: 'Connected' }
    }
    return { ok: false, message: resp.status === 401 ? 'Invalid API key' : `Error ${resp.status}` }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

export async function checkOpenAIValidity(apiKey: string): Promise<ProviderCheckResult> {
  try {
    const resp = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (resp.ok) {
      return { ok: true, message: 'Connected' }
    }
    return { ok: false, message: resp.status === 401 ? 'Invalid API key' : `Error ${resp.status}` }
  } catch (e) {
    return { ok: false, message: String(e) }
  }
}

export async function checkDriveValidity(refreshToken: string): Promise<ProviderCheckResult> {
  const googleClientId = process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!googleClientId || !googleClientSecret) {
    return { ok: false, message: 'Missing GOOGLE_CLIENT_ID/SECRET env vars' }
  }
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: googleClientId,
        client_secret: googleClientSecret,
      }),
    })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok || !body.access_token) {
      return { ok: false, message: body.error_description || 'Invalid token' }
    }
    const driveResp = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { Authorization: `Bearer ${body.access_token}` },
    })
    const driveBody = await driveResp.json().catch(() => ({}))
    const email = driveBody.user?.emailAddress
    return { ok: true, message: email || 'Connected', email }
  } catch (e) {
    return { ok: false, message: `Network error: ${String(e).substring(0, 80)}` }
  }
}
