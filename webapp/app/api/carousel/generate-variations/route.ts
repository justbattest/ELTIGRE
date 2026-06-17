/**
 * POST /api/carousel/generate-variations
 *
 * Reçoit N photos en multipart/form-data + soul_id + character_name.
 * Pour chaque photo : génère 3 variations img2img via SoulCinema (Higgsfield).
 * Crée un dossier carousel Drive par photo : original + 3 variations = 4 images.
 * Retourne { runId } immédiatement (progress via SSE /api/carousel/events/[runId]).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { carouselRuns } from '@/lib/carousel-state'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const files = formData.getAll('images') as File[]
  const soulId = (formData.get('soulId') as string) || ''
  const characterName = (formData.get('characterName') as string) || ''
  const quality = (formData.get('quality') as string) || '2k'

  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'Aucune image fournie' }, { status: 400 })
  }
  if (!soulId) {
    return NextResponse.json({ error: 'soul_id requis (sélectionner un Soul Character)' }, { status: 400 })
  }

  // Récupérer credentials
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const googleRefreshToken = creds?.googleRefreshToken || null
  const driveFolderId = creds?.driveFolderId || null
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  const higgsRefreshToken = decryptIfPresent(creds?.higgsFieldRefreshToken) || ''
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)

  if (!googleRefreshToken || !driveFolderId) {
    return NextResponse.json(
      { error: 'Google Drive non configuré. Vérifier les Settings.' },
      { status: 400 }
    )
  }
  if (!higgsToken) {
    return NextResponse.json(
      { error: 'Higgsfield non connecté. Vérifier les Settings.' },
      { status: 400 }
    )
  }
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'Clé Anthropic manquante. Vérifier les Settings.' },
      { status: 400 }
    )
  }

  // Générer un runId unique
  const runId = `variations_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Sauvegarder les images uploadées sur disque
  const uploadDir = path.join('/tmp', runId, 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })

  // ⚠️ NE PAS utiliser file.name comme nom de fichier — si plusieurs fichiers
  // ont le même nom (ex: "1.jpg" de 10 carousels Drive différents), ils s'écrasent
  // mutuellement et le Python reçoit moins de fichiers que prévu.
  // Fix : noms séquentiels garantis uniques (img_0001.jpg, img_0002.jpg, …).
  for (let i = 0; i < files.length; i++) {
    const seq = String(i + 1).padStart(4, '0')
    const filePath = path.join(uploadDir, `img_${seq}.jpg`)
    const buffer = await files[i].arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
  }
  console.log(`[variations:${runId}] ${files.length} images saved to ${uploadDir}`)

  // Initialiser le slot en mémoire
  carouselRuns.set(runId, {
    events: [],
    done: false,
    characterName: characterName || '',
    startedAt: Date.now(),
    userId: session.user.id,
  })

  // Lancer carousel_variations.py en subprocess
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  const proc = spawn(
    pythonPath,
    [
      '-m', 'pipeline.carousel_variations',
      '--run-id', runId,
      '--images-dir', uploadDir,
      '--soul-id', soulId,
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        HIGGSFIELD_TOKEN: higgsToken,
        HIGGSFIELD_REFRESH_TOKEN: higgsRefreshToken,
        ANTHROPIC_KEY: anthropicKey,
        GOOGLE_REFRESH_TOKEN: googleRefreshToken,
        DRIVE_FOLDER_ID: driveFolderId,
        VARIATION_QUALITY: quality,
        ...(process.env.GOOGLE_CLIENT_ID ? { GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID } : {}),
        ...(process.env.GOOGLE_CLIENT_SECRET ? { GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET } : {}),
        ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    const state = carouselRuns.get(runId)
    if (!state) return
    for (const line of lines) {
      console.log(`[variations:${runId}]`, line)
      state.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[variations:${runId}][stderr]`, text)
      const state = carouselRuns.get(runId)
      if (state && !state.done) {
        state.events.push(JSON.stringify({ type: 'stderr', msg: text }))
      }
    }
  })

  proc.on('close', (code) => {
    console.log(`[variations:${runId}] process exited with code ${code}`)
    const state = carouselRuns.get(runId)
    if (state) {
      const hasDone = state.events.some(e => {
        try { return JSON.parse(e).type === 'done' } catch { return false }
      })
      if (!hasDone) {
        state.events.push(JSON.stringify({
          type: code === 0 ? 'done' : 'error',
          message: code !== 0 ? `Process exited with code ${code}` : undefined,
          run_id: runId,
        }))
      }
      state.done = true
    }

    // Nettoyer les fichiers uploadés
    try { fs.rmSync(path.join('/tmp', runId), { recursive: true, force: true }) } catch {}
    // Nettoyer la map après 30 minutes
    setTimeout(() => carouselRuns.delete(runId), 30 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[variations:${runId}] spawn error:`, err)
    const state = carouselRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', message: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ runId, imageCount: files.length })
}
