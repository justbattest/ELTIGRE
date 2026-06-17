/**
 * POST /api/mc-prep/extract
 *
 * Phase 1 : télécharge la vidéo Instagram + extrait 4 frames via Python mc_prep extract.
 * Appel synchrone (~15-30s). Stocke le résultat dans mcPrepExtracts.
 *
 * Body : { videoUrl: string, numFrames?: number }
 * Response : { extractId, frames: [{index, timestamp, url}] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { mcPrepExtracts } from '@/lib/mc-prep-state'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'

const execFileAsync = promisify(execFile)

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { videoUrl, numFrames = 4 } = await req.json()
  if (!videoUrl || typeof videoUrl !== 'string') {
    return NextResponse.json({ error: 'videoUrl requis' }, { status: 400 })
  }

  // ID unique pour cet extract
  const extractId = `mcprep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const workDir = path.join('/tmp', extractId)
  fs.mkdirSync(workDir, { recursive: true })

  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonPath,
      [
        '-m', 'pipeline.mc_prep', 'extract',
        '--video-url', videoUrl,
        '--output-dir', workDir,
        '--num-frames', String(numFrames),
      ],
      {
        cwd: projectRoot,
        env: { ...process.env },
        timeout: 120_000,       // 2 min max pour le download + extraction
        maxBuffer: 1024 * 1024, // 1 MB stdout
      }
    )

    if (stderr) {
      // Les logs yt-dlp vont sur stderr — normal
      console.log(`[mc-prep:${extractId}][stderr]`, stderr.slice(0, 500))
    }

    let result: { video_path: string; frames: { index: number; timestamp: number; path: string }[]; error?: string }
    try {
      result = JSON.parse(stdout.trim())
    } catch {
      console.error(`[mc-prep:${extractId}] Bad stdout:`, stdout.slice(0, 500))
      fs.rmSync(workDir, { recursive: true, force: true })
      return NextResponse.json({ error: 'Erreur interne extraction frames' }, { status: 500 })
    }

    if (result.error || !result.frames?.length) {
      fs.rmSync(workDir, { recursive: true, force: true })
      return NextResponse.json({ error: result.error || 'Aucune frame extraite' }, { status: 422 })
    }

    // Stocker l'état
    mcPrepExtracts.set(extractId, {
      userId: session.user.id,
      videoPath: result.video_path,
      frames: result.frames,
      workDir,
      createdAt: Date.now(),
    })

    // Nettoyage automatique après 2h (si Phase 2 n'a pas été lancée)
    setTimeout(() => {
      const state = mcPrepExtracts.get(extractId)
      if (state) {
        mcPrepExtracts.delete(extractId)
        try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
      }
    }, 2 * 60 * 60 * 1000)

    // Retourner les URLs de frames (servies par /api/mc-prep/frame/[extractId]/[index])
    const frames = result.frames.map(f => ({
      index: f.index,
      timestamp: f.timestamp,
      url: `/api/mc-prep/frame/${extractId}/${f.index}`,
    }))

    return NextResponse.json({ extractId, frames })

  } catch (err: unknown) {
    console.error(`[mc-prep:${extractId}] extract error:`, err)
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Download/extraction error: ${msg.slice(0, 300)}` }, { status: 500 })
  }
}
