import { prisma } from '@/lib/prisma'
import { decryptIfPresent, encrypt } from '@/lib/crypto'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export type HiggsfieldStatusResult = { valid: boolean; refreshed?: boolean; email?: string }

/**
 * Real Higgsfield connection check for a user: validates the stored token via the CLI,
 * silently refreshing it via the stored refresh token if the CLI reports an expired session.
 * Shared by /api/higgsfield-auth/status and /api/dashboard/status.
 */
export async function checkHiggsfieldStatus(userId: string): Promise<HiggsfieldStatusResult> {
  try {
    const creds = await prisma.userCredentials.findUnique({ where: { userId } })
    if (!creds?.higgsFieldToken) return { valid: false }

    const accessToken = decryptIfPresent(creds.higgsFieldToken)
    if (!accessToken) return { valid: false }

    const refreshToken = decryptIfPresent(creds.higgsFieldRefreshToken ?? '') || ''

    const result = await checkHiggsToken(accessToken, userId)
    if (result.valid) return { valid: true, email: result.email }

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
            where: { userId },
            data: {
              higgsFieldToken: newEncryptedToken,
              higgsFieldRefreshToken: newEncryptedRefresh,
            },
          })

          const retryResult = await checkHiggsToken(refreshResult.access_token, userId)
          if (retryResult.valid) {
            return { valid: true, email: retryResult.email, refreshed: true }
          }
        }
      } catch {
        // Refresh failed — fall through to invalid
      }
    }

    return { valid: false }
  } catch {
    return { valid: false }
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

        const isExpired =
          combined.includes('session expired') ||
          combined.includes('hf auth login') ||
          combined.includes('not logged') ||
          combined.includes('please login') ||
          combined.includes('unauthenticated')

        if (isExpired) {
          resolve({ valid: false, expired: true })
        } else {
          const emailMatch = stdout.match(/[\w.-]+@[\w.-]+\.\w+/)
          resolve({ valid: true, expired: false, email: emailMatch?.[0] })
        }
      })

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
