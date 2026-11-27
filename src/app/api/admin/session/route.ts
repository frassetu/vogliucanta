import { NextRequest, NextResponse } from 'next/server'
import { checkAuth } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

// Dit à l'appli si la session administrateur (cookie) est encore valide.
export async function GET(req: NextRequest) {
  return NextResponse.json({ admin: checkAuth(req) })
}
