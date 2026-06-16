/**
 * POST /api/motion-control/start
 *
 * Mode A — FormData (upload manuel) :
 *   image        File     image concept
 *   video        File     vidéo de référence
 *   characterName? string
 *
 * Mode B — JSON (depuis bibliothèque de concepts) :
 *   conceptId    string   ID d'un MotionConcept en DB
 *                         → outfitImages + localVideoPath utilisés directement
 *                         → phase Seedream sautée (--pre-generated-images)
 *
 * Crée un Run (modelSetting='kling_motion_control'), spawn pipeline/motion_control.py,
 * retourne { runId }.
 *
 * Phase 1 : Seedream v4.5 img2img — outfit variations (sauté si conceptId fourni)
 * Phase 2 : Kling 3.0 Motion Control API — applique la motion de la vidéo de référence
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { runningProcesses, writePidFile, deletePidFile } from '@/app/api/run/route'
import { handlePipelineEvent } from '@/lib/pipeline-events'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  // Détecter le mode : JSON (conceptId) vs FormData (upload manuel)
  const contentType = req.headers.get('content-type') || ''
  const isJsonMode = contentType.includes('application/json')

  let imagePath = ''
  let videoPath = ''
  let characterName = ''
  let runDir: string | null = null
  let conceptId: string | null = null
  let preGeneratedImages: string[] | null = null

  // Récupérer les credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) {
    return NextResponse.json({ error: 'Higgsfield token requis.' }, { status: 400 })
  }
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const klingAccessKey = decryptIfPresent(creds?.klingAccessKey) || ''
  const klingSecretKey = decryptIfPresent(creds?.klingSecretKey) || ''
  if (!klingAccessKey || !klingSecretKey) {
    return NextResponse.json({ error: 'Clés API Kling requises pour Motion Control. Ajoutez-les dans les Paramètres.' }, { status: 400 })
  }
  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null

  if (isJsonMode) {
    // ── Mode B : depuis bibliothèque ──────────────────────────────────────────
    let body: { conceptId?: string; characterName?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
    }

    if (!body.conceptId) {
      return NextResponse.json({ error: 'conceptId requis en mode JSON' }, { status: 400 })
    }
    conceptId = body.conceptId
    characterName = body.characterName || ''

    // Charger le concept depuis la DB
    const concept = await prisma.motionConcept.findUnique({
      where: { id: conceptId },
    })
    if (!concept) return NextResponse.json({ error: 'Concept introuvable' }, { status: 404 })
    if (concept.userId !== session.user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    // Vidéo : chemin local si disponible, sinon re-télécharger depuis sourceVideoUrl
    if (concept.localVideoPath && fs.existsSync(concept.localVideoPath)) {
      videoPath = concept.localVideoPath
    } else if (concept.sourceVideoUrl) {
      // La vidéo a été supprimée (tmp). On doit la re-télécharger.
      // Pour l'instant, on retourne une erreur claire — l'UI peut proposer re-build.
      return NextResponse.json({
        error: 'Vidéo locale introuvable (supprimée depuis /tmp). Veuillez re-générer le concept.',
        conceptId,
      }, { status: 422 })
    } else {
      return NextResponse.json({ error: 'Aucune vidéo disponible pour ce concept.' }, { status: 422 })
    }

    // Image concept (pour fallback Kling si pre-generated échoue)
    if (!concept.conceptImageUrl) {
      return NextResponse.json({ error: 'conceptImageUrl manquant dans ce concept.' }, { status: 422 })
    }

    // Télécharger le concept image localement pour le passer en --concept-image
    runDir = path.join('/tmp', `mc_${Date.now()}`)
    fs.mkdirSync(runDir, { recursive: true })
    imagePath = path.join(runDir, 'concept.jpg')

    // Téléchargement synchrone via node https (simple, pas de dépendance)
    try {
      const https = await import('https')
      const http = await import('http')
      await new Promise<void>((resolve, reject) => {
        const url = new URL(concept.conceptImageUrl!)
        const client = url.protocol === 'https:' ? https : http
        const file = fs.createWriteStream(imagePath)
        client.default.get(concept.conceptImageUrl!, (res) => {
          res.pipe(file)
          file.on('finish', () => { file.close(); resolve() })
        }).on('error', reject)
      })
    } catch (dlErr) {
      return NextResponse.json({ error: `Téléchargement concept image échoué: ${dlErr}` }, { status: 500 })
    }

    // Outfits pré-générés
    const outfits = Array.isArray(concept.outfitImages) ? concept.outfitImages as string[] : []
    if (outfits.length > 0) {
      preGeneratedImages = outfits
    }

    // Incrémenter viewCount
    prisma.motionConcept.update({
      where: { id: conceptId },
      data: { viewCount: { increment: 1 } },
    }).catch(() => {})

  } else {
    // ── Mode A : upload manuel FormData ──────────────────────────────────────
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
    }

    const imageFile = formData.get('image') as File | null
    const videoFile = formData.get('video') as File | null
    characterName = (formData.get('characterName') as string | null) || ''

    if (!imageFile) return NextResponse.json({ error: 'Image concept requise' }, { status: 400 })
    if (!videoFile) return NextResponse.json({ error: 'Vidéo de référence requise' }, { status: 400 })

    runDir = path.join('/tmp', `mc_${Date.now()}`)
    fs.mkdirSync(runDir, { recursive: true })

    const imageExt = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const videoExt = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4'
    imagePath = path.join(runDir, `concept.${imageExt}`)
    videoPath = path.join(runDir, `concept.${videoExt}`)

    fs.writeFileSync(imagePath, Buffer.from(await imageFile.arrayBuffer()))
    fs.writeFileSync(videoPath, Buffer.from(await videoFile.arrayBuffer()))
  }

  // Créer le Run
  const run = await prisma.run.create({
    data: {
      ...(session.user.id ? { user: { connect: { id: session.user.id } } } : {}),
      ...(conceptId ? { concept: { connect: { id: conceptId } } } : {}),
      inputProfiles: '[]',
      maxPosts: 4,
      modelSetting: 'kling_motion_control',
      status: 'running',
    },
  })

  // Lancer le subprocess Python
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const pythonArgs = [
    '-m', 'pipeline.motion_control',
    '--run-id', run.id,
    '--concept-image', imagePath,
    '--concept-video', videoPath,
    ...(preGeneratedImages && preGeneratedImages.length > 0
      ? ['--pre-generated-images', ...preGeneratedImages]
      : []),
  ]

  const proc = spawn(
    pythonPath,
    pythonArgs,
    {
      cwd: path.join(process.cwd(), '..'),
      env: {
        ...process.env,
        HIGGSFIELD_TOKEN: higgsToken,
        ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
        KLING_ACCESS_KEY: klingAccessKey,
        KLING_SECRET_KEY: klingSecretKey,
        ...(googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: googleRefreshToken } : {}),
        ...(driveFolderId ? { DRIVE_FOLDER_ID: driveFolderId } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  runningProcesses.set(run.id, proc)
  writePidFile(run.id, proc.pid)

  // Chaîne de promesses pour traiter les chunks stdout en séquence stricte.
  // Sans ça, plusieurs chunks async peuvent s'exécuter en parallèle → race condition
  // où getOrCreateGenerationId voit un cache vide alors qu'un autre chunk l'a déjà rempli.
  let stdoutChain = Promise.resolve()

  proc.stdout.on('data', (data: Buffer) => {
    stdoutChain = stdoutChain.then(async () => {
      const lines = data.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          console.log(`[mc:${run.id}]`, JSON.stringify(event))
          await handlePipelineEvent(run.id, session.user.id, event)
        } catch (err) {
          console.error(`[mc:${run.id}] handlePipelineEvent error:`, err instanceof Error ? err.message : err, '| line:', line.slice(0, 150))
        }
      }
    })
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[mc:${run.id}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[mc:${run.id}] spawn error:`, err)
    prisma.run.update({
      where: { id: run.id },
      data: { status: 'failed' },
    }).catch(() => {})
  })

  proc.on('close', async (code) => {
    runningProcesses.delete(run.id)
    deletePidFile(run.id)
    // Nettoyer les fichiers temporaires (uniquement le répertoire créé par cette route)
    if (runDir) {
      try { fs.rmSync(runDir, { recursive: true, force: true }) } catch {}
    }
    const currentRun = await prisma.run.findUnique({ where: { id: run.id } })
    if (currentRun?.status === 'running') {
      await prisma.run.update({
        where: { id: run.id },
        data: { status: code === 0 ? 'completed' : 'failed' },
      })
    }
  })

  return NextResponse.json({ runId: run.id })
}
