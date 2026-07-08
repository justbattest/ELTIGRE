import { prisma } from '@/lib/prisma'

export type LowBalanceProvider = 'anthropic' | 'openai'

/**
 * Persists a "low balance" flag for the given provider, set when a real generation
 * job fails with a credit/quota-exhausted error. Surfaced as a banner on the Dashboard.
 */
export async function markLowBalance(userId: string, provider: LowBalanceProvider): Promise<void> {
  try {
    await prisma.userCredentials.update({
      where: { userId },
      data: provider === 'anthropic'
        ? { anthropicLowBalance: true, anthropicLowBalanceAt: new Date() }
        : { openaiLowBalance: true, openaiLowBalanceAt: new Date() },
    })
  } catch {
    // best-effort — a missed flag just means the dashboard banner doesn't show up this time
  }
}

/**
 * Clears a previously-set low-balance flag, e.g. after a deliberate manual recheck succeeds.
 */
export async function clearLowBalance(userId: string, provider: LowBalanceProvider): Promise<void> {
  try {
    await prisma.userCredentials.update({
      where: { userId },
      data: provider === 'anthropic'
        ? { anthropicLowBalance: false, anthropicLowBalanceAt: null }
        : { openaiLowBalance: false, openaiLowBalanceAt: null },
    })
  } catch {
    // best-effort
  }
}

/** Anthropic's billing-related invalid_request_error message signature. */
export function isAnthropicLowBalanceError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('credit balance is too low') || m.includes('insufficient_quota')
}

/** OpenAI's insufficient_quota error signature (HTTP 429, error.type === 'insufficient_quota'). */
export function isOpenAILowBalanceError(message: string): boolean {
  return message.toLowerCase().includes('insufficient_quota')
}
