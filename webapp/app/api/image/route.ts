/**
 * GET /api/image?path=/absolute/path/to/slide.jpg
 * Sert les images source téléchargées localement depuis le pipeline.
 * Utilisé dans le KPI pour afficher la photo Instagram originale.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { readFile } from 'fs/promises'
import * as path from 'path'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return new NextResponse('Non autorisé', { status: 401 })

  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) return new NextResponse('path manquant', { status: 400 })

  // Sécurité : le chemin doit être dans le répertoire temp du projet
  const tempDir = path.resolve(process.cwd(), '..', 'temp')
  const resolved = path.resolve(filePath)

  if (!resolved.startsWith(tempDir)) {
    return new NextResponse('Chemin non autorisé', { status: 403 })
  }

  try {
    const data = await readFile(resolved)
    return new NextResponse(data, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Image introuvable', { status: 404 })
  }
}
