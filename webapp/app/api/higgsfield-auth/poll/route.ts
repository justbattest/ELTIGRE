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
import * as os from 'os'
import * as path from 'path'
import { pendingAuths } from '../start/route'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const userId = session.user.id
  const pending = pendingAuths.get(userId)

  if (!pending) {
    return NextResponse.json({ status: 'no_pending' })
  }

  // En prod (Linux), le CLI respecte HOME=tmpHome → creds isolés dans tmpHome.
  // Sur Windows, le binaire ignore HOME et écrit dans ~/.config (USERPROFILE) :
  // on ajoute ce chemin en fallback uniquement sur win32 pour ne pas casser
  // l'isolation multi-utilisateur en prod.
  const candidates = [
    path.join(pending.tmpHome, '.config', 'higgsfield', 'credentials.json'),
  ]
  if (process.platform === 'win32') {
    candidates.push(path.join(os.homedir(), '.config', 'higgsfield', 'credentials.json'))
  }
  const credsFile = candidates.find((f) => fs.existsSync(f))

  if (!credsFile) {
    return NextResponse.json({ status: 'waiting' })
  }

  try {
    const raw = fs.readFileSync(credsFile, 'utf8')
    const creds = JSON.parse(raw)

    if (!creds.access_token) {
      return NextResponse.json({ status: 'waiting' })
    }

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

    return NextResponse.json({ status: 'approved' })
  } catch {
    return NextResponse.json({ status: 'waiting' })
  }
}
