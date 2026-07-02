/**
 * POST /api/prompt-lab/from-video
 *
 * Télécharge une vidéo (ou utilise un fichier uploadé), extrait les frames + transcrit
 * l'audio (Groq Whisper), génère le prompt Higgsfield via Claude.
 * Entrée : FormData avec soit `videoUrl` (string), soit `videoFile` (File)
 * Sortie : SSE stream (même format que /api/prompt-lab/generate)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
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

## PHASE 2bis — Compréhension contextuelle (ne pas juste combiner mécaniquement les infos)

Avant d'écrire le prompt final, prends du recul et identifie :
- **Le sous-entendu réel de la scène** : qu'est-ce que la vidéo suggère vraiment, au-delà de ce qui est littéralement montré ? (double sens, tension sexuelle, gêne comique, situation embarrassante...)
- **Le ton exact du dialogue** : le transcript audio donne le phrasé RÉEL — utilise-le mot pour mot pour le dialogue plutôt que de le reformuler, sauf s'il est inaudible/incomplet
- **La cohérence entre audio et image** : si le transcript indique une réaction (rire, soupir, exclamation) qui n'est pas visible sur les frames disponibles, déduis à quel moment de la timeline elle se produit et intègre-la dans l'action
- **L'intention à reproduire, pas juste la description** : le but n'est pas de décrire ce qui s'est passé mais de fabriquer un prompt qui RECRÉERA le même effet/la même sensation chez le spectateur

Cette étape doit se refléter dans l'ACTION (timing des réactions) et le DIALOGUE (répliques exactes), pas dans un texte séparé.

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

  const formData = await req.formData()
  const videoUrl = (formData.get('videoUrl') as string | null)?.trim() || ''
  const videoFile = formData.get('videoFile') as File | null

  if (!videoUrl && !videoFile) {
    return NextResponse.json({ error: 'videoUrl ou videoFile requis' }, { status: 400 })
  }

  const creds = await prisma.userCredentials.findUnique({ where: { userId: session.user.id } })
  const anthropicKey = decryptIfPresent(creds?.anthropicApiKey)
  if (!anthropicKey) {
    return NextResponse.json({ error: 'Clé Anthropic non configurée dans Settings' }, { status: 400 })
  }
  const groqApiKey = decryptIfPresent(creds?.groqApiKey)

  // Si fichier uploadé, le sauver dans un tmp dir pour que video_analyzer.py le lise
  let uploadedFilePath: string | null = null
  if (videoFile) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vid_upload_'))
    const ext = path.extname(videoFile.name) || '.mp4'
    uploadedFilePath = path.join(tmpDir, `upload${ext}`)
    const buffer = Buffer.from(await videoFile.arrayBuffer())
    await fs.writeFile(uploadedFilePath, buffer)
  }

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // ── Étape 1 : extraction des frames + transcription via video_analyzer.py ──
        send({
          text: videoFile
            ? '⏳ Extraction des frames + transcription audio...\n'
            : '⏳ Téléchargement, extraction des frames + transcription audio...\n',
        })

        const projectRoot = path.join(process.cwd(), '..')
        const pythonPath = path.join(projectRoot, 'venv', 'bin', 'python')

        const analyzeResult = await new Promise<{
          frames: { base64: string; timestamp: string }[]
          transcript: string
          metadata: { title: string; duration: number }
        }>((resolve, reject) => {
          const sourceArgs = uploadedFilePath
            ? ['--file-path', uploadedFilePath]
            : ['--url', videoUrl]

          const proc = spawn(pythonPath, ['-m', 'pipeline.video_analyzer', ...sourceArgs], {
            cwd: projectRoot,
            env: {
              ...process.env,
              PYTHONUNBUFFERED: '1',
              ...(groqApiKey ? { GROQ_API_KEY: groqApiKey } : {}),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          })

          let stdout = ''
          let stderr = ''
          let settled = false

          proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
          proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

          // Plus long qu'avant : transcription audio + davantage de frames ajoutent du temps
          const timeout = setTimeout(() => {
            if (settled) return
            settled = true
            proc.kill()
            reject(new Error('Timeout: extraction took more than 150s'))
          }, 150_000)

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

        for (const frame of frames.slice(0, 40)) {
          const match = frame.base64.match(/^data:(image\/[a-z+]+);base64,(.+)$/)
          if (!match) continue
          const mediaType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp'
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: match[2] },
          })
        }

        const descriptionText = transcript
          ? `Transcript audio réel de la vidéo (transcrit mot pour mot depuis la piste audio, PAS des captions générées automatiquement) :\n"${transcript}"\n\n${frames.length} frames extraites de la vidéo, dans l'ordre chronologique, à analyser selon la PHASE 1 puis la PHASE 2bis.`
          : `${frames.length} frames extraites automatiquement de la vidéo, dans l'ordre chronologique. Aucun audio détecté ou transcrit — analysez uniquement à partir des frames pour reconstruire la scène complète.`

        content.push({ type: 'text', text: descriptionText })

        const client = new Anthropic({ apiKey: anthropicKey })

        const stream = await client.messages.stream({
          model: 'claude-sonnet-5',
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
        if (uploadedFilePath) {
          fs.rm(path.dirname(uploadedFilePath), { recursive: true, force: true }).catch(() => {})
        }
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
