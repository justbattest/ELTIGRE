/**
 * POST /api/instagram/generate-caption
 *
 * Génère une caption Instagram pour une génération donnée via Claude Haiku.
 *
 * Body : { generationId: number } ou { niche, subNiche, sceneDescription, speakerLine, mediaType }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { generationId, niche, subNiche, sceneDescription, speakerLine, mediaType = 'reel' } = body

  // Récupérer la clé Anthropic
  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Clé Anthropic manquante dans les paramètres' }, { status: 400 })
  }

  // Récupérer le contexte depuis la DB si generationId fourni
  let context = { niche, subNiche, sceneDescription, speakerLine }
  if (generationId) {
    const gen = await prisma.generation.findFirst({
      where: { id: Number(generationId), userId: session.user.id },
      select: { sceneDescription: true, promptUsed: true, sourceCaption: true },
    })
    if (gen) {
      context.sceneDescription = gen.sceneDescription || sceneDescription
      // Tenter d'extraire la niche depuis le prompt si pas fourni
      if (!niche && gen.promptUsed) {
        try {
          const p = JSON.parse(gen.promptUsed)
          context.sceneDescription = context.sceneDescription || (Array.isArray(p) ? p[0]?.action : p?.action)
        } catch { /* ignore */ }
      }
    }
  }

  const client = new Anthropic({ apiKey: anthropicKey })

  const nicheContext = [
    context.niche && `Niche: ${context.niche}`,
    context.subNiche && `Sous-niche: ${context.subNiche}`,
    context.sceneDescription && `Scène: ${context.sceneDescription}`,
    context.speakerLine && `Réplique principale: "${context.speakerLine}"`,
    `Type de contenu: ${mediaType}`,
  ].filter(Boolean).join('\n')

  const prompt = `You are an Instagram engagement expert. Write ONE short open question as a caption for this video/carousel.

CONTENT CONTEXT:
${nicheContext}

ABSOLUTE RULES:
- Language: ENGLISH ONLY — never French
- Format: 1 single open question, MAX 12 words
- The question must make people WANT to answer — it creates curiosity, debate, or self-recognition
- Directly related to what happens in the video (not generic)
- Natural, casual tone — like a friend asking
- 0-1 emoji max, only if it fits perfectly
- NO hashtags in the caption
- Never start with "Would you", vary the structure
- Never be cringe or try-hard

GOOD EXAMPLES:
- "Be honest — how many of you have done this? 😭"
- "Is this illegal or totally acceptable?"
- "Tell me I'm not the only one"
- "What would YOU have said here? 👀"
- "Raise your hand if this is literally your job 🙋"
- "The last thing she said though 💀"

RESPOND IN JSON ONLY:
{"caption": "...", "hashtags": ["hashtag1", "hashtag2", "hashtag3"]}`

  let caption = ''
  let hashtags: string[] = []

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (resp.content[0] as { type: string; text: string }).text.trim()
    let jsonStr = raw
    if (raw.startsWith('```')) {
      jsonStr = raw.split('```')[1]
      if (jsonStr.startsWith('json')) jsonStr = jsonStr.slice(4)
    }
    const parsed = JSON.parse(jsonStr.trim())
    caption = parsed.caption || ''
    hashtags = parsed.hashtags || []
  } catch (e) {
    console.error('[generate-caption] Claude error:', e)
    return NextResponse.json({ error: 'Erreur lors de la génération de la caption' }, { status: 500 })
  }

  return NextResponse.json({ caption, hashtags })
}
