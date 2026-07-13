/**
 * POST /api/refset/enhance
 *
 * Stage B : édite des images du set de référence via ModelArk (Seedream 4.5).
 * - boost : augmentation homogène de la poitrine (même seed sur tout le set)
 * - back  : vue de dos par image
 * Spawn pipeline.model_enhance, retourne { runId }. Progress via SSE /api/refset/events/[runId].
 * Images servies via /api/refset/image/[runId]/[name].
 *
 * Body JSON :
 *   { items: [{runId, name}], mode?: 'boost'|'back'|'both', seed?, size? }
 *   (chaque image est lue depuis le workDir de SON run Stage A — gère les régénérations)
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

  const body = await req.json().catch(() => ({}))
  const items: { runId: string; name: string }[] = Array.isArray(body.items)
    ? body.items.map((it: { runId?: unknown; name?: unknown }) => ({ runId: String(it.runId || ''), name: String(it.name || '') }))
    : []
  const mode = ['morph', 'back', 'both'].includes(body.mode) ? body.mode : 'morph'
  const route = ['wavespeed', 'modelark'].includes(body.route) ? body.route : 'wavespeed'
  const bustIdx = Number.isInteger(body.bustIdx) ? Math.max(0, Math.min(3, body.bustIdx)) : 0
  const hips = ['wide', 'moderate', 'subtle'].includes(body.hips) ? body.hips : 'wide'
  const keepFraming = body.keepFraming === true
  const buttIdx = Number.isInteger(body.buttIdx) ? Math.max(0, Math.min(2, body.buttIdx)) : 1
  const keepDress = body.keepDress === true
  const seed = Number.isInteger(body.seed) ? body.seed : 778899
  const anchorDataUrl = typeof body.anchorDataUrl === 'string' ? body.anchorDataUrl : ''

  if (!items.length) return NextResponse.json({ error: 'Aucune image sélectionnée' }, { status: 400 })
  if (route === 'wavespeed' && !process.env.WAVESPEED_API_KEY) {
    return NextResponse.json({ error: 'WAVESPEED_API_KEY absente de l\'environnement serveur' }, { status: 400 })
  }
  if (route === 'modelark' && !process.env.ARK_API_KEY) {
    return NextResponse.json({ error: 'ARK_API_KEY absente de l\'environnement serveur' }, { status: 400 })
  }

  // Résoudre les chemins depuis le workDir de chaque run source (anti path-traversal)
  const paths: string[] = []
  for (const it of items) {
    const src = refsetRuns.get(it.runId)
    if (!src || src.userId !== session.user.id) continue
    const safe = path.basename(it.name)
    if (safe !== it.name) continue
    const fp = path.join(src.workDir, safe)
    if (fs.existsSync(fp)) paths.push(fp)
  }
  if (!paths.length) return NextResponse.json({ error: 'Images introuvables (runs source expirés ?)' }, { status: 422 })

  const runId = `enhance_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const projectRoot = path.join(process.cwd(), '..')
  const workDir = path.join(projectRoot, 'temp', 'refset', runId)
  fs.mkdirSync(workDir, { recursive: true })

  refsetRuns.set(runId, {
    userId: session.user.id,
    events: [],
    done: false,
    workDir,
    startedAt: Date.now(),
  })

  // Ancre d'identité (optionnelle) → multi-référence Seedream
  let anchorPath = ''
  const am = anchorDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
  if (am) {
    const ext = am[1] === 'image/png' ? 'png' : am[1] === 'image/webp' ? 'webp' : 'jpg'
    anchorPath = path.join(workDir, `anchor.${ext}`)
    fs.writeFileSync(anchorPath, Buffer.from(am[2], 'base64'))
  }

  const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python')
  const args = [
    '-m', 'pipeline.model_enhance', 'generate',
    '--run-id', runId,
    '--images', paths.join('|'),
    '--output-dir', workDir,
    '--mode', mode,
    '--route', route,
    '--bust-idx', String(bustIdx),
    '--hips', hips,
    '--seed', String(seed),
    '--butt-idx', String(buttIdx),
    '--storage-prefix', `${session.user.id}/edits/${runId}`,
    ...(keepFraming ? ['--keep-framing'] : []),
    ...(keepDress ? ['--keep-dress'] : []),
    ...(anchorPath ? ['--anchor-path', anchorPath] : []),
  ]

  const proc = spawn(pythonPath, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      ARK_API_KEY: process.env.ARK_API_KEY,
      ARK_BASE_URL: process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3',
      MODELIFY_IMAGE_MODEL: process.env.MODELIFY_IMAGE_MODEL || 'seedream-4-5-251128',
      ...(process.env.WAVESPEED_API_KEY ? { WAVESPEED_API_KEY: process.env.WAVESPEED_API_KEY } : {}),
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
      console.log(`[enhance:${runId}]`, line.slice(0, 200))
      runState.events.push(line)
    }
  })
  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) console.error(`[enhance:${runId}][stderr]`, text.slice(0, 300))
  })

  proc.on('close', (code) => {
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
    setTimeout(() => {
      refsetRuns.delete(runId)
      try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {}
    }, 2 * 60 * 60 * 1000)
  })

  proc.on('error', (err) => {
    const state = refsetRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', msg: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ runId })
}
