/**
 * POST /api/motion-concept/build
 *
 * Lance le Motion Concept Builder :
 *   URL Instagram → yt-dlp → ffmpeg 7 frames → OpenCV best frame
 *   → nano_banana_2 person swap → 4× Seedream outfit → MotionConcept en DB
 *
 * Body JSON :
 *   videoUrl       string   URL du reel Instagram
 *   elementId      string   Higgsfield element_id pour nano_banana_2 (<<<element_id>>>)
 *   conceptName?   string   Nom libre (optionnel)
 *   swapModel?     string   'nano_banana_2' | 'soul_cinematic' (défaut: nano_banana_2)
 *
 * Retourne { runId } immédiatement.
 * Le client suit la progression via GET /api/motion-concept/events/[runId].
 * À la fin, un MotionConcept est créé en DB et conceptId rempli dans l'état SSE.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { nanoid } from 'nanoid'
import { conceptBuilderRuns } from '@/lib/motion-concept-state'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: {
    videoUrl?: string
    elementId?: string
    conceptName?: string
    swapModel?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })
  }

  const { videoUrl, elementId, conceptName, swapModel = 'nano_banana_2' } = body

  if (!videoUrl) return NextResponse.json({ error: 'videoUrl requis' }, { status: 400 })
  if (!elementId) return NextResponse.json({ error: 'elementId requis' }, { status: 400 })

  // Credentials Higgsfield
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (!higgsToken) {
    return NextResponse.json({ error: 'Higgsfield token requis (Paramètres → API)' }, { status: 400 })
  }
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''

  // Identifiant unique du run concept builder (≠ Run DB — il n'y a pas de Run Prisma ici)
  const runId = nanoid()
  const outputDir = path.join('/tmp', 'mc_concepts', runId)
  fs.mkdirSync(outputDir, { recursive: true })

  // Initialiser l'état SSE
  conceptBuilderRuns.set(runId, {
    events: [],
    done: false,
    startedAt: Date.now(),
    userId: session.user.id,
  })

  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const args = [
    '-m', 'pipeline.motion_concept_builder',
    '--run-id', runId,
    '--video-url', videoUrl,
    '--element-id', elementId,
    '--output-dir', outputDir,
    '--swap-model', swapModel,
    ...(conceptName ? ['--concept-name', conceptName] : []),
  ]

  const proc = spawn(pythonPath, args, {
    cwd: path.join(process.cwd(), '..'),
    env: {
      ...process.env,
      HIGGSFIELD_TOKEN: higgsToken,
      ...(higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const state = conceptBuilderRuns.get(runId)!

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        console.log(`[concept-builder:${runId}]`, JSON.stringify(event))

        // Stocker l'event brut pour le SSE
        state.events.push(line)

        // Réagir aux events clés
        if (event.type === 'concept_done') {
          // Créer le MotionConcept en DB
          const outfitUrls: string[] = Array.isArray(event.outfit_urls) ? event.outfit_urls : []
          prisma.motionConcept.create({
            data: {
              userId: session.user.id,
              name: (event.concept_name as string) || conceptName || null,
              sourceVideoUrl: videoUrl,
              localVideoPath: (event.video_path as string) || null,
              conceptImageUrl: (event.concept_image_url as string) || null,
              outfitImages: outfitUrls,
              elementId: event.element_id as string,
            },
          }).then((concept) => {
            state.conceptId = concept.id
            // Émettre un event enrichi avec l'id DB
            const enriched = { ...event, concept_id: concept.id }
            state.events.push(JSON.stringify(enriched))
            // Remplacer le dernier event (concept_done sans id) par celui enrichi
            // (le client reçoit les deux — le second prend le dessus)
          }).catch((err: unknown) => {
            console.error(`[concept-builder:${runId}] DB create error:`, err)
            state.events.push(JSON.stringify({
              type: 'error', step: 'db', message: String(err),
            }))
          }).finally(() => {
            state.done = true
          })
        } else if (event.type === 'error') {
          state.done = true
        }
      } catch (parseErr) {
        console.error(`[concept-builder:${runId}] parse error:`, parseErr, '| line:', line.slice(0, 150))
      }
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[concept-builder:${runId}][stderr]`, text)
  })

  proc.on('error', (err) => {
    console.error(`[concept-builder:${runId}] spawn error:`, err)
    state.events.push(JSON.stringify({ type: 'error', step: 'spawn', message: err.message }))
    state.done = true
  })

  proc.on('close', (code) => {
    if (!state.done) {
      if (code !== 0) {
        state.events.push(JSON.stringify({
          type: 'error', step: 'process', message: `Process exited with code ${code}`,
        }))
      }
      state.done = true
    }
  })

  return NextResponse.json({ runId })
}
