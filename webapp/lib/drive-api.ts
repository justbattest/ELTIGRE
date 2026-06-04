/**
 * drive-api.ts — Helpers Google Drive réutilisables côté Railway.
 * Authentification via OAuth2 Refresh Token.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function getAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`Drive token refresh failed: ${JSON.stringify(data)}`)
  }
  return data.access_token
}

export type DriveFile = {
  id: string
  name: string
  mimeType: string
  createdTime?: string
}

/**
 * Liste le contenu d'un dossier Drive.
 * mimeType='application/vnd.google-apps.folder' pour ne lister que les sous-dossiers.
 */
export async function listFolder(
  accessToken: string,
  folderId: string,
  mimeTypeFilter?: string,
): Promise<DriveFile[]> {
  let query = `'${folderId}' in parents and trashed=false`
  if (mimeTypeFilter) query += ` and mimeType='${mimeTypeFilter}'`

  const params = new URLSearchParams({
    q: query,
    orderBy: 'name',
    fields: 'files(id,name,mimeType,createdTime)',
    pageSize: '200',
  })

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Drive listFolder error: ${JSON.stringify(data)}`)
  return data.files || []
}

/** Trouve un sous-dossier par nom exact dans un dossier parent. */
export async function findFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<DriveFile | null> {
  const query = `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const params = new URLSearchParams({ q: query, fields: 'files(id,name,mimeType)', pageSize: '5' })
  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (!res.ok) return null
  return data.files?.[0] || null
}

/** URL de téléchargement direct (public si fichier partagé, sinon avec token) */
export function getDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

/** Extrait l'ID Drive depuis diverses formes d'URL */
export function extractDriveId(url: string): string | null {
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url
  return null
}
