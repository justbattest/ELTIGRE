import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decryptIfPresent } from '@/lib/crypto'

// GET /api/settings — récupère les settings de l'user connecté
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  if (!creds) {
    return NextResponse.json({
      apifyApiKey: '',
      anthropicApiKey: '',
      higgsFieldConnected: false,
      defaultModel: 'auto',
      defaultAspectRatio: '2:3',
      defaultQuality: '2k',
      referenceElements: [],
    })
  }

  // Déchiffrer et masquer les keys (affiche seulement les premiers/derniers chars)
  const maskKey = (key: string | null | undefined) => {
    if (!key) return ''
    if (key.length <= 8) return key
    return key.substring(0, 8) + '...' + key.substring(key.length - 4)
  }

  const rawApify = decryptIfPresent(creds.apifyApiKey)
  const rawAnthropic = decryptIfPresent(creds.anthropicApiKey)
  const rawHiggsfield = decryptIfPresent(creds.higgsFieldToken)

  const rawInstagramCookie = decryptIfPresent(creds.instagramSessionCookie)
  const rawKlingAccess = decryptIfPresent(creds.klingAccessKey)
  const rawKlingSecret = decryptIfPresent(creds.klingSecretKey)
  const rawClerkToken = decryptIfPresent(creds.higgsFieldClerkToken)

  return NextResponse.json({
    apifyApiKey: maskKey(rawApify),
    apifyApiKeyFull: rawApify || '',
    anthropicApiKey: maskKey(rawAnthropic),
    anthropicApiKeyFull: rawAnthropic || '',
    higgsFieldConnected: !!rawHiggsfield,
    higgsFieldEmail: null,
    higgsFieldClerkToken: maskKey(rawClerkToken),
    higgsFieldClerkConnected: !!rawClerkToken,
    klingAccessKey: maskKey(rawKlingAccess),
    klingSecretKey: maskKey(rawKlingSecret),
    defaultModel: creds.defaultModel,
    defaultAspectRatio: creds.defaultAspectRatio,
    defaultQuality: creds.defaultQuality,
    referenceElements: creds.referenceElements ? JSON.parse(creds.referenceElements) : [],
    driveConnected: !!creds.googleRefreshToken,
    driveFolderId: creds.driveFolderId || '',
    instagramSessionCookie: maskKey(rawInstagramCookie),
    scrapingProxyUrl: creds.scrapingProxyUrl || '',
    hikerApiKey: maskKey(creds.hikerApiKey),
    characterPromptRules: creds.characterPromptRules || '',
    modelArkApiKey: maskKey(decryptIfPresent(creds.modelArkApiKey)),
    modelArkApiKeyConnected: !!creds.modelArkApiKey,
    groqApiKey: maskKey(decryptIfPresent(creds.groqApiKey)),
    groqApiKeyConnected: !!creds.groqApiKey,
  })
}

// POST /api/settings — sauvegarde les settings
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    apifyApiKey,
    anthropicApiKey,
    klingAccessKey,
    klingSecretKey,
    higgsFieldToken,
    higgsFieldRefreshToken,
    higgsFieldClerkToken,
    defaultModel,
    defaultAspectRatio,
    defaultQuality,
    referenceElements,
    driveFolderId,
    instagramSessionCookie,
    scrapingProxyUrl,
    hikerApiKey,
    characterPromptRules,
    modelArkApiKey,
    groqApiKey,
  } = body

  // Récupère les valeurs existantes pour ne pas écraser avec du vide
  const existing = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const data: Record<string, unknown> = {}

  // N'écrase que si une nouvelle valeur non vide est fournie
  // (évite d'écraser une key existante si l'user soumet le form avec les champs masqués)
  if (apifyApiKey && !apifyApiKey.includes('...')) {
    data.apifyApiKey = encrypt(apifyApiKey)
  }
  if (anthropicApiKey && !anthropicApiKey.includes('...')) {
    data.anthropicApiKey = encrypt(anthropicApiKey)
  }
  if (higgsFieldToken) {
    data.higgsFieldToken = encrypt(higgsFieldToken)
  }
  if (higgsFieldRefreshToken) {
    data.higgsFieldRefreshToken = encrypt(higgsFieldRefreshToken)
  }
  if (higgsFieldClerkToken && !higgsFieldClerkToken.includes('...')) {
    data.higgsFieldClerkToken = encrypt(higgsFieldClerkToken)
  }
  if (defaultModel) data.defaultModel = defaultModel
  if (defaultAspectRatio) data.defaultAspectRatio = defaultAspectRatio
  if (defaultQuality) data.defaultQuality = defaultQuality
  if (referenceElements !== undefined) {
    data.referenceElements = JSON.stringify(referenceElements)
  }
  if (driveFolderId !== undefined) {
    data.driveFolderId = driveFolderId.trim() || null
  }
  if (instagramSessionCookie && !instagramSessionCookie.includes('...')) {
    data.instagramSessionCookie = encrypt(instagramSessionCookie)
  }
  if (klingAccessKey && !klingAccessKey.includes('...')) {
    data.klingAccessKey = encrypt(klingAccessKey)
  }
  if (klingSecretKey && !klingSecretKey.includes('...')) {
    data.klingSecretKey = encrypt(klingSecretKey)
  }
  if (scrapingProxyUrl !== undefined) {
    data.scrapingProxyUrl = scrapingProxyUrl.trim() || null
  }
  if (hikerApiKey && !hikerApiKey.includes('...')) {
    data.hikerApiKey = hikerApiKey.trim()
  }
  if (characterPromptRules !== undefined) {
    data.characterPromptRules = characterPromptRules
  }
  if (modelArkApiKey && !modelArkApiKey.includes('...')) {
    data.modelArkApiKey = encrypt(modelArkApiKey)
  }
  if (groqApiKey && !groqApiKey.includes('...')) {
    data.groqApiKey = encrypt(groqApiKey)
  }

  await prisma.userCredentials.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      ...data,
    } as Parameters<typeof prisma.userCredentials.upsert>[0]['create'],
    update: data as Parameters<typeof prisma.userCredentials.upsert>[0]['update'],
  })

  return NextResponse.json({ ok: true })
}
