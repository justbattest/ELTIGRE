/**
 * Modelify MCP — outils de GÉNÉRATION DE CONTENU (Phase 3).
 *
 * Chaque outil enveloppe une route `/api/.../start|create|generate` existante :
 * mêmes modules pipeline, mêmes flags, mêmes credentials/env. Le flux est
 * uniforme :
 *   1. valider les entrées (throw sur manquant),
 *   2. récupérer + déchiffrer les credentials requis,
 *   3. matérialiser les fichiers d'entrée si besoin (URL/base64 → dossier temp),
 *   4. `debit()` le coût en crédits (throw InsufficientCreditsError si solde KO),
 *   5. `spawnPipelineRun(...)` (crée le Run DB + lance le subprocess),
 *   6. retourner `{ runId, status: 'running', creditsCharged, balance }`.
 *
 * Tous ces outils requièrent le scope `content:generate`. Ils sont ASYNCHRONES :
 * l'agent suit l'avancement via `modelify_get_run` et récupère les résultats via
 * `modelify_get_results` (pour les pipelines DB-backed — voir caveats par outil).
 *
 * Le déchiffrement des credentials utilise `decryptIfPresent` de `@/lib/crypto`.
 */

import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

import { prisma } from '@/lib/prisma'
import { decryptIfPresent } from '@/lib/crypto'
import { debit } from '@/lib/credits'
import { costOf } from '@/lib/mcp/pricing'
import { spawnPipelineRun, type EnvLike } from '@/lib/mcp/spawn-run'
import { refsetRuns } from '@/lib/refset-state'
import type { ToolContext, ToolHandler, ToolModule } from '../registry'

// ─── Helpers de validation ────────────────────────────────────────────────────

type Args = Record<string, unknown>

function reqStr(a: Args, k: string): string {
  const v = a[k]
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Paramètre "${k}" requis (chaîne non vide).`)
  return v
}
function optStr(a: Args, k: string): string | undefined {
  const v = a[k]
  return typeof v === 'string' && v.trim() ? v : undefined
}
function optNum(a: Args, k: string, def: number): number {
  const v = Number(a[k])
  return Number.isFinite(v) ? v : def
}
function reqStrArray(a: Args, k: string, min = 1): string[] {
  const v = a[k]
  if (!Array.isArray(v) || v.length < min) {
    throw new Error(`Paramètre "${k}" requis (tableau d'au moins ${min} élément(s)).`)
  }
  return v.map((x) => String(x))
}

// ─── Credentials ──────────────────────────────────────────────────────────────

interface Creds {
  higgsToken: string | null
  higgsRefreshToken: string
  higgsClerkToken: string
  anthropicKey: string | null
  googleRefreshToken: string | null
  driveFolderId: string | null
}

async function loadCreds(userId: string): Promise<Creds> {
  const c = await prisma.userCredentials.findUnique({ where: { userId } })
  return {
    higgsToken: decryptIfPresent(c?.higgsFieldToken),
    higgsRefreshToken: decryptIfPresent(c?.higgsFieldRefreshToken) || '',
    higgsClerkToken: decryptIfPresent(c?.higgsFieldClerkToken) || '',
    anthropicKey: decryptIfPresent(c?.anthropicApiKey),
    googleRefreshToken: c?.googleRefreshToken || null,
    driveFolderId: c?.driveFolderId || null,
  }
}

/** Env Google Drive (refresh token + dossier). Les GOOGLE_CLIENT_* viennent de process.env. */
function googleEnv(creds: Creds): EnvLike {
  return {
    ...(creds.googleRefreshToken ? { GOOGLE_REFRESH_TOKEN: creds.googleRefreshToken } : {}),
    ...(creds.driveFolderId ? { DRIVE_FOLDER_ID: creds.driveFolderId } : {}),
  }
}

// ─── Matérialisation des fichiers d'entrée ────────────────────────────────────

const KNOWN_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'webm', 'm4v'])

function extFromUrl(u: string): string | null {
  try {
    const p = new URL(u).pathname
    const e = p.split('.').pop()?.toLowerCase()
    return e && KNOWN_EXTS.has(e) ? e : null
  } catch {
    return null
  }
}

