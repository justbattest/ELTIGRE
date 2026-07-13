/**
 * POST /api/refset/prompts
 *
 * Génère, via Claude + la méthodo i2i-avatar-creator-base (lue dans skills/),
 * N prompts de scène ultra-réalistes pour le set de référence d'une modèle.
 * Ces prompts sont ensuite passés au moteur Gemini i2i (POST /api/refset/generate).
 *
 * Body JSON :
 *   { name, signature, niche, lifestyleCount?, bedroomCount?, anchorDataUrl? }
 *
 * Réponse : { prompts: [{ id, label, prompt }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'

const SKILL_DIR = path.join(process.cwd(), '..', 'skills', 'i2i-avatar-creator-base')

function readSkillFile(rel: string): string {
  try {
    return fs.readFileSync(path.join(SKILL_DIR, rel), 'utf-8')
  } catch {
    return ''
  }
}

function buildSystemPrompt(): string {
  const skill = readSkillFile('SKILL.md')
  const identity = readSkillFile('references/identity-preservation.md')
  const vocab = readSkillFile('references/vocabulary-banks.md')
  const styles = readSkillFile('references/style-templates.md')

  return `Tu es le générateur de prompts du set de référence de Modelify (OFM IA).
Tu appliques À LA LETTRE la méthodologie ci-dessous (skill i2i-avatar-creator-base) pour
produire des prompts Nano Banana en image-to-image ultra-réalistes, indistinguables de vraies
photos iPhone UGC. L'identité de la modèle vit dans l'image de référence (l'ancre) — tu
n'inventes JAMAIS ses traits physiques, tu ordonnes de les PRÉSERVER.

=== SKILL.md ===
${skill}

=== references/identity-preservation.md ===
${identity}

=== references/style-templates.md ===
${styles}

=== references/vocabulary-banks.md ===
${vocab}
`
}

const OUTPUT_INSTRUCTIONS = `## FORMAT DE SORTIE — STRICT

Tu génères un SET de scènes variées (lieux/poses/heures différents) de LA MÊME femme (l'ancre).
Chaque scène = un prompt complet, continu, narratif, copy-paste, suivant le template Style A (UGC iPhone)
sauf indication contraire, avec TOUS les blocs obligatoires et la checklist anti-IA respectée :
- phrase de préservation d'identité VERBATIM (+ le trait signature verrouillé fourni)
- lieu précis + heure précise · pose mid-action · outfit avec ≥1 marque
- inventaire de fond (5-10 objets de marque + living signs) · specs iPhone · 3-5 imperfections
- color grade physique · bloc négatifs à la fin

Contraintes du set :
- Adulte sans ambiguïté (mi-vingtaine). Suggestif HABILLÉ ok, JAMAIS de nu/explicite.
- Décolleté : phrasing modéré ("fitted deep V-neck / low scoop-neck top showing natural cleavage").
  Ne JAMAIS sur-insister sur l'anatomie (l'API renvoie vide = refus).
- Lumière du jour FROIDE privilégiée, éviter le jaune chaud (look IA).
- Trait signature : l'ajouter à la fin de la phrase de préservation dans CHAQUE prompt.

Tu réponds UNIQUEMENT avec un tableau JSON valide, rien d'autre (pas de texte avant/après, pas de code fence) :
[
  { "id": "01", "label": "cafe", "prompt": "<prompt complet d'un seul bloc>" },
  ...
]
Le "label" = slug court du lieu/scène (cafe, mirror, beach, gym, room-01, ...).`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const signature = String(body.signature || '').trim()
  const niche = String(body.niche || '').trim()
  const lifestyleCount = Math.min(40, Math.max(0, parseInt(body.lifestyleCount ?? 20, 10) || 0))
  const bedroomCount = Math.min(20, Math.max(0, parseInt(body.bedroomCount ?? 10, 10) || 0))
  const anchorDataUrl = typeof body.anchorDataUrl === 'string' ? body.anchorDataUrl : ''

  if (lifestyleCount + bedroomCount === 0) {
    return NextResponse.json({ error: 'Au moins une scène à générer' }, { status: 400 })
  }

  // Clé Anthropic : credentials user d'abord, sinon env
  const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey) || process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Clé Anthropic absente (Settings ou ANTHROPIC_API_KEY)' }, { status: 400 })
  }

  const system = buildSystemPrompt()

  const userText = `Génère le set de référence pour la modèle suivante :
- Nom : ${name || '(non précisé)'}
- Trait signature à VERROUILLER dans chaque prompt : ${signature || '(aucun trait signature précisé — garde la peau nette, pas de grains ajoutés)'}
- Vibe / niche / direction : ${niche || 'lifestyle premium crédible, varié'}

Produis :
- ${lifestyleCount} scènes LIFESTYLE variées (lieux/poses/heures différents — café, miroir, plage, rue, gym, cuisine, resto, parc, salle de bain, rooftop, boutique, hôtel, bureau, piscine, librairie, bar, canapé, jardin, neige, voiture... varie au maximum). labels: 01..${String(lifestyleCount).padStart(2, '0')}.
- ${bedroomCount} scènes CHAMBRE (intérieur privé, lumière du jour, outfits décolleté HABILLÉS et chics, jamais explicite). labels: room-01..room-${String(bedroomCount).padStart(2, '0')}. Force "private bedroom interior" + négatif de lieu pour éviter que la scène dérape.

${anchorDataUrl ? "Une image d'ancre de la modèle est fournie ci-dessous : adapte les outfits/coiffures/ambiances à cette personne, mais ne décris jamais ses traits — ordonne de les préserver." : ''}

${OUTPUT_INSTRUCTIONS}`

  type Block =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } }
  const content: Block[] = []
  if (anchorDataUrl) {
    const m = anchorDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/)
    if (m) {
      content.push({ type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', data: m[2] } })
    }
  }
  content.push({ type: 'text', text: userText })

  const client = new Anthropic({ apiKey: anthropicKey })

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 24000,
      system,
      messages: [{ role: 'user', content }],
    })

    const raw = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    // Extraction robuste du tableau JSON
    let jsonText = raw.trim()
    const fence = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fence) jsonText = fence[1].trim()
    const start = jsonText.indexOf('[')
    const end = jsonText.lastIndexOf(']')
    if (start !== -1 && end !== -1) jsonText = jsonText.slice(start, end + 1)

    let prompts: { id: string; label: string; prompt: string }[]
    try {
      const parsed = JSON.parse(jsonText)
      prompts = (Array.isArray(parsed) ? parsed : [])
        .map((p, i) => ({
          id: String(p.id ?? i + 1),
          label: String(p.label ?? ''),
          prompt: String(p.prompt ?? ''),
        }))
        .filter(p => p.prompt.trim())
    } catch {
      return NextResponse.json({ error: 'Réponse Claude non parseable', raw: raw.slice(0, 500) }, { status: 502 })
    }

    if (!prompts.length) {
      return NextResponse.json({ error: 'Aucun prompt généré', raw: raw.slice(0, 500) }, { status: 502 })
    }

    return NextResponse.json({ prompts })
  } catch (e) {
    return NextResponse.json({ error: `Erreur Claude : ${String(e).slice(0, 300)}` }, { status: 502 })
  }
}
