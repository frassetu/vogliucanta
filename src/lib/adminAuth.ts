import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

export const ADMIN_COOKIE = 'vogliucanta_admin'
// Durée de la session admin : 30 jours (le cookie et le jeton expirent ensemble).
export const ADMIN_SESSION_SECONDS = 60 * 60 * 24 * 30

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.NEXT_PUBLIC_ADMIN_PASSWORD || ''
// Clé de signature : ADMIN_SESSION_SECRET si elle existe, sinon dérivée du mot de passe admin.
// (Changer le mot de passe invalide alors toutes les sessions en cours.)
const SECRET = process.env.ADMIN_SESSION_SECRET || ADMIN_PASSWORD

const sign = (payload: string) => createHmac('sha256', SECRET).update(payload).digest('base64url')

// Jeton = « date d'expiration . signature ». Il ne contient jamais le mot de passe :
// sans la clé, personne ne peut en fabriquer un valide.
export function createAdminToken() {
  const exp = String(Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS)
  return `${exp}.${sign(exp)}`
}

export function verifyAdminToken(token: string | undefined) {
  if (!SECRET || !token) return false
  const [exp, sig] = token.split('.')
  if (!exp || !sig) return false
  const expected = Buffer.from(sign(exp))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false
  return Number(exp) > Date.now() / 1000
}

export function checkAuth(req: NextRequest) {
  return verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value)
}
