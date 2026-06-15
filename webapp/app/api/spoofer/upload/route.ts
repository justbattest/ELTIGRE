/**
 * POST /api/spoofer/upload
 * Phase 1/2 — sauvegarde un chunk de fichiers sur disque.
 * Ne lance PAS le subprocess Python (ça c'est /api/spoofer/start).
 *
 * Body FormData :
 *   files[]       — chunk de fichiers (images ou vidéos)
 *   runId         — (optionnel) si absent, en génère un nouveau
 *
 * Retourne : { runId, savedCount, totalSaved }
 * Le runId retourné doit être renvoyé dans tous les chunks suivants.
 *
 * Mirror de webapp/app/api/metadata/upload/route.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import * as path from 'path'
import * as fs from 'fs'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const files = formData.getAll('files') as File[]
  if (!files || files.length === 0) {
    return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 })
  }

  // Réutiliser le runId existant ou en créer un nouveau
  const existingRunId = (formData.get('runId') as string) || ''
  const runId = existingRunId || `spoofer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  const uploadDir = path.join('/tmp', runId, 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })

  // Compter les fichiers déjà présents (chunks précédents)
  const existingCount = fs.existsSync(uploadDir)
    ? fs.readdirSync(uploadDir).length
    : 0

  let savedCount = 0
  for (const file of files) {
    // Nom sûr + prefixe numérique pour éviter les collisions entre chunks
    const idx = existingCount + savedCount
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    // Si doublon de nom → ajouter suffixe
    let filePath = path.join(uploadDir, safeName)
    if (fs.existsSync(filePath)) {
      const base = safeName.replace(/\.[^.]+$/, '')
      const ext  = safeName.slice(base.length)
      filePath = path.join(uploadDir, `${base}_${String(idx).padStart(4, '0')}${ext}`)
    }
    const buffer = await file.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
    savedCount++
  }

  const totalSaved = existingCount + savedCount
  console.log(`[spoofer:${runId}] chunk +${savedCount} fichiers → total ${totalSaved} sur disque`)

  return NextResponse.json({ runId, savedCount, totalSaved })
}
