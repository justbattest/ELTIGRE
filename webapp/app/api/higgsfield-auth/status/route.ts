import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkHiggsfieldStatus } from '@/lib/higgsfield-status'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ valid: false })

    const result = await checkHiggsfieldStatus(session.user.id)
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ valid: false })
  }
}
