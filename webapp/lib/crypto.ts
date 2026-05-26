/**
 * AES-256-GCM encryption/decryption pour les credentials en base.
 * Format stocké : base64(nonce[12] + ciphertext + tag[16])
 * Compatible avec le chiffrement Python si besoin (même algo + format).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

/**
 * Dérive une clé 32 bytes depuis SECRET_KEY (SHA-256).
 */
function getKey(): Buffer {
  const secret = process.env.SECRET_KEY
  if (!secret) throw new Error('SECRET_KEY manquant dans les variables d\'environnement')
  return createHash('sha256').update(secret).digest()
}

/**
 * Chiffre une chaîne de caractères.
 * Retourne une chaîne base64 sûre à stocker en DB.
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  // Format : iv(12) + tag(16) + ciphertext
  const result = Buffer.concat([iv, tag, encrypted])
  return result.toString('base64')
}

/**
 * Déchiffre une chaîne chiffrée par encrypt().
 * Retourne null si le déchiffrement échoue (clé incorrecte, données corrompues).
 */
export function decrypt(encrypted: string): string | null {
  try {
    const key = getKey()
    const data = Buffer.from(encrypted, 'base64')

    const iv = data.subarray(0, IV_LENGTH)
    const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH)

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Chiffre uniquement si la valeur n'est pas nulle/vide.
 */
export function encryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null
  return encrypt(value)
}

/**
 * Déchiffre uniquement si la valeur n'est pas nulle.
 */
export function decryptIfPresent(value: string | null | undefined): string | null {
  if (!value) return null
  return decrypt(value)
}
