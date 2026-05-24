/**
 * Script admin pour créer des utilisateurs.
 * Usage : npm run create-user -- email@example.com motdepasse
 * Depuis le dossier webapp/
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

const prisma = new PrismaClient()

async function main() {
  const [, , email, password] = process.argv

  if (!email || !password) {
    console.error('Usage: npx ts-node scripts/create-user.ts email@example.com motdepasse')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.error(`❌ Utilisateur ${email} existe déjà`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      passwordHash: hash,
    },
  })

  console.log(`✅ Utilisateur créé : ${user.email} (id: ${user.id})`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
