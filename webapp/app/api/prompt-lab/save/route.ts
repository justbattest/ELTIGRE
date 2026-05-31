/**
 * POST /api/prompt-lab/save
 * Sauvegarde un prompt généré par le Prompt Lab dans la table validated_prompts.
 * Après sauvegarde, génère automatiquement des variations de phrases (fire-and-forget).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import Anthropic from '@anthropic-ai/sdk'

const NICHE_MAP: Record<string, { niche: string; subNiche: string }> = {
  conference:  { niche: 'conference_sport', subNiche: 'conference' },
  sport:       { niche: 'conference_sport', subNiche: 'sport' },
  golf:        { niche: 'golf',             subNiche: 'golf' },
  nurse:       { niche: 'vieux',            subNiche: 'nurse' },
  restaurant:  { niche: 'vieux',            subNiche: 'restaurant' },
  meteo:       { niche: 'meteo',            subNiche: 'meteo' },
  reporter:    { niche: 'meteo',            subNiche: 'reporter' },
}

// ── Auto-variations (fire-and-forget) ─────────────────────────────────────────
async function generateVariations(promptId: number, promptJson: string, anthropicKey: string) {
  try {
    const client = new Anthropic({ apiKey: anthropicKey })
    const msg = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Voici un prompt Seedance JSON :
${promptJson}

Analyse-le et retourne UNIQUEMENT un JSON valide avec ces 3 champs :
{
  "speakerLine": "la réplique féminine principale exacte (copie du dialogue JSON, null si aucune)",
  "outfitText": "la description exacte de la tenue (substring exact du style dans le JSON, null si absent)",
  "phraseVariations": ["variation1", "variation2", "variation3", "variation4"]
}

Les phraseVariations doivent être 4 alternatives à speakerLine, calibrées pour ce contexte précis.
Chacune doit être 100% défendable en contexte professionnel mais avec un double sens implicite quand dite par une femme ultra-attractive dans CETTE scène.
Si pas de speakerLine, retourner phraseVariations: null.
JSON uniquement, aucun texte autour.`,
      }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    const parsed = JSON.parse(raw)

    await prisma.validatedPrompt.update({
      where: { id: promptId },
      data: {
        speakerLine:      parsed.speakerLine || null,
        outfitText:       parsed.outfitText || null,
        phraseVariations: parsed.phraseVariations ? JSON.stringify(parsed.phraseVariations) : null,
      },
    })
  } catch (e) {
    console.warn(`[prompt-lab:variations] Failed for prompt ${promptId}:`, e)
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const {
    promptJson,
    authorName,
    userDescription,
    categoryKey,
    customNiche,      // Si categoryKey = 'custom'
    customLabel,      // Label affiché pour catégorie custom
  } = body

  if (!promptJson || !authorName?.trim() || !userDescription?.trim() || !categoryKey) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
  }

  let mapping: { niche: string; subNiche: string }
  if (categoryKey === 'custom' && customNiche?.trim()) {
    const slug = customNiche.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    mapping = { niche: slug, subNiche: slug }
  } else {
    const m = NICHE_MAP[categoryKey]
    if (!m) return NextResponse.json({ error: `Catégorie inconnue: ${categoryKey}` }, { status: 400 })
    mapping = m
  }

  try { JSON.parse(promptJson) }
  catch { return NextResponse.json({ error: 'promptJson invalide' }, { status: 400 }) }

  const title = categoryKey === 'custom' && customLabel
    ? `[${authorName.trim()}] ${customLabel} · ${userDescription.trim().slice(0, 40)}`
    : `[${authorName.trim()}] ${userDescription.trim().slice(0, 55)}`

  const saved = await prisma.validatedPrompt.create({
    data: {
      niche:           mapping.niche,
      subNiche:        mapping.subNiche,
      title,
      promptJson,
      authorName:      authorName.trim(),
      userDescription: userDescription.trim(),
      isBest:          false,
      isActive:        true,
      sortOrder:       999,
    },
    select: { id: true, title: true },
  })

  // ── Auto-variations en arrière-plan ──────────────────────────────────────
  const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (anthropicKey) {
    generateVariations(saved.id, promptJson, anthropicKey).catch(() => {})
  }

  return NextResponse.json({ success: true, promptId: saved.id, title: saved.title })
}
