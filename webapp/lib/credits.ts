/**
 * Modelify — moteur de crédits.
 *
 * Un wallet par utilisateur (`credit_wallets`), un journal immuable
 * (`credit_transactions`). Tous les mouvements passent par `$transaction` afin
 * que solde + ligne de journal soient cohérents, et que le débit soit sûr en
 * cas de concurrence (décrément conditionnel sur le solde).
 */

import { prisma } from '@/lib/prisma'

/** Erreur levée par `debit()` quand le solde est insuffisant. */
export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS' as const
  constructor(
    readonly balance: number,
    readonly required: number,
  ) {
    super(`Crédits insuffisants : solde ${balance}, requis ${required}`)
    this.name = 'InsufficientCreditsError'
  }
}

/** Crée le wallet à 0 s'il n'existe pas. Retourne le solde courant. */
export async function ensureWallet(userId: string): Promise<number> {
  const wallet = await prisma.creditWallet.upsert({
    where: { userId },
    create: { userId, balance: 0 },
    update: {},
    select: { balance: true },
  })
  return wallet.balance
}

/** Solde courant. Crée le wallet (à 0) paresseusement s'il manque. */
export async function getBalance(userId: string): Promise<number> {
  return ensureWallet(userId)
}

/**
 * Débite `amount` crédits. Atomique et sûr en concurrence : le décrément du
 * wallet est conditionné à `balance >= amount` ; si 0 ligne n'est affectée,
 * c'est que le solde est insuffisant → on lève `InsufficientCreditsError`.
 *
 * Écrit aussi une ligne de `credit_transactions` (delta négatif).
 * Retourne le nouveau solde.
 */
export async function debit(
  userId: string,
  amount: number,
  reason: string,
  runId?: string,
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Montant de débit invalide : ${amount}`)
  }

  // S'assure que le wallet existe avant le décrément conditionnel.
  await ensureWallet(userId)

  return prisma.$transaction(async (tx) => {
    // Décrément conditionnel : updateMany filtre sur balance >= amount.
    // count === 0 ⇒ solde insuffisant (ou course perdue) ⇒ rollback.
    const updated = await tx.creditWallet.updateMany({
      where: { userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    })

    if (updated.count === 0) {
      const current = await tx.creditWallet.findUnique({
        where: { userId },
        select: { balance: true },
      })
      throw new InsufficientCreditsError(current?.balance ?? 0, amount)
    }

    const wallet = await tx.creditWallet.findUniqueOrThrow({
      where: { userId },
      select: { balance: true },
    })

    await tx.creditTransaction.create({
      data: {
        userId,
        delta: -amount,
        reason,
        runId: runId ?? null,
        balanceAfter: wallet.balance,
      },
    })

    return wallet.balance
  })
}

/**
 * Crédite `amount` crédits (achat, octroi, remboursement...).
 * Incrémente le wallet et écrit une ligne de journal (delta positif).
 * Retourne le nouveau solde.
 */
export async function credit(
  userId: string,
  amount: number,
  reason: string,
): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Montant de crédit invalide : ${amount}`)
  }

  return prisma.$transaction(async (tx) => {
    const wallet = await tx.creditWallet.upsert({
      where: { userId },
      create: { userId, balance: amount },
      update: { balance: { increment: amount } },
      select: { balance: true },
    })

    await tx.creditTransaction.create({
      data: {
        userId,
        delta: amount,
        reason,
        balanceAfter: wallet.balance,
      },
    })

    return wallet.balance
  })
}
