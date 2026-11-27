import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabaseAdmin'
import { checkAuth } from '@/lib/adminAuth'

export const dynamic = 'force-dynamic'

// Favoris de l'administrateur : stockés côté serveur (table « favoris_admin »),
// sans passer par un compte visiteur. Réservé à l'admin connecté.
const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()
  const { data, error } = await supabase.from('favoris_admin').select('song_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json((data ?? []).map(r => Number(r.song_id)))
}

// Ajoute un ou plusieurs favoris : { song_ids: number[] }
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const ids: number[] = (Array.isArray(body.song_ids) ? body.song_ids : [body.song_id])
    .map(Number)
    .filter((n: number) => Number.isInteger(n) && n > 0)
  if (ids.length === 0) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { error } = await supabase
    .from('favoris_admin')
    .upsert(ids.map(song_id => ({ song_id })), { onConflict: 'song_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()
  const id = Number(new URL(req.url).searchParams.get('song_id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { error } = await supabase.from('favoris_admin').delete().eq('song_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
