/**
 * GET /api/settings/test — teste les connexions et retourne les statuts.
 * Testé : Apify, Anthropic, Higgsfield, Kling AI, Google Drive
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { checkAnthropicValidity, checkOpenAIValidity, checkDriveValidity } from '@/lib/provider-status'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

const execAsync = promisify(exec)

// ── Kling JWT helper (mirror of pipeline/kling_api.py) ─────────────────────
function generateKlingJwt(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

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
  results.anthropic = anthropicKey
    ? await checkAnthropicValidity(anthropicKey)
    : { ok: false, message: 'Clé non configurée' }

  // Test OpenAI
  const openaiKey = decryptIfPresent(creds?.openaiApiKey)
  results.openai = openaiKey
    ? await checkOpenAIValidity(openaiKey)
    : { ok: false, message: 'Clé non configurée' }

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

      const { stdout, stderr } = await execAsync('higgsfield account status', {
        env: { ...process.env, HOME: tmpHome },
        timeout: 15000,
      })

      const combined = stdout + stderr

      // Session expirée détectée dans la sortie
      if (combined.includes('Session expired') || combined.includes('hf auth login')) {
        results.higgsfield = { ok: false, message: 'Session expirée — cliquez sur Reconnecter' }
      } else {
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
      }
    } catch (e: unknown) {
      // execAsync throws on non-zero exit — stderr/stdout may be in the error object
      const errObj = e as { stderr?: string; stdout?: string; message?: string }
      const errMsg = (errObj.stderr || '') + (errObj.stdout || '') + (errObj.message || '') + String(e)
      if (errMsg.includes('Session expired') || errMsg.includes('hf auth login')) {
        results.higgsfield = { ok: false, message: 'Session expirée — cliquez sur Reconnecter' }
      } else {
        results.higgsfield = { ok: false, message: `Erreur CLI: ${errMsg.substring(0, 100)}` }
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  } else {
    results.higgsfield = { ok: false, message: 'Token non configuré' }
  }

  // Test Kling AI API
  const klingAccessKey = decryptIfPresent(creds?.klingAccessKey)
  const klingSecretKey = decryptIfPresent(creds?.klingSecretKey)
  if (klingAccessKey && klingSecretKey) {
    try {
      const token = generateKlingJwt(klingAccessKey, klingSecretKey)
      // List tasks endpoint — lightweight read-only call
      const resp = await fetch('https://api-singapore.klingai.com/v1/videos/motion-control?pageSize=1', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      const body = await resp.json().catch(() => ({}))
      if (resp.ok || body.code === 0) {
        results.kling = { ok: true, message: 'Connecté · Motion Control API accessible' }
      } else {
        results.kling = { ok: false, message: `Erreur ${resp.status} · code ${body.code ?? '?'}: ${body.message ?? ''}` }
      }
    } catch (e) {
      results.kling = { ok: false, message: `Erreur réseau: ${String(e).substring(0, 100)}` }
    }
  } else {
    results.kling = { ok: false, message: 'Clés Access/Secret non configurées' }
  }

  // Test Google Drive (vérifie si refresh token valide via token endpoint)
  const googleRefreshToken = creds?.googleRefreshToken
  results.drive = googleRefreshToken
    ? await checkDriveValidity(googleRefreshToken)
    : { ok: false, message: 'Non connecté — cliquez sur Connecter Drive' }

  return NextResponse.json(results)
}
