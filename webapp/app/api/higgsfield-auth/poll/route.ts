/**
 * GET /api/higgsfield-auth/poll
 * Vérifie si l'utilisateur a approuvé le device code.
 * Poll les credentials.json toutes les 2s pendant max 5 min.
 * Quand approuvé : chiffre et stocke le token en DB.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import * as fs from 'fs'
import * as path from 'path'
import { pendingAuths } from '../start/route'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const userId = session.user.id
  const pending = pendingAuths.get(userId)

  if (!pending) {
    console.log(`[higgsfield-auth/poll] no pending entry for user ${userId} (pendingAuths size: ${pendingAuths.size})`)
    return NextResponse.json({ status: 'no_pending' })
  }

  const credsFile = path.join(pending.tmpHome, '.config', 'higgsfield', 'credentials.json')
  const fileExists = fs.existsSync(credsFile)
  console.log(`[higgsfield-auth/poll] user ${userId} — credsFile exists: ${fileExists}, process exited: ${!!pending.state?.exited}`)

  if (!fileExists) {
    // Le process CLI a déjà quitté (crash, timeout interne...) et n'a jamais écrit
    // le fichier — sans cette vérification, on resterait bloqué sur "waiting"
    // indéfiniment jusqu'au cleanup 5 min, sans jamais remonter la vraie erreur.
    if (pending.state?.exited) {
      clearTimeout(pending.timeoutId)
      try { fs.rmSync(pending.tmpHome, { recursive: true, force: true }) } catch {}
      pendingAuths.delete(userId)
      const detail = (pending.state.output || '').trim().slice(-300)
      return NextResponse.json({
        status: 'error',
        message: `Higgsfield CLI stopped (exit code ${pending.state.exitCode}) before approval was detected.${detail ? ` Output: ${detail}` : ''}`,
      })
    }
    return NextResponse.json({ status: 'waiting' })
  }

  try {
    const raw = fs.readFileSync(credsFile, 'utf8')
    const creds = JSON.parse(raw)

    if (!creds.access_token) {
      return NextResponse.json({ status: 'waiting' })
    }

    console.log(`[higgsfield-auth/poll] Token obtained for user ${userId} — refresh_token present: ${!!creds.refresh_token}`)

    // ✅ Token obtenu — chiffrer et stocker en DB
    await prisma.userCredentials.upsert({
      where: { userId },
      create: {
        userId,
        higgsFieldToken: encrypt(creds.access_token),
        higgsFieldRefreshToken: creds.refresh_token ? encrypt(creds.refresh_token) : null,
      },
      update: {
        higgsFieldToken: encrypt(creds.access_token),
        higgsFieldRefreshToken: creds.refresh_token ? encrypt(creds.refresh_token) : null,
      },
    })

    // Cleanup
    clearTimeout(pending.timeoutId)
    try { pending.proc?.kill() } catch {}
    try { fs.rmSync(pending.tmpHome, { recursive: true, force: true }) } catch {}
    pendingAuths.delete(userId)

    return NextResponse.json({ status: 'approved', refreshTokenSaved: !!creds.refresh_token })
  } catch {
    return NextResponse.json({ status: 'waiting' })
  }
}
