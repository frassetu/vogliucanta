import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Reçoit une proposition de paroles (formulaire du Profil) ou une correction de
// chanson (bouton « Signalà ») et la fait envoyer par mail via le script Google
// (le même que pour la synchro du Sheet : il envoie le mail depuis le compte
// propriétaire, vers sa propre boîte).

// Limite simple : 5 envois par heure et par adresse IP (mémoire du serveur,
// donc approximative — c'est un garde-fou, pas une protection absolue).
const MAX_PER_HOUR = 5
const HOUR = 60 * 60 * 1000
const hits = new Map<string, number[]>()

function tooMany(ip: string): boolean {
  const now = Date.now()
  const recent = (hits.get(ip) || []).filter(t => now - t < HOUR)
  if (recent.length >= MAX_PER_HOUR) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear() // évite de grossir indéfiniment
  return false
}

// Nettoie une saisie : texte uniquement, caractères de contrôle retirés, longueur bornée.
function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max)
}
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const digits = (v: unknown, max: number) => clean(v, max).replace(/\D/g, '')

const GENERIC_ERROR = 'Arrori : u missaghju ùn hè micca partutu. Ritentate più tardi.'

type Fields = { artiste: string; album: string; titre: string; annee: string; numero: string; paroles: string }

function readFields(body: any): Fields {
  return {
    artiste: oneLine(clean(body.artiste, 120)),
    album: oneLine(clean(body.album, 120)),
    titre: oneLine(clean(body.titre, 150)),
    annee: digits(body.annee, 4),
    numero: digits(body.numero, 3),
    paroles: clean(body.paroles, 20000),
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Dumanda incorretta.' }, { status: 400 })
  }

  // Piège à robots : le champ « website » est invisible, seul un robot le remplit.
  // On répond « ok » sans rien envoyer pour ne rien lui apprendre.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const isCorrection = body.type === 'correction'
  const f = readFields(body)

  if (isCorrection) {
    if (!f.artiste || !f.titre) {
      return NextResponse.json({ error: "L'artistu è u titulu sò ubligatorii." }, { status: 400 })
    }
  } else if (!f.artiste || !f.titre || !f.paroles) {
    return NextResponse.json({ error: "Cumplettate l'artistu, u titulu è i paroddi." }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'inconnue'
  if (tooMany(ip)) {
    return NextResponse.json({ error: 'Troppu prupposte in pocu tempu. Ritentate più tardi.' }, { status: 429 })
  }

  const url = process.env.SHEET_PUSH_URL
  const secret = process.env.SHEET_PUSH_SECRET
  if (!url || !secret) {
    return NextResponse.json({ error: "U serviziu d'invià ùn hè micca cunfiguratu." }, { status: 500 })
  }

  let subject: string
  let message: string

  if (!isCorrection) {
    subject = `Vogliu Cantà – nouvelle proposition : ${f.artiste} – ${f.titre}`
    message = [
      "Nouvelle proposition de paroles reçue depuis l'application Vogliu Cantà.",
      '',
      `Artiste : ${f.artiste}`,
      `Album : ${f.album || '(non précisé)'}`,
      `Année : ${f.annee || '(non précisée)'}`,
      `N° : ${f.numero || '(non précisé)'}`,
      `Titre : ${f.titre}`,
      '',
      '----- Paroles -----',
      f.paroles,
    ].join('\n')
  } else {
    // On relit la chanson dans la base plutôt que de croire ce que le navigateur
    // envoie comme « version actuelle » : le mail compare ainsi avec la vraie.
    const id = Number(body.id)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Canzona micca trovata.' }, { status: 400 })
    }
    const { data: song } = await supabase
      .from('chansons')
      .select('id, artiste, album, titre, annee, numero, paroles')
      .eq('id', id)
      .single()
    if (!song) {
      return NextResponse.json({ error: 'Canzona micca trovata.' }, { status: 400 })
    }

    const before: Fields = {
      artiste: oneLine(song.artiste ?? ''),
      album: oneLine(song.album ?? ''),
      titre: oneLine(song.titre ?? ''),
      annee: song.annee != null ? String(song.annee) : '',
      numero: song.numero != null ? String(song.numero) : '',
      paroles: (song.paroles ?? '').replace(/\r\n/g, '\n').trim(),
    }

    const labels: Record<keyof Fields, string> = {
      artiste: 'Artiste', album: 'Album', titre: 'Titre', annee: 'Année', numero: 'N°', paroles: 'Paroles',
    }
    const changed = (Object.keys(labels) as (keyof Fields)[]).filter(k => f[k] !== before[k])
    if (changed.length === 0) {
      return NextResponse.json({ error: 'Nisun scambiamentu da mandà.' }, { status: 400 })
    }

    const lines = changed
      .filter(k => k !== 'paroles')
      .map(k => `- ${labels[k]} : « ${before[k] || '(vide)'} » → « ${f[k] || '(vide)'} »`)
    if (changed.includes('paroles')) lines.push('- Paroles : modifiées (voir plus bas)')

    subject = `Vogliu Cantà – correction proposée : ${before.artiste} – ${before.titre} (n°${id})`
    message = [
      "Correction proposée depuis l'application Vogliu Cantà.",
      '',
      `Chanson : ${before.artiste} – ${before.titre} (id ${id})`,
      '',
      'Modifications proposées :',
      ...lines,
      ...(changed.includes('paroles')
        ? ['', '----- Paroles proposées -----', f.paroles || '(vide)', '', '----- Paroles actuelles -----', before.paroles || '(vide)']
        : []),
    ].join('\n')
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suggestion', subject, message, secret }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    const text = await r.text()
    // Le script doit répondre {"ok":true,"mailed":true}. Sinon (script pas encore
    // mis à jour, secret erroné…), on ne prétend pas que le mail est parti.
    if (!r.ok || !text.includes('"mailed":true')) {
      console.error('suggest: réponse inattendue du script', r.status, text.slice(0, 200))
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('suggest error:', e)
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 502 })
  }
}