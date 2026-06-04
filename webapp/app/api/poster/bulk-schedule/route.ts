/**
 * POST /api/poster/bulk-schedule
 *
 * Planifie N carousels en une seule opération avec des horaires US optimaux.
 *
 * Body:
 * {
 *   accountId: string
 *   carousels: Array<{ fileUrls: string[], caption: string }>
 *   perDay: number          // Posts par jour (1-5)
 *   startDate: string       // Date de départ ISO (ex: "2026-06-06")
 * }
 *
 * Créneaux US optimaux (EST = UTC-5) :
 *   Matin    : 06h00–09h00 EST
 *   Midi     : 11h30–13h30 EST
 *   Soir     : 19h00–21h30 EST
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Créneaux EST en [heure, minMin, minMax] format
// Converti en UTC : EST = UTC-5 → add 5h
const SLOTS_EST = [
  { h: 6,  mMin: 0,   mMax: 60 },   // 6h-7h EST = 11h-12h UTC
  { h: 7,  mMin: 0,   mMax: 60 },   // 7h-8h EST = 12h-13h UTC
  { h: 8,  mMin: 0,   mMax: 45 },   // 8h-8h45 EST = 13h-13h45 UTC
  { h: 11, mMin: 30,  mMax: 90 },   // 11h30-13h EST = 16h30-18h UTC
  { h: 12, mMin: 0,   mMax: 90 },   // 12h-13h30 EST = 17h-18h30 UTC
  { h: 19, mMin: 0,   mMax: 60 },   // 19h-20h EST = 0h-1h UTC
  { h: 20, mMin: 0,   mMax: 60 },   // 20h-21h EST = 1h-2h UTC
  { h: 21, mMin: 0,   mMax: 30 },   // 21h-21h30 EST = 2h-2h30 UTC
]

function getOptimalSlots(perDay: number): typeof SLOTS_EST {
  // Distribuer les créneaux de façon équilibrée sur la journée
  if (perDay === 1) return [SLOTS_EST[6]] // Soir uniquement
  if (perDay === 2) return [SLOTS_EST[2], SLOTS_EST[6]] // Matin + Soir
  if (perDay === 3) return [SLOTS_EST[1], SLOTS_EST[4], SLOTS_EST[6]] // Matin + Midi + Soir
  if (perDay === 4) return [SLOTS_EST[0], SLOTS_EST[3], SLOTS_EST[5], SLOTS_EST[7]]
  return [SLOTS_EST[0], SLOTS_EST[2], SLOTS_EST[3], SLOTS_EST[5], SLOTS_EST[7]] // 5/jour
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function buildScheduledDate(baseDate: Date, dayOffset: number, slot: typeof SLOTS_EST[0]): Date {
  // EST = UTC-5
  const date = new Date(baseDate)
  date.setDate(date.getDate() + dayOffset)

  // Convertir heure EST en UTC
  const estHour = slot.h
  const utcHour = (estHour + 5) % 24 // EST → UTC

  // Générer minute aléatoire dans le créneau
  const totalMinMin = slot.mMin
  const totalMinMax = slot.mMax
  const randomMinutes = randomInt(totalMinMin, totalMinMax)

  // Éviter exactement H:00 et H:30
  let finalMin = randomMinutes % 60
  if (finalMin === 0) finalMin = randomInt(3, 12)
  if (finalMin === 30) finalMin = randomInt(32, 42)

  // Variation supplementaire ±7-25 minutes dans le créneau
  const variation = randomInt(-8, 8)
  let adjustedMin = finalMin + variation
  if (adjustedMin < 1) adjustedMin = randomInt(4, 15)
  if (adjustedMin >= 60) adjustedMin = randomInt(42, 55)
  if (adjustedMin === 30) adjustedMin += randomInt(3, 8)

  date.setUTCHours(utcHour, adjustedMin, randomInt(5, 55), 0)
  return date
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { accountId, carousels, perDay = 1, startDate, firstPostAt } = body

  if (!accountId) return NextResponse.json({ error: 'accountId requis' }, { status: 400 })
  if (!carousels?.length) return NextResponse.json({ error: 'carousels requis' }, { status: 400 })
  if (perDay < 1 || perDay > 5) return NextResponse.json({ error: 'perDay doit être entre 1 et 5' }, { status: 400 })

  // Vérifier le compte
  const account = await prisma.instagramAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  })
  if (!account) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 })
  if (account.status === 'banned') return NextResponse.json({ error: 'Compte banni' }, { status: 400 })

  // Date de départ
  const baseDate = startDate ? new Date(startDate) : new Date()
  // Si aujourd'hui, commencer demain pour éviter des horaires déjà passés
  if (!startDate) baseDate.setDate(baseDate.getDate() + 1)
  baseDate.setHours(0, 0, 0, 0)

  // Calculer les horaires
  const slots = getOptimalSlots(perDay)
  const scheduledDates: Date[] = []

  const totalDays = Math.ceil(carousels.length / perDay)
  let carouselIdx = 0

  for (let day = 0; day < totalDays && carouselIdx < carousels.length; day++) {
    for (let slotIdx = 0; slotIdx < perDay && carouselIdx < carousels.length; slotIdx++) {
      // Premier post : utiliser firstPostAt si fourni (mode test)
      if (carouselIdx === 0 && firstPostAt) {
        scheduledDates.push(new Date(firstPostAt))
      } else {
        const slot = slots[slotIdx % slots.length]
        const scheduledAt = buildScheduledDate(baseDate, day, slot)
        scheduledDates.push(scheduledAt)
      }
      carouselIdx++
    }
  }

  // Créer tous les posts en une transaction
  const postsData = carousels.map((carousel: { fileUrls: string[]; caption?: string }, i: number) => ({
    userId: session.user.id,
    accountId,
    driveFilesJson: JSON.stringify(carousel.fileUrls),
    caption: carousel.caption || null,
    mediaType: 'carousel',
    scheduledFor: scheduledDates[i] || new Date(),
    status: 'pending',
  }))

  const created = await prisma.instagramPost.createMany({ data: postsData })

  return NextResponse.json({
    scheduled: created.count,
    message: `${created.count} carousel${created.count > 1 ? 's' : ''} planifié${created.count > 1 ? 's' : ''} ✓`,
    firstPostAt: scheduledDates[0]?.toISOString(),
    lastPostAt: scheduledDates[scheduledDates.length - 1]?.toISOString(),
  })
}
