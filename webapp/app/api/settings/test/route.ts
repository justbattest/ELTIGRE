/**
 * GET /api/settings/test — teste les 3 connexions et retourne les statuts.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execAsync = promisify(exec)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const results: Record<string, { ok: boolean; message: string }> = {}

  // Test Apify
  const apifyKey = decryptIfPresent(creds?.apifyApiKey)
  if (apifyKey) {
    try {
      const resp = await fetch('https://api.apify.com/v2/users/me', {
        headers: { Authorization: `Bearer ${apifyKey}` },
      })
      if (resp.ok) {
        results.apify = { ok: true, message: 'Connecté' }
      } else {
        results.apify = { ok: false, message: `Erreur ${resp.status}` }
      }
    } catch (e) {
      results.apify = { ok: false, message: String(e) }
    }
  } else {
    results.apify = { ok: false, message: 'Clé non configurée' }
  }

  // Test Anthropic
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (anthropicKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
      })
      if (resp.ok) {
        results.anthropic = { ok: true, message: 'claude-sonnet-4-6 disponible' }
      } else {
        results.anthropic = { ok: false, message: `Erreur ${resp.status}` }
      }
    } catch (e) {
      results.anthropic = { ok: false, message: String(e) }
    }
  } else {
    results.anthropic = { ok: false, message: 'Clé non configurée' }
  }

  // Test Higgsfield via CLI
  const higgsToken = decryptIfPresent(creds?.higgsFieldToken)
  if (higgsToken) {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_test_'))
    try {
      const credsDir = path.join(tmpHome, '.config', 'higgsfield')
      fs.mkdirSync(credsDir, { recursive: true })
      fs.writeFileSync(
        path.join(credsDir, 'credentials.json'),
        JSON.stringify({ access_token: higgsToken, refresh_token: '' })
      )

      const { stdout } = await execAsync('higgsfield account status', {
        env: { ...process.env, HOME: tmpHome },
        timeout: 15000,
      })

      // Extraire email et crédits depuis stdout
      const emailMatch = stdout.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
      const creditsMatch = stdout.match(/(\d+(?:\.\d+)?)\s*credits?/i)
      const planMatch = stdout.match(/(Ultra|Pro|Free|Starter)/i)

      const email = emailMatch ? emailMatch[1] : 'Connecté'
      const credits = creditsMatch ? creditsMatch[1] : '?'
      const plan = planMatch ? planMatch[1] : ''

      results.higgsfield = {
        ok: true,
        message: `${email}${plan ? ' · ' + plan : ''} · ${credits} crédits`,
      }
    } catch (e) {
      results.higgsfield = { ok: false, message: `CLI error: ${String(e).substring(0, 100)}` }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  } else {
    results.higgsfield = { ok: false, message: 'Token non configuré' }
  }

  return NextResponse.json(results)
}
