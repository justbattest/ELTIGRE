/**
 * POST /api/poster/resolve-folder
 *
 * Prend l'URL d'un dossier Google Drive et retourne la liste ordonnée
 * des fichiers dedans (pour les carousels : 4 images triées par nom).
 *
 * Railway a accès aux credentials Google → fait l'appel API Drive côté serveur.
 * Le Mac reçoit juste les URLs directes pour télécharger.
 *
 * Body : { folderUrl: string }
 * Response : { files: [{ name, id, downloadUrl }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'

// Refresh token Google via OAuth2
async function getAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
  if (!data.access_token) throw new Error('Impossible de rafraîchir le token Google Drive')
  return data.access_token
}

function extractFolderId(url: string): string | null {
  // Formats : /folders/ID, /drive/folders/ID, id=ID
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  // ID pur
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url
  return null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { folderUrl } = await req.json()
  if (!folderUrl) return NextResponse.json({ error: 'folderUrl requis' }, { status: 400 })

  const folderId = extractFolderId(folderUrl)
  if (!folderId) return NextResponse.json({ error: 'Impossible d\'extraire l\'ID du dossier Drive' }, { status: 400 })

  // Récupérer les credentials Google
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { googleRefreshToken: true },
  })

  const refreshToken = decryptIfPresent(creds?.googleRefreshToken)
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!refreshToken || !clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google Drive non connecté — va dans les Paramètres pour connecter Drive' }, { status: 400 })
  }

  try {
    const accessToken = await getAccessToken(refreshToken, clientId, clientSecret)

    // Lister les fichiers du dossier, triés par nom
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&orderBy=name&fields=files(id,name,mimeType)&pageSize=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const listData = await listRes.json()

    if (!listRes.ok) {
      throw new Error(listData.error?.message || 'Erreur API Drive')
    }

    const files = (listData.files || [])
      .filter((f: { mimeType: string }) => f.mimeType.startsWith('image/') || f.mimeType.startsWith('video/'))
      .map((f: { id: string; name: string; mimeType: string }) => ({
        name: f.name,
        id: f.id,
        mimeType: f.mimeType,
        // URL téléchargement direct (fonctionne avec le token du Mac via l'endpoint /pending)
        downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
      }))

    if (files.length === 0) {
      return NextResponse.json({ error: 'Dossier vide ou aucun fichier image/vidéo trouvé' }, { status: 404 })
    }

    return NextResponse.json({ folderId, files })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
