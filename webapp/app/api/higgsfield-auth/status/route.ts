import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent, encrypt } from '@/lib/crypto'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ valid: false })

    // ── Always use session.user.id (CUID), never session.user.email ─────────
    const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
    if (!creds?.higgsFieldToken) return NextResponse.json({ valid: false })

    const accessToken = decryptIfPresent(creds.higgsFieldToken)
    if (!accessToken) return NextResponse.json({ valid: false })

    const refreshToken = decryptIfPresent(creds.higgsFieldRefreshToken ?? '') || ''

    // Check validity with CLI
    const result = await checkHiggsToken(accessToken, session.user.id)

    if (result.valid) return NextResponse.json({ valid: true, email: result.email })

    // If expired AND we have a refresh token → try to refresh silently
    if (result.expired && refreshToken) {
      try {
        const refreshResult = await refreshHiggsToken(refreshToken)
        if (refreshResult.access_token) {
          const newEncryptedToken = encrypt(refreshResult.access_token)
          const newEncryptedRefresh = refreshResult.refresh_token
            ? encrypt(refreshResult.refresh_token)
            : creds.higgsFieldRefreshToken

          await prisma.userCredentials.update({
            where: { userId: session.user.id },
            data: {
              higgsFieldToken: newEncryptedToken,
              higgsFieldRefreshToken: newEncryptedRefresh,
            },
          })

          // Verify new token works
          const retryResult = await checkHiggsToken(refreshResult.access_token, session.user.id)
          if (retryResult.valid) {
            return NextResponse.json({ valid: true, email: retryResult.email, refreshed: true })
          }
        }
      } catch {
        // Refresh failed — fall through to invalid
      }
    }

    return NextResponse.json({ valid: false })
  } catch {
    return NextResponse.json({ valid: false })
  }
}

/**
 * Check Higgsfield token validity via CLI.
 * Strategy: only return expired=true if the CLI *explicitly* says the session is expired.
 * Any CLI error (timeout, binary not found, etc.) → assume valid (avoids false "disconnected").
 */
async function checkHiggsToken(
  accessToken: string,
  userId: string
): Promise<{ valid: boolean; expired: boolean; email?: string }> {
  const tmpHome = join(tmpdir(), `hf_status_${userId.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}`)
  const configDir = join(tmpHome, '.config', 'higgsfield')

  try {
    mkdirSync(configDir, { recursive: true })
    writeFileSync(
      join(configDir, 'credentials.json'),
      JSON.stringify({ access_token: accessToken, refresh_token: '' })
    )

    return await new Promise((resolve) => {
      const higgsfield = process.env.HIGGSFIELD_CLI_PATH || 'higgsfield'
      const proc = spawn(higgsfield, ['account', 'status'], {
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      })

      let stdout = ''
      let stderr = ''
      proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString() })
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', () => {
        const combined = (stdout + stderr).toLowerCase()

        // Only mark as expired if the CLI explicitly says so
        const isExpired =
          combined.includes('session expired') ||
          combined.includes('hf auth login') ||
          combined.includes('not logged') ||
          combined.includes('please login') ||
          combined.includes('unauthenticated')

        if (isExpired) {
          resolve({ valid: false, expired: true })
        } else {
          // CLI ran without explicit session error → valid
          // (covers exitCode=0, any output, or ambiguous output)
          const emailMatch = stdout.match(/[\w.-]+@[\w.-]+\.\w+/)
          resolve({ valid: true, expired: false, email: emailMatch?.[0] })
        }
      })

      // CLI binary not found or other OS error → assume valid (token exists in DB)
      proc.on('error', () => resolve({ valid: true, expired: false }))
    })
  } finally {
    try { rmSync(tmpHome, { recursive: true, force: true }) } catch {}
  }
}

async function refreshHiggsToken(
  refreshToken: string
): Promise<{ access_token?: string; refresh_token?: string }> {
  const response = await fetch('https://fnf-device-auth.higgsfield.ai/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) throw new Error(`Refresh failed: ${response.status}`)
  return response.json()
}