/** Récupère le contenu d'une entrée (data: URI, base64 brut, ou URL http(s)). */
async function fetchInput(input: string): Promise<{ buffer: Buffer; ext: string }> {
  const dataUri = input.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i)
  if (dataUri) {
    const mime = dataUri[1].toLowerCase()
    const sub = mime.split('/')[1] || 'jpg'
    const ext = sub === 'jpeg' ? 'jpg' : (KNOWN_EXTS.has(sub) ? sub : 'jpg')
    return { buffer: Buffer.from(dataUri[2], 'base64'), ext }
  }
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input)
    if (!res.ok) throw new Error(`Téléchargement échoué (${res.status}) : ${input}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || ''
    const ctSub = ct.split('/')[1]?.split(';')[0]?.toLowerCase()
    const ext =
      extFromUrl(input) ||
      (ctSub === 'jpeg' ? 'jpg' : ctSub && KNOWN_EXTS.has(ctSub) ? ctSub : 'jpg')
    return { buffer: buf, ext }
  }
  // Base64 brut (sans préfixe data:)
  const cleaned = input.replace(/\s/g, '')
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) && cleaned.length > 64) {
    return { buffer: Buffer.from(cleaned, 'base64'), ext: 'jpg' }
  }
  throw new Error(`Entrée non reconnue (attendu URL http(s), data: URI ou base64).`)
}

/** Crée un dossier temp unique réservé à cet appel MCP. */
function newTempDir(suffix: string): string {
  const dir = path.join(os.tmpdir(), 'modelify_mcp', `${Date.now()}_${randomUUID().slice(0, 8)}`, suffix)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Matérialise une liste d'URLs/base64 en fichiers `img_0001.<ext>` dans un
 * dossier temp, et retourne le chemin absolu du dossier (consommé par les
 * pipelines via `--images-dir` / `--files-dir`).
 */
async function materializeInputs(inputs: string[]): Promise<string> {
  const dir = newTempDir('uploads')
  for (let i = 0; i < inputs.length; i++) {
    const { buffer, ext } = await fetchInput(inputs[i])
    const seq = String(i + 1).padStart(4, '0')
    fs.writeFileSync(path.join(dir, `img_${seq}.${ext}`), buffer)
  }
  return dir
}

/** Matérialise UNE entrée vers un chemin absolu donné. */
async function materializeFile(input: string, destNoExt: string): Promise<string> {
  const { buffer, ext } = await fetchInput(input)
  const dest = `${destNoExt}.${ext}`
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, buffer)
  return dest
}

/** Retourne `{ runId, status, creditsCharged, balance }` après débit + spawn. */
function asyncRun(runId: string, name: string, balance: number) {
  return { runId, status: 'running' as const, creditsCharged: costOf(name), balance }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

// ── modelify_generate_reference_set ──────────────────────────────────────────
// Mirror de /api/refset/generate (pipeline.model_refset generate).
const generateReferenceSet: ToolHandler = async (args, ctx) => {
  const name = 'modelify_generate_reference_set'
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY absente de l\'environnement serveur.')

  const anchor = optStr(args, 'anchorUrl') || optStr(args, 'anchorBase64')
  if (!anchor) throw new Error('Ancre d\'identité requise : "anchorUrl" ou "anchorBase64".')

  const rawPrompts = args.prompts
  if (!Array.isArray(rawPrompts) || rawPrompts.length === 0) {
    throw new Error('Paramètre "prompts" requis (tableau de prompts, chaîne ou {id,label,prompt}).')
  }
  const cleanPrompts = rawPrompts
    .map((p: unknown, i: number) => {
      if (typeof p === 'string') return { id: String(i + 1), label: '', prompt: p }
      const o = (p ?? {}) as { id?: unknown; label?: unknown; prompt?: unknown }
      return { id: String(o.id ?? i + 1), label: String(o.label ?? ''), prompt: String(o.prompt ?? '') }
    })
    .filter((p) => p.prompt.trim())
  if (!cleanPrompts.length) throw new Error('Aucun prompt valide (texte vide).')

  const resolution = ['0.5K', '1K', '2K', '4K'].includes(String(args.resolution)) ? String(args.resolution) : '2K'
  const aspectRatio = optStr(args, 'aspectRatio') || '9:16'

  // Matérialiser l'ancre AVANT le débit.
  const anchorBuf = await fetchInput(anchor)

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'model_refset',
    label: 'mcp-refset',
    runData: { modelSetting: 'gemini_refset', aspectRatio, quality: resolution, maxPosts: cleanPrompts.length },
    extraEnv: {
      ...(process.env.SUPABASE_URL ? { SUPABASE_URL: process.env.SUPABASE_URL } : {}),
      ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
      ...(process.env.MODELIFY_STORAGE_BUCKET ? { MODELIFY_STORAGE_BUCKET: process.env.MODELIFY_STORAGE_BUCKET } : {}),
    },
    args: (runId) => {
      const projectRoot = path.join(process.cwd(), '..')
      const workDir = path.join(projectRoot, 'temp', 'refset', runId)
      fs.mkdirSync(workDir, { recursive: true })
      const anchorPath = path.join(workDir, `anchor.${anchorBuf.ext}`)
      fs.writeFileSync(anchorPath, anchorBuf.buffer)
      const promptsPath = path.join(workDir, 'prompts.json')
      fs.writeFileSync(promptsPath, JSON.stringify(cleanPrompts), 'utf-8')
      // Enregistrer dans le singleton in-memory pour que modelify_enhance_set
      // (qui lit les images depuis workDir via refsetRuns) puisse les retrouver,
      // et pour que le stream SSE / image-server existant fonctionnent aussi.
      refsetRuns.set(runId, { userId: ctx.userId, events: [], done: false, workDir, startedAt: Date.now() })
      return [
        'generate',
        '--run-id', runId,
        '--anchor-path', anchorPath,
        '--prompts-json', promptsPath,
        '--output-dir', workDir,
        '--resolution', resolution,
        '--aspect-ratio', aspectRatio,
        '--storage-prefix', `${ctx.userId}/refset/${runId}`,
      ]
    },
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_enhance_set ─────────────────────────────────────────────────────
// Mirror de /api/refset/enhance (pipeline.model_enhance generate).
const enhanceSet: ToolHandler = async (args, ctx) => {
  const name = 'modelify_enhance_set'

  const rawItems = args.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Paramètre "items" requis : tableau de {runId, name} (issus d\'un set de référence).')
  }
  const items = rawItems.map((it: unknown) => {
    const o = (it ?? {}) as { runId?: unknown; name?: unknown }
    return { runId: String(o.runId || ''), name: String(o.name || '') }
  })

  const mode = ['morph', 'back', 'both'].includes(String(args.mode)) ? String(args.mode) : 'morph'
  const route = ['wavespeed', 'modelark'].includes(String(args.route)) ? String(args.route) : 'wavespeed'
  const bustIdx = Number.isInteger(args.bustIdx) ? Math.max(0, Math.min(3, args.bustIdx as number)) : 0
  const buttIdx = Number.isInteger(args.buttIdx) ? Math.max(0, Math.min(2, args.buttIdx as number)) : 1
  const hips = ['wide', 'moderate', 'subtle'].includes(String(args.hips)) ? String(args.hips) : 'wide'
  const seed = Number.isInteger(args.seed) ? (args.seed as number) : 778899
  const keepFraming = args.keepFraming === true
  const keepDress = args.keepDress === true

  if (route === 'wavespeed' && !process.env.WAVESPEED_API_KEY) {
    throw new Error('WAVESPEED_API_KEY absente de l\'environnement serveur (route wavespeed).')
  }
  if (route === 'modelark' && !process.env.ARK_API_KEY) {
    throw new Error('ARK_API_KEY absente de l\'environnement serveur (route modelark).')
  }

  // Résoudre les chemins depuis le workDir de chaque run source (anti path-traversal).
  const paths: string[] = []
  for (const it of items) {
    const src = refsetRuns.get(it.runId)
    if (!src || src.userId !== ctx.userId) continue
    const safe = path.basename(it.name)
    if (safe !== it.name) continue
    const fp = path.join(src.workDir, safe)
    if (fs.existsSync(fp)) paths.push(fp)
  }
  if (!paths.length) {
    throw new Error(
      'Images introuvables. modelify_enhance_set requiert des {runId, name} provenant d\'un ' +
      'set de référence généré sur CE serveur et encore en mémoire (les runs expirent ~2h ' +
      'après génération, et sont perdus au redémarrage du serveur). Les noms de fichiers ' +
      'proviennent des events du run de référence.',
    )
  }

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'model_enhance',
    label: 'mcp-enhance',
    runData: { modelSetting: 'seedream_enhance', maxPosts: paths.length },
    extraEnv: {
      ARK_API_KEY: process.env.ARK_API_KEY,
      ARK_BASE_URL: process.env.ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3',
      MODELIFY_IMAGE_MODEL: process.env.MODELIFY_IMAGE_MODEL || 'seedream-4-5-251128',
      ...(process.env.WAVESPEED_API_KEY ? { WAVESPEED_API_KEY: process.env.WAVESPEED_API_KEY } : {}),
      ...(process.env.SUPABASE_URL ? { SUPABASE_URL: process.env.SUPABASE_URL } : {}),
      ...(process.env.SUPABASE_SERVICE_ROLE_KEY ? { SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY } : {}),
      ...(process.env.MODELIFY_STORAGE_BUCKET ? { MODELIFY_STORAGE_BUCKET: process.env.MODELIFY_STORAGE_BUCKET } : {}),
    },
    args: (runId) => {
      const projectRoot = path.join(process.cwd(), '..')
      const workDir = path.join(projectRoot, 'temp', 'refset', runId)
      fs.mkdirSync(workDir, { recursive: true })
      refsetRuns.set(runId, { userId: ctx.userId, events: [], done: false, workDir, startedAt: Date.now() })
      return [
        'generate',
        '--run-id', runId,
        '--images', paths.join('|'),
        '--output-dir', workDir,
        '--mode', mode,
        '--route', route,
        '--bust-idx', String(bustIdx),
        '--hips', hips,
        '--seed', String(seed),
        '--butt-idx', String(buttIdx),
        '--storage-prefix', `${ctx.userId}/edits/${runId}`,
        ...(keepFraming ? ['--keep-framing'] : []),
        ...(keepDress ? ['--keep-dress'] : []),
      ]
    },
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_studio_batch ────────────────────────────────────────────────────
// Mirror de /api/studio/start (pipeline.studio).
const studioBatch: ToolHandler = async (args, ctx) => {
  const name = 'modelify_studio_batch'
  const soulId = reqStr(args, 'soulId')
  const elementId = reqStr(args, 'elementId')
  const mode = String(args.mode || 'batch_config')
  if (!['batch_config', 'random_select', 'random_full'].includes(mode)) {
    throw new Error('Mode invalide (batch_config|random_select|random_full).')
  }
  const count = Math.max(1, optNum(args, 'count', 10))
  const model = optStr(args, 'model') || 'auto'
  const aspectRatio = optStr(args, 'aspectRatio') || '2:3'
  const quality = optStr(args, 'quality') || '2k'
  const characterName = optStr(args, 'characterName') || ''
  const selections = (args.selections && typeof args.selections === 'object') ? args.selections : {}

  const creds = await loadCreds(ctx.userId)
  if (!creds.anthropicKey || !creds.higgsToken) {
    throw new Error('Credentials incomplets (Anthropic + Higgsfield requis dans les Réglages).')
  }

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'studio',
    label: 'mcp-studio',
    runData: {
      maxPosts: count, selectedSoulId: soulId, selectedElementId: elementId,
      modelSetting: model, aspectRatio, quality,
    },
    extraEnv: {
      ANTHROPIC_KEY: creds.anthropicKey,
      HIGGSFIELD_TOKEN: creds.higgsToken,
      ...googleEnv(creds),
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: [
      '--selections', JSON.stringify(selections),
      '--mode', mode,
      '--count', String(count),
      '--soul-id', soulId,
      '--element-id', elementId,
      '--model', model,
      '--aspect-ratio', aspectRatio,
      '--quality', quality,
    ],
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_bulk_edit ───────────────────────────────────────────────────────
// Mirror de /api/bulk-edit/start (pipeline.bulk_edit).
const bulkEdit: ToolHandler = async (args, ctx) => {
  const name = 'modelify_bulk_edit'
  const prompt = reqStr(args, 'prompt')
  const elementId = optStr(args, 'elementId') || ''
  const quality = optStr(args, 'quality') || 'high'
  const characterName = optStr(args, 'characterName') || ''

  // Source des images : uploadRunId (dossier déjà présent) OU imageUrls[] (matérialisés).
  let imagesDir: string
  const uploadRunId = optStr(args, 'uploadRunId')
  if (uploadRunId) {
    imagesDir = path.join(os.tmpdir(), uploadRunId, 'uploads')
    if (!fs.existsSync(imagesDir)) throw new Error(`Dossier images introuvable pour uploadRunId=${uploadRunId}.`)
  } else if (Array.isArray(args.imageUrls) && args.imageUrls.length) {
    imagesDir = await materializeInputs(reqStrArray(args, 'imageUrls'))
  } else {
    throw new Error('Fournir "uploadRunId" (dossier d\'upload) ou "imageUrls" (tableau d\'URLs/base64).')
  }
  const imageFiles = fs.readdirSync(imagesDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
  if (!imageFiles.length) throw new Error('Aucune image valide (jpg/png/webp) trouvée.')

  const creds = await loadCreds(ctx.userId)
  if (!creds.higgsToken) throw new Error('Higgsfield token requis (Réglages).')

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'bulk_edit',
    label: 'mcp-bulk-edit',
    runData: {
      maxPosts: imageFiles.length, selectedElementId: elementId || null,
      modelSetting: 'bulk_edit', aspectRatio: '1:1', quality,
      ...(characterName ? { characterName } : {}),
    },
    extraEnv: {
      HIGGSFIELD_TOKEN: creds.higgsToken,
      ...(creds.higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: creds.higgsRefreshToken } : {}),
      ...googleEnv(creds),
      DRIVE_NICHE: 'bulk_edit',
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: ['--images-dir', imagesDir, '--prompt', prompt, '--quality', quality],
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_generate_video ──────────────────────────────────────────────────
// Mirror de /api/video/start (pipeline.video_studio).
const generateVideo: ToolHandler = async (args, ctx) => {
  const name = 'modelify_generate_video'
  const elementId = reqStr(args, 'elementId')
  const mode = String(args.mode || 'random_full')
  const aspectRatio = optStr(args, 'aspectRatio') || '9:16'
  const resolution = optStr(args, 'resolution') || '720p'
  const duration = optNum(args, 'duration', 5)
  const characterName = optStr(args, 'characterName') || ''

  const creds = await loadCreds(ctx.userId)
  if (!creds.higgsToken) throw new Error('Higgsfield token requis (Réglages).')

  const isPromptMode = mode === 'direct' || mode === 'variation'

  // Pré-charger les données DB (validation AVANT débit) + figer le payload.
  let maxPosts = optNum(args, 'count', 5)
  let promptPayload: string | null = null     // contenu du validated_<id>.json
  let bankPayload: string | null = null       // contenu du bank_<id>.json
  let niche = optStr(args, 'niche') || 'conference'
  const selections = (args.selections && typeof args.selections === 'object') ? args.selections : {}

  if (isPromptMode) {
    const ids = reqStrArray(args, 'validatedPromptIds').map((x) => Number(x)).filter((n) => Number.isInteger(n))
    if (!ids.length) throw new Error('"validatedPromptIds" requis (tableau d\'IDs entiers) en mode direct/variation.')
    const batchCount = Math.max(1, optNum(args, 'batchCount', 1))
    const outfitOverride = optStr(args, 'outfitOverride') ?? null
    const phraseOverride = optStr(args, 'phraseOverride') ?? null

    const dbPrompts = await prisma.validatedPrompt.findMany({
      where: { id: { in: ids }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, promptJson: true, outfitText: true, speakerLine: true, subNiche: true, phraseVariations: true },
    })
    if (!dbPrompts.length) throw new Error('Aucun prompt validé actif trouvé pour les IDs fournis.')

    const validatedPrompts = dbPrompts.flatMap((p) => {
      const phraseVariations = p.phraseVariations ? JSON.parse(p.phraseVariations) : null
      return Array.from({ length: batchCount }, (_, i) => ({
        id: p.id, title: p.title, promptJson: p.promptJson, outfitText: p.outfitText,
        speakerLine: p.speakerLine, phraseVariations, subNiche: p.subNiche, repeatIndex: i,
      }))
    })
    maxPosts = validatedPrompts.length
    promptPayload = JSON.stringify({ mode, outfit_override: outfitOverride, phrase_override: phraseOverride, prompts: validatedPrompts })
  } else {
    if (!['random_full', 'random_select', 'batch_config'].includes(mode)) {
      throw new Error('Mode invalide (direct|variation|random_full|random_select|batch_config).')
    }
    let bankPrompts: object[] = []
    try {
      const bankEntries = await prisma.videoPromptBank.findMany({
        where: { userId: ctx.userId, niche, modelType: 'seedance_2_0', ...(characterName ? { characterName } : {}) },
        orderBy: { usageCount: 'desc' },
        take: 50,
      })
      bankPrompts = bankEntries.map((e) => ({
        scenario: e.scenario, prompt_json: e.promptJson, variables: e.variables ? JSON.parse(e.variables) : {},
      }))
    } catch { /* table peut ne pas exister */ }
    bankPayload = JSON.stringify(bankPrompts)
  }

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'video_studio',
    label: 'mcp-video',
    runData: {
      maxPosts, selectedElementId: elementId, modelSetting: 'seedance_2_0',
      aspectRatio, quality: resolution, ...(characterName ? { characterName } : {}),
    },
    extraEnv: {
      HIGGSFIELD_TOKEN: creds.higgsToken,
      ...googleEnv(creds),
      DRIVE_NICHE: isPromptMode ? 'conference_sport' : niche,
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: (runId) => {
      if (isPromptMode) {
        const promptsFile = path.join(os.tmpdir(), `validated_${runId}.json`)
        fs.writeFileSync(promptsFile, promptPayload!)
        return [
          '--run-id', runId, '--mode', mode, '--element-id', elementId,
          '--aspect-ratio', aspectRatio, '--resolution', resolution,
          '--duration', String(duration), '--validated-prompts-file', promptsFile,
        ]
      }
      const bankFile = path.join(os.tmpdir(), `bank_${runId}.json`)
      fs.writeFileSync(bankFile, bankPayload!)
      return [
        '--run-id', runId, '--count', String(maxPosts), '--mode', mode,
        '--selections', JSON.stringify(selections), '--niche', niche,
        '--element-id', elementId, '--aspect-ratio', aspectRatio,
        '--resolution', resolution, '--duration', String(duration),
        '--bank-prompts-file', bankFile,
      ]
    },
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_create_carousel ─────────────────────────────────────────────────
// Mirror de /api/carousel/create (pipeline.carousel_creator).
const createCarousel: ToolHandler = async (args, ctx) => {
  const name = 'modelify_create_carousel'
  const imageUrls = (Array.isArray(args.imageUrls) ? reqStrArray(args, 'imageUrls') : reqStrArray(args, 'images'))
  if (imageUrls.length < 4) throw new Error(`Il faut au moins 4 images pour créer des carousels (reçu ${imageUrls.length}).`)
  const maxCarousels = Math.min(200, Math.max(1, optNum(args, 'maxCarousels', 200)))
  const characterName = optStr(args, 'characterName') || ''

  const creds = await loadCreds(ctx.userId)
  if (!creds.googleRefreshToken || !creds.driveFolderId) {
    throw new Error('Google Drive non configuré (refresh token + dossier requis dans les Réglages).')
  }

  const imagesDir = await materializeInputs(imageUrls)

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'carousel_creator',
    label: 'mcp-carousel',
    runData: { maxPosts: maxCarousels, modelSetting: 'carousel_creator', ...(characterName ? { characterName } : {}) },
    extraEnv: {
      ...googleEnv(creds),
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: ['--images-dir', imagesDir, '--max-carousels', String(maxCarousels)],
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_carousel_variations ─────────────────────────────────────────────
// Mirror de /api/carousel/generate-variations (pipeline.carousel_variations).
const carouselVariations: ToolHandler = async (args, ctx) => {
  const name = 'modelify_carousel_variations'
  const imageUrls = reqStrArray(args, 'imageUrls')
  const soulId = reqStr(args, 'soulId')
  const characterName = optStr(args, 'characterName') || ''
  const quality = optStr(args, 'quality') || '2k'

  const creds = await loadCreds(ctx.userId)
  if (!creds.googleRefreshToken || !creds.driveFolderId) throw new Error('Google Drive non configuré (Réglages).')
  if (!creds.higgsToken) throw new Error('Higgsfield non connecté (Réglages).')
  if (!creds.anthropicKey) throw new Error('Clé Anthropic manquante (Réglages).')

  const imagesDir = await materializeInputs(imageUrls)

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'carousel_variations',
    label: 'mcp-variations',
    runData: { maxPosts: imageUrls.length, modelSetting: 'carousel_variations', quality, ...(characterName ? { characterName } : {}) },
    extraEnv: {
      HIGGSFIELD_TOKEN: creds.higgsToken,
      HIGGSFIELD_REFRESH_TOKEN: creds.higgsRefreshToken,
      ANTHROPIC_KEY: creds.anthropicKey,
      ...googleEnv(creds),
      VARIATION_QUALITY: quality,
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: ['--images-dir', imagesDir, '--soul-id', soulId],
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_motion_control ──────────────────────────────────────────────────
// Mirror de /api/motion-control/start (pipeline.motion_control).
const motionControl: ToolHandler = async (args, ctx) => {
  const name = 'modelify_motion_control'
  const characterName = optStr(args, 'characterName') || ''
  const conceptId = optStr(args, 'conceptId')
  const conceptImageUrl = optStr(args, 'conceptImageUrl')
  const conceptVideoUrl = optStr(args, 'conceptVideoUrl')

  const creds = await loadCreds(ctx.userId)
  if (!creds.higgsToken) throw new Error('Higgsfield token requis (Réglages).')

  let imagePath = ''
  let videoPath = ''
  let preGeneratedImages: string[] = []
  const runDir = newTempDir('mc')

  if (conceptId) {
    // ── Mode B : depuis la bibliothèque de concepts (DB) ──
    const concept = await prisma.motionConcept.findUnique({ where: { id: conceptId } })
    if (!concept) throw new Error('Concept introuvable.')
    if (concept.userId !== ctx.userId) throw new Error('Accès refusé à ce concept.')
    if (concept.localVideoPath && fs.existsSync(concept.localVideoPath)) {
      videoPath = concept.localVideoPath
    } else {
      throw new Error('Vidéo locale du concept introuvable (supprimée depuis /tmp). Re-générer le concept dans l\'app.')
    }
    if (!concept.conceptImageUrl) throw new Error('conceptImageUrl manquant dans ce concept.')
    imagePath = await materializeFile(concept.conceptImageUrl, path.join(runDir, 'concept'))
    const outfits = Array.isArray(concept.outfitImages) ? (concept.outfitImages as string[]) : []
    if (outfits.length) preGeneratedImages = outfits
    prisma.motionConcept.update({ where: { id: conceptId }, data: { viewCount: { increment: 1 } } }).catch(() => {})
  } else if (conceptImageUrl && conceptVideoUrl) {
    // ── Mode A : image + vidéo fournies par URL/base64 ──
    imagePath = await materializeFile(conceptImageUrl, path.join(runDir, 'concept'))
    videoPath = await materializeFile(conceptVideoUrl, path.join(runDir, 'concept_video'))
  } else {
    throw new Error('Fournir soit "conceptId" (bibliothèque), soit "conceptImageUrl" + "conceptVideoUrl".')
  }

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'motion_control',
    label: 'mcp-motion',
    runData: {
      maxPosts: 4, modelSetting: 'kling_motion_control',
      ...(conceptId ? { concept: { connect: { id: conceptId } } } : {}),
    },
    extraEnv: {
      HIGGSFIELD_TOKEN: creds.higgsToken,
      ...(creds.higgsRefreshToken ? { HIGGSFIELD_REFRESH_TOKEN: creds.higgsRefreshToken } : {}),
      ...(creds.higgsClerkToken ? { HIGGSFIELD_CLERK_TOKEN: creds.higgsClerkToken } : {}),
      ...googleEnv(creds),
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: [
      '--concept-image', imagePath,
      '--concept-video', videoPath,
      ...(preGeneratedImages.length ? ['--pre-generated-images', ...preGeneratedImages] : []),
    ],
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_spoof ───────────────────────────────────────────────────────────
// Mirror de /api/spoofer/start (pipeline.spoofer). Aucun credential externe.
const spoof: ToolHandler = async (args, ctx) => {
  const name = 'modelify_spoof'
  const fileUrls = reqStrArray(args, 'fileUrls')
  const level = ['light', 'medium', 'aggressive'].includes(String(args.level)) ? String(args.level) : 'medium'
  const variations = Math.max(1, Math.min(20, optNum(args, 'variations', 5)))
  const noMirror = args.noMirror === true

  const filesDir = await materializeInputs(fileUrls)

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'spoofer',
    label: 'mcp-spoof',
    runData: { maxPosts: fileUrls.length, modelSetting: 'spoofer', quality: level },
    args: (runId) => {
      const outputDir = path.join(path.dirname(filesDir), `output_${runId}`)
      return [
        '--run-id', runId, '--files-dir', filesDir, '--level', level,
        '--variations', String(variations), '--output-dir', outputDir,
        ...(noMirror ? ['--no-mirror'] : []),
      ]
    },
  })

  return asyncRun(runId, name, balance)
}

// ── modelify_optimize_metadata ───────────────────────────────────────────────
// Mirror de /api/metadata/start (pipeline.metadata_batch).
const optimizeMetadata: ToolHandler = async (args, ctx) => {
  const name = 'modelify_optimize_metadata'
  const fileUrls = reqStrArray(args, 'fileUrls')
  const characterName = optStr(args, 'characterName') || ''

  const creds = await loadCreds(ctx.userId)
  if (!creds.googleRefreshToken || !creds.driveFolderId) throw new Error('Google Drive non configuré (Réglages).')

  const filesDir = await materializeInputs(fileUrls)

  const balance = await debit(ctx.userId, costOf(name), `mcp:${name}`)

  const { runId } = await spawnPipelineRun({
    userId: ctx.userId,
    module: 'metadata_batch',
    label: 'mcp-metadata',
    runData: { maxPosts: fileUrls.length, modelSetting: 'metadata_batch', ...(characterName ? { characterName } : {}) },
    extraEnv: {
      ...googleEnv(creds),
      ...(characterName ? { CHARACTER_FOLDER_NAME: characterName } : {}),
    },
    args: ['--files-dir', filesDir],
  })

  return asyncRun(runId, name, balance)
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE
// ═══════════════════════════════════════════════════════════════════════════

const SCOPE = 'content:generate'

export const contentTools: ToolModule = {
  specs: [
    {
      name: 'modelify_generate_reference_set',
      title: 'Générer un set de référence',
      description:
        "Génère un set d'images de référence cohérentes (i2i Gemini/Nano Banana) à partir d'une image d'ancre " +
        "d'identité + une liste de prompts. Entrées : anchorUrl OU anchorBase64 (data: URI / base64), prompts[] " +
        "(chaînes ou {id,label,prompt}), resolution (0.5K|1K|2K|4K, défaut 2K), aspectRatio (défaut 9:16). " +
        "Coût 80 crédits. ASYNCHRONE : suivre via modelify_get_run. NOTE : les images sont écrites en stockage " +
        "Supabase (pas dans la table Generation) — modelify_get_results ne les listera pas ; récupérer les noms/URLs " +
        "via le flux d'events du run. Requiert GEMINI_API_KEY côté serveur.",
      inputSchema: {
        type: 'object',
        properties: {
          anchorUrl: { type: 'string', description: 'URL http(s) de l\'image d\'ancre d\'identité.' },
          anchorBase64: { type: 'string', description: 'Image d\'ancre en data: URI ou base64 brut (alternative à anchorUrl).' },
          prompts: { type: 'array', description: 'Prompts du set : tableau de chaînes ou d\'objets {id,label,prompt}.', items: {} },
          resolution: { type: 'string', enum: ['0.5K', '1K', '2K', '4K'], description: 'Résolution (défaut 2K).' },
          aspectRatio: { type: 'string', description: 'Ratio d\'aspect (défaut 9:16).' },
        },
        required: ['prompts'],
      },
    },
    {
      name: 'modelify_enhance_set',
      title: 'Améliorer un set de référence',
      description:
        "Édite des images d'un set de référence existant (Seedream 4.5 : morph morphologie / vue de dos). " +
        "Entrées : items[] = [{runId, name}] désignant des images d'un set généré PRÉCÉDEMMENT sur ce serveur, " +
        "mode (morph|back|both), knobs morpho (bustIdx 0-3, buttIdx 0-2, hips wide|moderate|subtle, seed, " +
        "keepFraming, keepDress), route (wavespeed|modelark, défaut wavespeed). Coût 80 crédits. ASYNCHRONE. " +
        "CAVEAT : dépend de l'état in-memory du set source (runId encore présent, ~2h, perdu au redémarrage) ; " +
        "les noms de fichiers proviennent des events du run de référence. Résultats en stockage Supabase, pas " +
        "dans modelify_get_results. Requiert WAVESPEED_API_KEY ou ARK_API_KEY côté serveur.",
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Images à éditer : [{runId, name}] (run de référence + nom de fichier).',
            items: { type: 'object', properties: { runId: { type: 'string' }, name: { type: 'string' } }, required: ['runId', 'name'] },
          },
          mode: { type: 'string', enum: ['morph', 'back', 'both'], description: 'Type d\'édition (défaut morph).' },
          route: { type: 'string', enum: ['wavespeed', 'modelark'], description: 'Backend (défaut wavespeed).' },
          bustIdx: { type: 'number', description: 'Index d\'amplification poitrine 0-3 (défaut 0).' },
          buttIdx: { type: 'number', description: 'Index fessier 0-2 (défaut 1).' },
          hips: { type: 'string', enum: ['wide', 'moderate', 'subtle'], description: 'Largeur de hanches (défaut wide).' },
          seed: { type: 'number', description: 'Seed déterministe (défaut 778899).' },
          keepFraming: { type: 'boolean', description: 'Conserver le cadrage original.' },
          keepDress: { type: 'boolean', description: 'Conserver la tenue.' },
        },
        required: ['items'],
      },
    },
    {
      name: 'modelify_studio_batch',
      title: 'Batch Prompt Studio',
      description:
        "Génère un lot d'images stylisées via le Prompt Studio (Higgsfield SoulCinema + Claude). Entrées : " +
        "soulId, elementId (obligatoires), mode (batch_config|random_select|random_full), count (défaut 10), " +
        "selections (objet), model (défaut auto), aspectRatio (défaut 2:3), quality (défaut 2k), characterName. " +
        "Coût 96 crédits. ASYNCHRONE : suivre via modelify_get_run, récupérer les images via modelify_get_results. " +
        "Requiert credentials Anthropic + Higgsfield.",
      inputSchema: {
        type: 'object',
        properties: {
          soulId: { type: 'string', description: 'ID du Soul Character Higgsfield.' },
          elementId: { type: 'string', description: 'ID du Reference Element Higgsfield.' },
          mode: { type: 'string', enum: ['batch_config', 'random_select', 'random_full'], description: 'Mode de sélection (défaut batch_config).' },
          count: { type: 'number', description: 'Nombre d\'images (défaut 10).' },
          selections: { type: 'object', description: 'Sélections de variables par catégorie (mode batch_config).' },
          model: { type: 'string', description: 'Modèle image (défaut auto).' },
          aspectRatio: { type: 'string', description: 'Ratio (défaut 2:3).' },
          quality: { type: 'string', description: 'Qualité (défaut 2k).' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
        required: ['soulId', 'elementId'],
      },
    },
    {
      name: 'modelify_bulk_edit',
      title: 'Édition en lot (i2i)',
      description:
        "Applique un même prompt i2i (Seedream 4.5) à un lot d'images. Entrées : prompt (obligatoire), et la " +
        "source des images = uploadRunId (dossier d'upload déjà créé) OU imageUrls[] (URLs/base64 matérialisés). " +
        "Optionnel : elementId (préfixe <<<id>>>), quality (low|medium|high, défaut high), characterName. " +
        "Coût 40 crédits. ASYNCHRONE : modelify_get_run / modelify_get_results. Requiert credential Higgsfield.",
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Prompt d\'édition commun à toutes les images.' },
          uploadRunId: { type: 'string', description: 'ID d\'un dossier d\'upload existant (alternative à imageUrls).' },
          imageUrls: { type: 'array', items: { type: 'string' }, description: 'Images à éditer (URLs http(s) ou base64).' },
          elementId: { type: 'string', description: 'Reference Element Higgsfield optionnel.' },
          quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Qualité (défaut high).' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'modelify_generate_video',
      title: 'Générer des vidéos',
      description:
        "Génère un lot de vidéos (Seedance 2.0, 9:16). Modes : direct/variation (à partir de prompts validés — " +
        "requiert validatedPromptIds[] ; variation applique outfitOverride/phraseOverride) ou legacy " +
        "random_full|random_select|batch_config (banque de prompts par niche). Entrées : elementId (obligatoire), " +
        "mode, validatedPromptIds[], batchCount, outfitOverride, phraseOverride, niche, count, selections, " +
        "aspectRatio (défaut 9:16), resolution (défaut 720p), duration (défaut 5s), characterName. Coût 60 crédits. " +
        "ASYNCHRONE : modelify_get_run / modelify_get_results. Requiert credential Higgsfield.",
      inputSchema: {
        type: 'object',
        properties: {
          elementId: { type: 'string', description: 'ID du Reference Element Higgsfield.' },
          mode: { type: 'string', enum: ['direct', 'variation', 'random_full', 'random_select', 'batch_config'], description: 'Mode de génération.' },
          validatedPromptIds: { type: 'array', items: { type: 'number' }, description: 'IDs de prompts validés (modes direct/variation).' },
          batchCount: { type: 'number', description: 'Répétitions par prompt (défaut 1).' },
          outfitOverride: { type: 'string', description: 'Texte d\'outfit de remplacement (mode variation).' },
          phraseOverride: { type: 'string', description: 'Réplique de remplacement (mode variation).' },
          niche: { type: 'string', description: 'Niche pour la banque de prompts (modes legacy, défaut conference).' },
          count: { type: 'number', description: 'Nombre de vidéos (modes legacy, défaut 5).' },
          selections: { type: 'object', description: 'Sélections (mode batch_config legacy).' },
          aspectRatio: { type: 'string', description: 'Ratio (défaut 9:16).' },
          resolution: { type: 'string', description: 'Résolution (défaut 720p).' },
          duration: { type: 'number', description: 'Durée en secondes (défaut 5).' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
        required: ['elementId'],
      },
    },
    {
      name: 'modelify_create_carousel',
      title: 'Créer des carrousels',
      description:
        "Assemble des carrousels Instagram à partir d'images (>= 4). Entrées : imageUrls[] (ou images[]) URLs/base64, " +
        "maxCarousels (1-200, défaut 200), characterName. Coût 32 crédits. ASYNCHRONE : suivre via modelify_get_run. " +
        "NOTE : ce pipeline pousse directement sur Google Drive et utilise un état in-memory — ses résultats " +
        "n'apparaissent PAS dans modelify_get_results (seul le statut du run est suivi). Requiert Google Drive configuré.",
      inputSchema: {
        type: 'object',
        properties: {
          imageUrls: { type: 'array', items: { type: 'string' }, description: 'Images du pool (>= 4), URLs http(s) ou base64.' },
          images: { type: 'array', items: { type: 'string' }, description: 'Alias de imageUrls.' },
          maxCarousels: { type: 'number', description: 'Nombre max de carrousels (1-200, défaut 200).' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
        required: ['imageUrls'],
      },
    },
    {
      name: 'modelify_carousel_variations',
      title: 'Variations de carrousel',
      description:
        "Pour chaque image fournie, génère 3 variations i2i (Higgsfield SoulCinema) et crée un dossier carrousel " +
        "Drive (original + 3 variations). Entrées : imageUrls[] URLs/base64, soulId (obligatoire), characterName, " +
        "quality (défaut 2k). Coût 24 crédits. ASYNCHRONE : suivre via modelify_get_run. NOTE : pousse sur Drive via " +
        "un état in-memory — résultats absents de modelify_get_results. Requiert Higgsfield + Anthropic + Google Drive.",
      inputSchema: {
        type: 'object',
        properties: {
          imageUrls: { type: 'array', items: { type: 'string' }, description: 'Images sources (URLs http(s) ou base64).' },
          soulId: { type: 'string', description: 'ID du Soul Character Higgsfield.' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
          quality: { type: 'string', description: 'Qualité des variations (défaut 2k).' },
        },
        required: ['imageUrls', 'soulId'],
      },
    },
    {
      name: 'modelify_motion_control',
      title: 'Motion control (Kling)',
      description:
        "Applique le mouvement d'une vidéo de référence à une image concept (Kling 3.0 Motion Control + Seedream " +
        "outfits). Deux modes : (A) conceptImageUrl + conceptVideoUrl (URLs/base64), ou (B) conceptId d'un concept " +
        "enregistré en bibliothèque (sa vidéo locale doit encore exister). Optionnel : characterName. Coût 70 crédits. " +
        "ASYNCHRONE : modelify_get_run / modelify_get_results. Requiert credential Higgsfield.",
      inputSchema: {
        type: 'object',
        properties: {
          conceptId: { type: 'string', description: 'ID d\'un MotionConcept en bibliothèque (mode B).' },
          conceptImageUrl: { type: 'string', description: 'Image concept (URL/base64) — mode A, avec conceptVideoUrl.' },
          conceptVideoUrl: { type: 'string', description: 'Vidéo de référence (URL/base64) — mode A, avec conceptImageUrl.' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
      },
    },
    {
      name: 'modelify_spoof',
      title: 'Spoof anti-détection',
      description:
        "Génère des variations anti-détection (rotations/crops/bruit/EXIF/mirror) de fichiers images ou vidéos. " +
        "Entrées : fileUrls[] (URLs/base64), level (light|medium|aggressive, défaut medium), variations (1-20, " +
        "défaut 5), noMirror (bool). Coût 1 crédit. Traitement 100% local, aucun credential externe. ASYNCHRONE : " +
        "suivre via modelify_get_run. NOTE : sortie = ZIP servi par l'app (état in-memory) — non récupérable via " +
        "modelify_get_results.",
      inputSchema: {
        type: 'object',
        properties: {
          fileUrls: { type: 'array', items: { type: 'string' }, description: 'Fichiers à spoofer (URLs http(s) ou base64).' },
          level: { type: 'string', enum: ['light', 'medium', 'aggressive'], description: 'Intensité (défaut medium).' },
          variations: { type: 'number', description: 'Nombre de variations par fichier (1-20, défaut 5).' },
          noMirror: { type: 'boolean', description: 'Désactiver le miroir horizontal.' },
        },
        required: ['fileUrls'],
      },
    },
    {
      name: 'modelify_optimize_metadata',
      title: 'Optimiser les métadonnées',
      description:
        "Optimise les métadonnées de fichiers (EXIF/ICC/qtables façon iPhone naturel) et les pousse sur Google Drive. " +
        "Entrées : fileUrls[] (URLs/base64), characterName. Coût 1 crédit. ASYNCHRONE : suivre via modelify_get_run. " +
        "NOTE : pousse sur Drive via un état in-memory — résultats absents de modelify_get_results. Requiert Google " +
        "Drive configuré.",
      inputSchema: {
        type: 'object',
        properties: {
          fileUrls: { type: 'array', items: { type: 'string' }, description: 'Fichiers à optimiser (URLs http(s) ou base64).' },
          characterName: { type: 'string', description: 'Nom du personnage (dossier Drive).' },
        },
        required: ['fileUrls'],
      },
    },
  ],

  handlers: {
    modelify_generate_reference_set: generateReferenceSet,
    modelify_enhance_set: enhanceSet,
    modelify_studio_batch: studioBatch,
    modelify_bulk_edit: bulkEdit,
    modelify_generate_video: generateVideo,
    modelify_create_carousel: createCarousel,
    modelify_carousel_variations: carouselVariations,
    modelify_motion_control: motionControl,
    modelify_spoof: spoof,
    modelify_optimize_metadata: optimizeMetadata,
  },

  scopes: {
    modelify_generate_reference_set: SCOPE,
    modelify_enhance_set: SCOPE,
    modelify_studio_batch: SCOPE,
    modelify_bulk_edit: SCOPE,
    modelify_generate_video: SCOPE,
    modelify_create_carousel: SCOPE,
    modelify_carousel_variations: SCOPE,
    modelify_motion_control: SCOPE,
    modelify_spoof: SCOPE,
    modelify_optimize_metadata: SCOPE,
  },
}
