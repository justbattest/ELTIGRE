/**
 * POST /api/prompt-lab/from-video
 *
 * Télécharge une vidéo, extrait les frames, génère le prompt Higgsfield via Claude.
 * Entrée : { videoUrl: string }
 * Sortie : SSE stream (même format que /api/prompt-lab/generate)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { spawn } from 'child_process'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Tu es un expert en création de prompts Seedance 2.0 (aussi compatible Kling 3.0).
Tu analyses des frames extraites automatiquement d'une vidéo et génères des prompts JSON parfaits pour reproduire ce type de contenu.

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
- Transcript (si disponible) → intention narrative, dialogue, timing
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

**DIALOGUE** : "[Character, tone, ambient]: 'text'" — [Character]: 'text'"

**STYLE** — apparence uniquement, jamais de mouvements :
"[shot + angle], [décor condensé], no colour grading, candid — [tenue précise avec longueur], [cheveux], [accessoires]"

---

## Règles critiques

1. **ACTION = mouvements / STYLE = apparence** ← règle la plus importante
2. **Causes physiques, pas résultats voulus**
3. **CONTINUOUS SINGLE SHOT NO CUTS en majuscules** — signal de priorité système
4. **Immediate start pour ≤7s** — évite 1-2s de setup statique inutiles
5. **Décor précis** : nommer chaque élément par son vrai nom

---

## INSTRUCTIONS DE SORTIE

Procède en 2 étapes visibles :

**ÉTAPE 1 — ANALYSE** : Applique la PHASE 1 frame par frame. Sois exhaustif.

**ÉTAPE 2 — PROMPT** : Après ton analyse, écris exactement la ligne :
---JSON---
Puis immédiatement le JSON :
[
  { "framing": "...", "motion_intensity": 0.XX, "action": "...", "dialogue": "..." },
  { "style": "..." }
]

Règles absolues pour le JSON :
- La ligne ---JSON--- doit être seule sur sa ligne
- Le JSON doit être valide et parseable
- Aucun texte après le JSON`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { videoUrl } = body as { videoUrl: string }

  if (!videoUrl?.trim()) {
    return NextResponse.json({ error: 'videoUrl requis' }, { status: 400 })
  }

  const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Clé Anthropic non configurée dans Settings' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // ── Étape 1 : extraction des frames via video_analyzer.py ──────────────
        send({ text: '⏳ Téléchargement et extraction des frames...\n' })

        const projectRoot = path.join(process.cwd(), '..')
        const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python')

        const analyzeResult = await new Promise<{
          frames: { base64: string; timestamp: string }[]
          transcript: string
          metadata: { title: string; duration: number }
        }>((resolve, reject) => {
          const proc = spawn(pythonPath, ['-m', 'pipeline.video_analyzer', '--url', videoUrl.trim()], {
            cwd: projectRoot,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          })

          let stdout = ''
          let stderr = ''
          let settled = false

          proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
          proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

          const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            proc.kill()
            reject(new Error('Timeout: extraction took more than 90s'))
          }, 90_000)

          proc.on('error', (err) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            reject(new Error(`Spawn error: ${err.message}`))
          })

          proc.on('close', (code: number | null) => {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            if (code !== 0) {
              reject(new Error(`video_analyzer failed (code ${code}): ${stderr.slice(0, 300)}`))
              return
            }
            try {
              resolve(JSON.parse(stdout.trim()))
            } catch {
              reject(new Error(`Invalid JSON from video_analyzer: ${stdout.slice(0, 200)}`))
            }
          })
        })

        const { frames, transcript, metadata } = analyzeResult

        if (!frames.length) {
          throw new Error('Aucune frame extraite — vérifiez que l\'URL est accessible')
        }

        send({ text: `✅ ${frames.length} frames extraites de "${metadata.title}" (${Math.round(metadata.duration)}s)\n\n` })
        if (transcript) {
          send({ text: `📝 Transcript détecté (${transcript.length} chars)\n\n` })
        }
        send({ text: '🧠 Analyse Claude en cours...\n\n' })

        // ── Étape 2 : appel Claude avec les frames ──────────────────────────────
        type ImageBlock = {
          type: 'image'
          source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
        }
        type TextBlock = { type: 'text'; text: string }
        type ContentBlock = ImageBlock | TextBlock

        const content: ContentBlock[] = []

        for (const frame of frames.slice(0, 15)) {
          const match = frame.base64.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
          if (!match) continue
          const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: match[2] },
          })
        }

        const descriptionText = transcript
          ? `Transcript de la vidéo :\n${transcript}\n\nFrames extraites de la vidéo à analyser.`
          : `Frames extraites automatiquement de la vidéo. Analysez chaque frame pour reconstruire la scène complète.`

        content.push({ type: 'text', text: descriptionText })

        const client = new Anthropic({ apiKey: anthropicKey })

        const stream = await client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            send({ text: chunk.delta.text })
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } catch (e) {
        send({ error: String(e) })
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
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
