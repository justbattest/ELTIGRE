/**
 * POST /api/refset/generate
 *
 * Lance le moteur Gemini i2i (pipeline.model_refset generate) : ancre + prompts → set d'images.
 * Spawn subprocess Python, retourne { runId }. Progress via SSE GET /api/refset/events/[runId].
 * Les images sont servies via GET /api/refset/image/[runId]/[name].
 *
 * Body JSON :
 *   { anchorDataUrl, prompts: [{id,label,prompt}], resolution?, aspectRatio? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { refsetRuns } from '@/lib/refset-state'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY absente de l\'environnement serveur' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const anchorDataUrl = String(body.anchorDataUrl || '')
  const prompts = Array.isArray(body.prompts) ? body.prompts : []
  const resolution = ['0.5K', '1K', '2K', '4K'].includes(body.resolution) ? body.resolution : '2K'
  const aspectRatio = typeof body.aspectRatio === 'string' && body.aspectRatio ? body.aspectRatio : '9:16'

  const m = anchorDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
  if (!m) return NextResponse.json({ error: 'Ancre (anchorDataUrl) invalide' }, { status: 400 })
  if (!prompts.length) return NextResponse.json({ error: 'Aucun prompt fourni' }, { status: 400 })

  const cleanPrompts = prompts
    .map((p: { id?: unknown; label?: unknown; prompt?: unknown }, i: number) => ({
      id: String(p.id ?? i + 1),
      label: String(p.label ?? ''),
      prompt: String(p.prompt ?? ''),
    }))
    .filter((p: { prompt: string }) => p.prompt.trim())
  if (!cleanPrompts.length) return NextResponse.json({ error: 'Prompts vides' }, { status: 400 })

  const runId = `refset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const projectRoot = path.join(process.cwd(), '..')
  const workDir = path.join(projectRoot, 'temp', 'refset', runId)
  fs.mkdirSync(workDir, { recursive: true })

  const ext = m[1] === 'image/png' ? 'png' : m[1] === 'image/webp' ? 'webp' : 'jpg'
  const anchorPath = path.join(workDir, `anchor.${ext}`)
  fs.writeFileSync(anchorPath, Buffer.from(m[2], 'base64'))

  const promptsPath = path.join(workDir, 'prompts.json')
  fs.writeFileSync(promptsPath, JSON.stringify(cleanPrompts), 'utf-8')

  refsetRuns.set(runId, {
    userId: session.user.id,
    events: [],
    done: false,
    workDir,
    startedAt: Date.now(),
  })

  const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python')
  const args = [
    '-m', 'pipeline.model_refset', 'generate',
    '--run-id', runId,
    '--anchor-path', anchorPath,
    '--prompts-json', promptsPath,
    '--output-dir', workDir,
    '--resolution', resolution,
    '--aspect-ratio', aspectRatio,
    '--storage-prefix', `${session.user.id}/refset/${runId}`,
  ]

  const proc = spawn(pythonPath, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      ...(process.env.SUPABASE_URL ? { SUPABASE_URL: process.env.SUPABASE_URL } : {}),
      ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
      ...(process.env.MODELIFY_STORAGE_BUCKET ? { MODELIFY_STORAGE_BUCKET: process.env.MODELIFY_STORAGE_BUCKET } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const runState = refsetRuns.get(runId)!
  runState.proc = proc

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    for (const line of lines) {
      console.log(`[refset:${runId}]`, line.slice(0, 200))
      runState.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[refset:${runId}][stderr]`, text.slice(0, 300))
  })

  proc.on('close', (code) => {
    console.log(`[refset:${runId}] exited code ${code}`)
    const state = refsetRuns.get(runId)
    if (state) {
      const hasDone = state.events.some(e => {
        try { return ['done', 'error'].includes(JSON.parse(e).type) } catch { return false }
      })
      if (!hasDone) {
        state.events.push(JSON.stringify({ type: code === 0 ? 'done' : 'error', msg: code !== 0 ? `Process exited (code ${code})` : undefined }))
      }
      state.done = true
    }
    // Nettoyage du workDir 2h après la fin
    setTimeout(() => {
      refsetRuns.delete(runId)
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    }, 2 * 60 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[refset:${runId}] spawn error:`, err)
    const state = refsetRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', msg: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ runId })
}
