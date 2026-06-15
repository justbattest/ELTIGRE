/**
 * POST /api/spoofer/start
 * Phase 2/2 — lance le subprocess Python sur les fichiers déjà enregistrés.
 * Appelé après que tous les chunks ont été uploadés via /api/spoofer/upload.
 *
 * Body JSON : { runId, level, variations, noMirror? }
 * Retourne  : { ok: true, runId, fileCount }
 * Stream SSE via : GET /api/spoofer/events/[runId]
 * Téléchargement  : GET /api/spoofer/download/[runId] (une fois `done`)
 *
 * Pas de credentials externes nécessaires — tout le traitement est local
 * (PIL/numpy/opencv/torch + ffmpeg bundle imageio-ffmpeg).
 *
 * Mirror de webapp/app/api/metadata/start/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { spooferRuns } from '@/lib/spoofer-state'

const VALID_LEVELS = new Set(['light', 'medium', 'aggressive'])

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json() as { runId?: string; level?: string; variations?: number; noMirror?: boolean }
  const { runId } = body
  const level = VALID_LEVELS.has(body.level || '') ? (body.level as string) : 'medium'
  const variationsRaw = Number(body.variations)
  const variations = Math.max(1, Math.min(20, Number.isFinite(variationsRaw) ? Math.round(variationsRaw) : 5))
  const noMirror = body.noMirror === true

  if (!runId) return NextResponse.json({ error: 'runId manquant' }, { status: 400 })

  const uploadDir = path.join('/tmp', runId, 'uploads')
  if (!fs.existsSync(uploadDir)) {
    return NextResponse.json({ error: `Dossier ${runId} introuvable (session expirée ?)` }, { status: 404 })
  }

  const fileCount = fs.readdirSync(uploadDir).length
  if (fileCount === 0) {
    return NextResponse.json({ error: 'Aucun fichier trouvé pour ce run' }, { status: 400 })
  }

  const outputDir = path.join('/tmp', runId, `output_${runId}`)

  // Mettre à jour le slot SSE
  const existing = spooferRuns.get(runId)
  spooferRuns.set(runId, {
    events: existing?.events ?? [],
    done: false,
    startedAt: existing?.startedAt ?? Date.now(),
    userId: session.user.id,
    uploading: false,
    totalFiles: existing?.totalFiles ?? fileCount,
    level,
    variations,
    outputDir,
  })

  const pythonPath  = path.join(process.cwd(), '..', 'venv', 'bin', 'python')
  const projectRoot = path.join(process.cwd(), '..')

  console.log(`[spoofer:${runId}] démarrage subprocess — ${fileCount} fichiers, niveau=${level}, variations=${variations}`)

  const args = [
    '-m', 'pipeline.spoofer',
    '--run-id',    runId,
    '--files-dir', uploadDir,
    '--level',     level,
    '--variations', String(variations),
    '--output-dir', outputDir,
  ]
  if (noMirror) args.push('--no-mirror')

  const proc = spawn(
    pythonPath,
    args,
    {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  proc.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean)
    const state = spooferRuns.get(runId)
    if (!state) return
    for (const line of lines) {
      console.log(`[spoofer:${runId}]`, line)
      state.events.push(line)
    }
  })

  proc.stderr.on('data', (data: Buffer) => {
    const text = data.toString().trim()
    if (text) {
      console.error(`[spoofer:${runId}][stderr]`, text)
      const state = spooferRuns.get(runId)
      if (state && !state.done) {
        state.events.push(JSON.stringify({ type: 'stderr', msg: text }))
      }
    }
  })

  proc.on('close', (code) => {
    console.log(`[spoofer:${runId}] subprocess terminé (code ${code})`)
    const state = spooferRuns.get(runId)
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
    // Nettoyage différé — laisse le temps au téléchargement du ZIP.
    // Si le ZIP est téléchargé avant, /api/spoofer/download supprime déjà tout
    // et retire l'entrée de la map ; ce timeout devient alors un no-op inoffensif.
    setTimeout(() => {
      try { fs.rmSync(path.join('/tmp', runId), { recursive: true, force: true }) } catch {}
      spooferRuns.delete(runId)
    }, 30 * 60 * 1000)
  })

  proc.on('error', (err) => {
    console.error(`[spoofer:${runId}] spawn error:`, err)
    const state = spooferRuns.get(runId)
    if (state) {
      state.events.push(JSON.stringify({ type: 'error', message: `Spawn error: ${err.message}` }))
      state.done = true
    }
  })

  return NextResponse.json({ ok: true, runId, fileCount })
}
