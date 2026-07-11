/**
 * GET /api/characters — liste les Soul Characters disponibles via CLI.
 * Les Reference Elements viennent de la DB (scannés ou ajoutés manuellement dans le Dashboard).
 *
 * Important: referenceElements est TOUJOURS renvoyé, même si le listing CLI des Soul
 * Characters échoue (token expiré, CLI indisponible, etc.) — sinon un souci passager
 * côté CLI empêchait aussi de sélectionner un Element pour générer une vidéo.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getFreshAccessToken } from '@/lib/higgsfield-status'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const execAsync = promisify(exec)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const creds = await prisma.userCredentials.findUnique({
    where: { userId: session.user.id },
  })

  const referenceElements = creds?.referenceElements
    ? JSON.parse(creds.referenceElements)
    : []

  const { token } = await getFreshAccessToken(session.user.id)
  if (!token) {
    return NextResponse.json({ soulCharacters: [], referenceElements, error: 'Higgsfield non connecté' })
  }

  // HOME isolé
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hf_chars_'))

  try {
    const credsDir = path.join(tmpHome, '.config', 'higgsfield')
    fs.mkdirSync(credsDir, { recursive: true })
    fs.writeFileSync(
      path.join(credsDir, 'credentials.json'),
      JSON.stringify({ access_token: token, refresh_token: '' })
    )

    const { stdout } = await execAsync('higgsfield soul-id list --json', {
      env: { ...process.env, HOME: tmpHome },
      timeout: 20000,
    })

    let chars = JSON.parse(stdout)

    // Filtrer sur status completed uniquement
    chars = chars.filter((c: { status?: string }) => c.status === 'completed')

    return NextResponse.json({ soulCharacters: chars, referenceElements })
  } catch (e) {
    return NextResponse.json({ soulCharacters: [], referenceElements, error: `CLI error: ${String(e).substring(0, 200)}` })
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
}
