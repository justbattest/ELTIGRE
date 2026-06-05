/**
 * POST /api/poster/scan-carousels
 *
 * Scanne les dossiers carousels dans Google Drive et retourne la liste
 * des carousels disponibles pour un personnage donné.
 *
 * Structure Drive : root/<characterName>/carousels/<run_id>/carousel_N/1.jpg…4.jpg
 *
 * Body : { characterName: string }
 * Response : { carousels: DriveCarousel[], total: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAccessToken, listFolder, findFolder, getDownloadUrl } from '@/lib/drive-api'

export type DriveCarousel = {
  id: string               // carousel_N folder ID
  name: string             // "carousel_1", "carousel_2"...
  runId: string            // run_id parent folder name
  characterName: string
  previewUrl: string       // URL de la 1ère image (aperçu)
  fileUrls: string[]       // 4 URLs téléchargeables
  fileIds: string[]        // 4 file IDs Drive
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { characterName } = await req.json()
  if (!characterName) return NextResponse.json({ error: 'characterName requis' }, { status: 400 })

  // Récupérer credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
    select: { googleRefreshToken: true, driveFolderId: true },
  })

  const refreshToken = creds?.googleRefreshToken
  const rootFolderId = creds?.driveFolderId
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!refreshToken || !rootFolderId || !clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Google Drive non connecté ou DRIVE_FOLDER_ID manquant. Configure Drive dans les Paramètres.',
    }, { status: 400 })
  }

  try {
    const token = await getAccessToken(refreshToken, clientId, clientSecret)

    // 1. Trouver le dossier carousels/
    // Cas A : root = "EL TIGRE LIVE" → root/EMMAGOOD/carousels/
    // Cas B : root = "EMMAGOOD" directement → root/carousels/
    let carouselsFolder = await findFolder(token, rootFolderId, 'carousels')

    if (!carouselsFolder) {
      // Cas A : chercher d'abord le dossier du personnage
      const charFolder = await findFolder(token, rootFolderId, characterName)
      if (charFolder) {
        carouselsFolder = await findFolder(token, charFolder.id, 'carousels')
      }
    }

    if (!carouselsFolder) {
      return NextResponse.json({
        carousels: [],
        total: 0,
        message: `Aucun dossier "carousels" trouvé pour ${characterName} dans Drive. Génère d'abord des carousels.`,
      })
    }

    // 3. Lister les dossiers run_id/ (chaque run = un batch de carousels)
    const runFolders = await listFolder(token, carouselsFolder.id, 'application/vnd.google-apps.folder')

    const carousels: DriveCarousel[] = []

    // 4. Pour chaque run, lister les carousel_N/ et leurs images
    // On traite les runs du plus récent au plus ancien (ordre alphabétique inversé des IDs cuid)
    const runsReversed = [...runFolders].reverse()

    for (const runFolder of runsReversed) {
      const carouselSubfolders = await listFolder(
        token, runFolder.id, 'application/vnd.google-apps.folder'
      )

      for (const carouselFolder of carouselSubfolders) {
        // Lister les images dans carousel_N/
        const images = await listFolder(token, carouselFolder.id)
        const imageFiles = images
          .filter(f => f.mimeType.startsWith('image/'))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

        if (imageFiles.length < 2) continue // Carousel incomplet, skip

        const fileIds = imageFiles.map(f => f.id)
        const fileUrls = fileIds.map(id => getDownloadUrl(id))

        carousels.push({
          id: carouselFolder.id,
          name: carouselFolder.name,
          runId: runFolder.name,
          characterName,
          previewUrl: fileUrls[0],
          fileUrls,
          fileIds,
        })
      }

      // Limiter à 100 carousels max pour les perfs
      if (carousels.length >= 100) break
    }

    return NextResponse.json({ carousels, total: carousels.length })
  } catch (e) {
    console.error('[scan-carousels]', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
