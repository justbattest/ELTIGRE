/**
 * POST /api/mc-prep/batch-extract
 *
 * Extrait 4 frames de chaque vidéo (URLs + fichiers uploadés).
 * Appel synchrone — attend la fin du subprocess Python.
 * Les frames sont servies via /api/mc-prep/frame/[extractId]/[index].
 *
 * FormData fields :
 *   urls        (string) — JSON array of Instagram URLs
 *   videoFiles  (File[]) — uploaded video files
 *
 * Response : { batchExtractId, videos: [...] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { mcPrepExtracts, mcPrepBatchExtracts } from '@/lib/mc-prep-state'
import type { MCPrepBatchExtractVideo } from '@/lib/mc-prep-state'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const urlsRaw = (formData.get('urls') as string) || '[]'
  const videoFiles = formData.getAll('videoFiles') as File[]

  // Parse URLs
  let urls: string[] = []
  try {
    urls = JSON.parse(urlsRaw)
    if (!Array.isArray(urls)) urls = []
  } catch {
    return NextResponse.json({ error: 'urls doit être un JSON array valide' }, { status: 400 })
  }

  if (urls.length === 0 && videoFiles.length === 0) {
    return NextResponse.json({ error: 'Au moins une URL ou un fichier vidéo requis' }, { status: 400 })
  }

  // Créer un workDir temporaire
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcprep-batchext-'))

  // Sauvegarder les fichiers vidéo uploadés
  const uploadsDir = path.join(workDir, 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })

  const fileItems: { type: string; value: string }[] = []
  for (let i = 0; i < videoFiles.length; i++) {
    const file = videoFiles[i]
    const filePath = path.join(uploadsDir, `video_${i}.mp4`)
    const buffer = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
    fileItems.push({ type: 'file', value: filePath })
  }

  // Construire items.json : URLs + fichiers
  const urlItems = urls.map((u) => ({ type: 'url', value: u }))
  const allItems = [...urlItems, ...fileItems]
  const itemsPath = path.join(workDir, 'items.json')
  fs.writeFileSync(itemsPath, JSON.stringify(allItems, null, 2))

  // ID unique pour ce batch extract
  const batchExtractId = `batchext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  // Lancer le subprocess Python de manière synchrone
  const pythonPath = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn(pythonPath, [
        '-m', 'pipeline.mc_prep', 'batch-extract',
        '--items-file', itemsPath,
        '--output-dir', workDir,
        '--num-frames', '4',
      ], {
        cwd: projectRoot,
        env: {
          ...process.env,
          ...(process.env.INSTAGRAM_COOKIES ? { INSTAGRAM_COOKIES: process.env.INSTAGRAM_COOKIES } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      proc.stdout.on('data', (data: Buffer) => stdoutChunks.push(data))
      proc.stderr.on('data', (data: Buffer) => stderrChunks.push(data))

      proc.on('close', (code) => {
        const stdout = Buffer.concat(stdoutChunks).toString()
        const stderr = Buffer.concat(stderrChunks).toString()
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderr.slice(0, 500)}`))
        } else {
          resolve({ stdout, stderr })
        }
      })

      proc.on('error', (err) => reject(err))
    })

    if (result.stderr) {
      console.log(`[mc-prep-batch-extract:${batchExtractId}][stderr]`, result.stderr.slice(0, 500))
    }

    // Parse stdout : chaque ligne est un événement JSON
    const lines = result.stdout.split('\n').filter(Boolean)
    const videos: MCPrepBatchExtractVideo[] = []
    const responseVideos: {
      videoIndex: number
      source: string
      frames: { index: number; timestamp: number; url: string }[]
      error?: string
    }[] = []

    for (const line of lines) {
      try {
        const evt = JSON.parse(line)
        if (evt.type === 'extract' && evt.status === 'done' && evt.frames) {
          const videoIndex = evt.videoIndex as number
          const source = allItems[videoIndex]?.value || ''

          // Enregistrer dans mcPrepExtracts pour que /api/mc-prep/frame/[extractId]/[index] fonctionne
          const extractId = `${batchExtractId}_v${videoIndex}`
          const frames = (evt.frames as { index: number; timestamp: number; path: string }[])

          mcPrepExtracts.set(extractId, {
            userId: session.user.id,
            videoPath: evt.video_path || '',
            frames,
            workDir,
            createdAt: Date.now(),
          })

          // Construire les URLs des frames
          const frameUrls = frames.map(f => ({
            index: f.index,
            timestamp: f.timestamp,
            url: `/api/mc-prep/frame/${extractId}/${f.index}`,
          }))

          videos.push({
            videoIndex,
            source,
            videoPath: evt.video_path || '',
            frames,
          })

          responseVideos.push({
            videoIndex,
            source,
            frames: frameUrls,
          })
        } else if (evt.type === 'extract' && evt.status === 'error') {
          const videoIndex = evt.videoIndex as number
          const source = allItems[videoIndex]?.value || ''
          responseVideos.push({
            videoIndex,
            source,
            frames: [],
            error: evt.error || 'Extraction failed',
          })
        }
      } catch {
        // Ligne non-JSON (log Python) — ignorer
        console.log(`[mc-prep-batch-extract:${batchExtractId}]`, line)
      }
    }

    // Stocker l'état du batch extract
    mcPrepBatchExtracts.set(batchExtractId, {
      userId: session.user.id,
      workDir,
      videos,
      createdAt: Date.now(),
    })

    // Nettoyage automatique après 2h
    setTimeout(() => {
      mcPrepBatchExtracts.delete(batchExtractId)
      // Nettoyer aussi les extract sessions individuelles
      for (const video of videos) {
        const extractId = `${batchExtractId}_v${video.videoIndex}`
        mcPrepExtracts.delete(extractId)
      }
      try {
        fs.rmSync(workDir, { recursive: true, force: true })
      } catch {}
    }, 2 * 60 * 60 * 1000)

    return NextResponse.json({
      batchExtractId,
      videos: responseVideos,
    })

  } catch (err: unknown) {
    console.error(`[mc-prep-batch-extract:${batchExtractId}] error:`, err)
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Extraction error: ${msg.slice(0, 300)}` }, { status: 500 })
  }
}
