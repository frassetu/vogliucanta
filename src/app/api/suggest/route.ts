import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Reçoit une proposition de paroles depuis l'appli et la fait envoyer par mail
// via le script Google (le même que pour la synchro du Sheet : il envoie le
// mail depuis le compte propriétaire, vers sa propre boîte).

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

  const artiste = oneLine(clean(body.artiste, 120))
  const album = oneLine(clean(body.album, 120))
  const titre = oneLine(clean(body.titre, 150))
  const paroles = clean(body.paroles, 20000)
  const annee = clean(body.annee, 4).replace(/\D/g, '')
  const numero = clean(body.numero, 3).replace(/\D/g, '')

  if (!artiste || !titre || !paroles) {
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

  const subject = `Vogliu Cantà – nouvelle proposition : ${artiste} – ${titre}`
  const message = [
    "Nouvelle proposition de paroles reçue depuis l'application Vogliu Cantà.",
    '',
    `Artiste : ${artiste}`,
    `Album : ${album || '(non précisé)'}`,
    `Année : ${annee || '(non précisée)'}`,
    `N° : ${numero || '(non précisé)'}`,
    `Titre : ${titre}`,
    '',
    '----- Paroles -----',
    paroles,
  ].join('\n')

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
      return NextResponse.json({ error: 'Arrori : u missaghju ùn hè micca partutu. Ritentate più tardi.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('suggest error:', e)
    return NextResponse.json({ error: 'Arrori : u missaghju ùn hè micca partutu. Ritentate più tardi.' }, { status: 502 })
  }
}
