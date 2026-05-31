/**
 * POST /api/prompt-lab/generate
 * Analyse des screenshots via Claude Vision + skill seedance-prompt-generator
 * → génère un prompt Seedance au format JSON validé.
 *
 * Streaming SSE :
 *   data: { text: "..." }    ← chunks d'analyse + JSON
 *   data: [DONE]             ← fin du stream
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import Anthropic from '@anthropic-ai/sdk'

// ── Skill complet intégré ──────────────────────────────────────────────────────
const SKILL_CONTENT = `
# Seedance / Kling Prompt Generator

## PHASE 1 — Analyse universelle des frames

Analyser **chaque frame dans l'ordre**, une par une.

### Couche 1 : Composition spatiale
- **Angle caméra** : distance (close / medium / wide) + hauteur (below / eye level / above) + axe (front / side / three-quarter / behind)
- **Position dans le cadre** : chaque sujet principal → left / center / right + foreground / mid / background
- **Plans de profondeur** : ce qui est dans chaque plan (avant, milieu, fond)
- **Bords du cadre** : ce qui est partiellement coupé, ce qui entre depuis les bords

### Couche 2 : Sujets et état physique
- **Qui** : nombre de personnes, leur relation spatiale
- **Posture exacte** : standing / sitting / kneeling / leaning — avec précisions
- **Mains** : position précise (raised / at waist / on table / holding X / reaching toward Y)
- **Regard** : direction des yeux (at camera / at each other / at object / off-frame)
- **Expression faciale** : muscles précis — pas "surprise" mais "mouth drops open, eyes wide"
- **Vêtements** : coupe exacte, couleur, longueur, tissu, état (mouillé, tendu, décalé)

### Couche 3 : Environnement et physique
- **Décor** : lister chaque élément visible avec son nom précis (pas "salle" mais "drop ceiling recessed lights, white projection screen, American flag left wall, wooden podium right")
- **Éclairage** : type, direction, chaleur, heure apparente
- **Forces physiques** : vent (intensité, direction), gravité sur tissu, tension vêtements, flou de mouvement

### Couche 4 : Entre les frames
- Qu'est-ce qui a **changé** entre cette frame et la précédente ?
- Quelle **cause physique** explique ce changement ?
- Quelle **progression émotionnelle** ?
- Quelle est la **prochaine action logique** ?

### Couche 5 : Éléments hors-champ
- Mains / bras qui entrent par les bords — de quel côté, à quelle hauteur ?
- Personnes partiellement visibles
- Sons impliqués par le visuel

### Couche 6 : Hook narratif
- Quel est le **moment viral** ? (tension, révélation, réaction)
- Quel est l'**arc émotionnel** : setup → tension → résolution ?
- Quel est le **lien causal** entre tous les événements ?

---

## PHASE 2 — Synthèse
- Frames → framing exact, décor, tenues, positions, angle
- Description → intention narrative, dialogue, timing, effet voulu
- Synthèse → séquence d'actions ordonnée avec causes physiques

**Règle d'or** : ne jamais décrire un résultat voulu directement. Trouver la force physique crédible qui le produit naturellement.

---

## PHASE 3 — Structure du prompt

**FRAMING** — 2 phrases max :
"[Shot type + angle + hauteur]. [Décor nommé précisément]. [Personnages secondaires + position]."

**MOTION_INTENSITY** :
- 0.30–0.36 : Scènes très calmes, personnes assises immobiles
- 0.37–0.42 : Conversation, conférence douce, gestes légers
- 0.43–0.48 : Marche, coaching, mouvement normal
- 0.49–0.53 : Sport actif, tempête, action énergique
- 0.54–0.58 : Golf swing, explosion, crash, vent fort

**ACTION** — mouvements uniquement, jamais d'apparence :
- Toujours commencer : CONTINUOUS SINGLE SHOT NO CUTS. Immediate start.
- Une action = une phrase de max 5 mots (les points = marqueurs temporels)
- Ordre chronologique strict
- Inclure : causes physiques, micro-expressions, réactions secondaires

**DIALOGUE** : "[Character, tone, ambient]: 'text'" — [Character]: 'text'"

**STYLE** — apparence uniquement, jamais de mouvements :
"[shot + angle], [décor condensé], no colour grading, candid — [tenue précise avec longueur], [cheveux], [accessoires]"

---

## Règles critiques

1. **ACTION = mouvements / STYLE = apparence** ← règle la plus importante
2. **Causes physiques, pas résultats voulus** : ❌ "skirt lifts to show underwear" → ✅ "forceful rotation combined with sudden gust of wind lifts skirt high, keeps it suspended before slowly settling"
3. **Phrases courtes** : "She freezes. Head lifts. Eyes go wide." → 3 moments distincts
4. **CONTINUOUS SINGLE SHOT NO CUTS en majuscules** — signal de priorité système
5. **Immediate start pour ≤7s** — évite 1-2s de setup statique inutiles
6. **Destination sans trajectoire** : ✅ "hands reaching toward her ankles" ❌ "torso parallel to floor"
7. **Mots de texture** : "melting onto floor", "drift", "slumps" vs "thud", "topples"
8. **Formule distraction** : "[character] watching her instead of [focus naturel]"
9. **Psychologie du personnage** : "the expression of a man with absolutely no complaints whatsoever"
10. **Décor précis** : nommer chaque élément par son vrai nom

---

## Vocabulaire validé

Culotte visible (STYLE uniquement) : "small central triangle of red underwear fabric visible only in the narrow gap between her inner thighs — not wide not a band"
Jupe sustenue : "forceful rotation combined with a sudden gust of wind lifts the skirt high and keeps it suspended in the air for a long moment before slowly settling back down"
Jupe brève : "intermittent strong wind gusts briefly flick the short dress hem upward for split-second moments — not sustained, not wide"
Réaction 4 temps : "mouth drops wide open, eyes wide" → "both hands fly to cover her mouth" → "bends head forward" → "lifts head back up, breaking into laughter"
Réalisme : "no colour grading, candid [context] feel"

## NSFW triggers à éviter
- "bare" + "underwear" → utiliser couleur + position
- "ceiling fan" → ne jamais mentionner
- "thrown into" → "tumbles into" / "slides into"
- "opens" (jupe) → "shifts" / "flicks upward"

---

## Exemples validés 10/10

### GOLF — Jupe + vent + gâteau
{"framing":"POV from behind on sunny golf course, green grass, natural daylight. Cake on table visible left of frame.","motion_intensity":0.55,"action":"CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Extremely muscular woman from behind, very short golf skirt and fitted top. Rhythmic hip waggle pre-shot routine. Full powerful golf swing. The forceful rotation combined with a sudden gust of wind lifts the skirt high and keeps it suspended in the air for a long moment before slowly settling back down. Man to her left — gaze already directed downward — reacts with wide eyes and jaw dropped.","dialogue":"[Man, casual and stunned]: 'Oh… nice cake.' — [Woman, offended]: 'What — are you serious?' — [Man, deadpan]: 'Oh sorry — I was talking about the cake.'","style":"handheld POV, sunny outdoor golf course, warm natural light, light breeze throughout, no colour grading, candid unscripted feel — cake visible background throughout"}

### CONFÉRENCE — Mec glisse de sa chaise
{"framing":"Fixed medium shot, audience POV third row, slightly below elevated stage. Conference room: drop ceiling lights, white projection screen, American flag left, wooden podium right, black stage skirting. Audience heads foreground. Woman centre stage, young man in navy suit on chair behind her.","motion_intensity":0.44,"action":"CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman speaks into microphone. Delivers her line. Young man in suit behind her — watching her instead of the presentation — slowly slumps and slides off his chair in a slow involuntary drift, melting onto the stage floor as if his body simply gave up. She stops. Turns. Asks her line. He gets back up, embarrassed. Responds. Audience laughs.","dialogue":"[Speaker, confident]: 'Avoid getting distracted by enticing—' — [Man slowly slides off chair] — [Speaker, turning]: 'Oh my goodness, sweetie. Are you okay?' — [Man getting up]: 'Not bro getting distracted.' — [Audience laughing]","style":"fixed medium shot audience POV below stage, conference room, drop ceiling recessed lights, white projection screen, American flag left, wooden podium right, black stage skirting, audience suits foreground, no colour grading, candid — tight blue fitted shirt deep open cleavage, very short tight black skirt, black heeled sandals, long dark wavy hair"}

### SPORT — Coach · "Who the fuck said that"
{"framing":"Fixed medium shot, at student seated eye level. Coach standing foreground facing students. Indoor athletics facility: red track with white lane lines, artificial green turf beyond, American flag on wall, industrial metal ceiling overhead lights.","motion_intensity":0.46,"action":"CONTINUOUS SINGLE SHOT NO CUTS. Immediate start. Young muscular woman facing students, clipboard in hand. Speaks her line. Turns sideways. Turns fully away from students — back to camera. Walks away along the track. She stops. Student mutters off-screen. She freezes mid-step. Turns slowly all the way back. Eyes move across each student slowly. Delivers her line.","dialogue":"[Coach, confident]: 'Game is coming up and you aren't playing right.' — [Male student, barely audible]: 'Fuck she is so thick.' — [Coach, turned back, staring]: 'Who the fuck said that?'","style":"fixed medium shot student eye level, red track interior, white lane lines, green turf, American flag on wall, no colour grading, candid — tight white low-cut athletic top with deep cleavage, extremely short tight grey athletic shorts, long dark wavy hair, whistle around neck"}
`

const SYSTEM_PROMPT = `Tu es un expert en création de prompts Seedance 2.0 (aussi compatible Kling 3.0).
Tu analyses des screenshots de vidéos et génères des prompts JSON parfaits pour reproduire ce type de contenu.

${SKILL_CONTENT}

---

## INSTRUCTIONS DE SORTIE

Procède en 2 étapes visibles :

**ÉTAPE 1 — ANALYSE** : Applique la PHASE 1 frame par frame. Sois exhaustif — chaque élément visible, chaque force physique, l'arc narratif complet.

**ÉTAPE 2 — PROMPT** : Après ton analyse, écris exactement la ligne :
---JSON---
Puis immédiatement le JSON sur les lignes suivantes, format :
[
  { "framing": "...", "motion_intensity": 0.XX, "action": "...", "dialogue": "..." },
  { "style": "..." }
]

Règles absolues pour le JSON :
- La ligne ---JSON--- doit être seule sur sa ligne
- Le JSON doit être valide et parseable
- Utilise le format array avec style en dernier objet
- Aucun texte après le JSON`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { images, description } = body

  if (!images?.length) return NextResponse.json({ error: 'Images requises' }, { status: 400 })
  if (!description?.trim()) return NextResponse.json({ error: 'Description requise' }, { status: 400 })

  // ── Credentials ───────────────────────────────────────────────────────────
  const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (!anthropicKey) return NextResponse.json({ error: 'Clé Anthropic non configurée dans Settings' }, { status: 400 })

  // ── Build message content ─────────────────────────────────────────────────
  type ImageBlock = {
    type: 'image'
    source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  }
  type TextBlock = { type: 'text'; text: string }
  type ContentBlock = ImageBlock | TextBlock

  const content: ContentBlock[] = []

  for (const imgDataUrl of images.slice(0, 10)) {
    const match = imgDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
    if (!match) continue
    const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'
    const data = match[2]
    content.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } })
  }

  content.push({
    type: 'text',
    text: `Description de la scène :\n${description.trim()}`,
  })

  // ── Streaming Claude API ──────────────────────────────────────────────────
  const client = new Anthropic({ apiKey: anthropicKey })

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = await client.messages.stream({
          model: 'claude-opus-4-5',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            )
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: String(e) })}\n\n`)
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
