/**
 * POST /api/higgsfield-auth/start
 * Lance higgsfield auth login, capture l'URL du device code, retourne l'URL au client.
 * Stocke le processus en attente dans une Map globale (fonctionne sur Railway mono-process).
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

// Map globale : userId → { tmpHome, resolve, reject, timeoutId }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingAuths: Map<string, any> = new Map()

// Exporter pour que /poll puisse y accéder
export { pendingAuths }

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const userId = session.user.id

  // Annuler un auth précédent si en cours
  if (pendingAuths.has(userId)) {
    const old = pendingAuths.get(userId)
    try { old.proc?.kill() } catch {}
    try { fs.rmSync(old.tmpHome, { recursive: true, force: true }) } catch {}
    clearTimeout(old.timeoutId)
    pendingAuths.delete(userId)
  }

  const tmpHome = path.join('/tmp', `hf_auth_${userId}_${Date.now()}`)
  const credsDir = path.join(tmpHome, '.config', 'higgsfield')
  fs.mkdirSync(credsDir, { recursive: true })

  return new Promise<Response>((resolve) => {
    const proc = spawn('higgsfield', ['auth', 'login'], {
      env: { ...process.env, HOME: tmpHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let deviceUrl: string | null = null
    let resolved = false

    const onLine = (line: string) => {
      const match = line.match(/https:\/\/higgsfield\.ai\/device\?code=\S+/)
      if (match && !resolved) {
        deviceUrl = match[0]
        resolved = true

        // Stocker pour que /poll puisse retrouver le process
        const timeoutId = setTimeout(() => {
          try { proc.kill() } catch {}
          try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch {}
          pendingAuths.delete(userId)
        }, 5 * 60 * 1000) // cleanup auto après 5 min

        pendingAuths.set(userId, { proc, tmpHome, timeoutId })

        resolve(
          NextResponse.json({ deviceUrl, message: 'En attente d\'approbation...' })
        )
      }
    }

    proc.stdout.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach(onLine)
    })
    proc.stderr.on('data', (data: Buffer) => {
      data.toString().split('\n').forEach(onLine)
    })

    proc.on('error', (err) => {
      if (!resolved) {
        resolved = true
        resolve(NextResponse.json({ error: `CLI error: ${err.message}` }, { status: 500 }))
      }
    })

    // Timeout 30s pour obtenir l'URL
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        try { proc.kill() } catch {}
        try { fs.rmSync(tmpHome, { recursive: true, force: true }) } catch {}
        resolve(NextResponse.json({ error: 'Timeout: URL non obtenue en 30s' }, { status: 504 }))
      }
    }, 30000)
  })
}
