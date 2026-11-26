'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { UserRound, Eye, EyeOff, Loader, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { authFlags } from '@/hooks/useAuth'

interface Props {
  user: User | null
  loading: boolean
  onSignOut: () => void
}

// login / signup / forgot : formulaires de départ
// verifySignup / verifyReset : saisie du code à 6 chiffres reçu par mail
type Mode = 'login' | 'signup' | 'forgot' | 'verifySignup' | 'verifyReset'

const MIN_PASSWORD = 8
const CODE_LENGTH = 6
const RESEND_SECONDS = 60 // Supabase n'autorise pas deux mails à moins d'une minute d'intervalle

const MSG_BAD_CODE = 'Codici falsu o spiratu.'
const MSG_SHORT_CODE = `U codici hà ${CODE_LENGTH} cifri.`
const MSG_RESENT = 'Novu codici mandatu.'
const MSG_CONNECTION = 'Arrori di cunnissioni. Ripruveti più tardi.'
const MSG_GENERIC = 'Arrori. Ripruveti più tardi.'
const MSG_PASSWORD_CHANGED = 'Parodda sicreta cambiata !'

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-bg border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent transition-colors'

type Err = { message?: string; code?: string; status?: number }

const isRateLimit = (e: Err) =>
  e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit' || e.status === 429 || (e.message || '').toLowerCase().includes('rate limit')

// Traduit les erreurs de Supabase en messages simples.
function messageFor(error: Err): string {
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Mail o parodda sicreta falza.'
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'Cunfirmeti prima u vosciu mail (verificheti a voscia scatula).'
  if (isRateLimit(error)) return 'Troppu tentativi. Ripruveti più tardi.'
  if (code === 'weak_password') return 'Parodda sicreta troppu debuli.'
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Un contu esista digià cù stu mail.'
  return MSG_GENERIC
}

// Erreur au moment de vérifier le code : code faux/périmé, sauf trop de tentatives.
const codeErrorFor = (error: Err) => (isRateLimit(error) ? messageFor(error) : MSG_BAD_CODE)

export default function AuthCard({ user, loading, onSignOut }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  // Message affiché une fois connecté (ex. après le changement de mot de passe)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Décompte avant de pouvoir demander un nouveau code
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setInfo('')
    setCode('')
    setCooldown(0)
  }

  const askForCode = (m: 'verifySignup' | 'verifyReset') => {
    setMode(m)
    setCode('')
    setCooldown(RESEND_SECONDS)
  }

  // ---- Formulaires de départ ----
  const submit = async () => {
    if (busy) return
    setError('')
    setInfo('')
    const mail = email.trim()
    if (!mail) return
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      setError(`A parodda sicreta devi avè almenu ${MIN_PASSWORD} caratteri.`)
      return
    }
    if (mode !== 'forgot' && !password) return

    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (error) setError(messageFor(error as Err))
        else setPassword('')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: mail, password })
        if (error) {
          setError(messageFor(error as Err))
        } else if (data.session) {
          setPassword('') // confirmation par mail désactivée : déjà connecté
        } else {
          setPassword('')
          askForCode('verifySignup')
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(mail)
        if (error) setError(messageFor(error as Err))
        else askForCode('verifyReset')
      }
    } catch {
      setError(MSG_CONNECTION)
    } finally {
      setBusy(false)
    }
  }

  // ---- Vérification du code ----
  const verify = async () => {
    if (busy) return
    setError('')
    setInfo('')
    const token = code.replace(/\D/g, '')
    if (token.length !== CODE_LENGTH) {
      setError(MSG_SHORT_CODE)
      return
    }
    if (mode === 'verifyReset' && password.length < MIN_PASSWORD) {
      setError(`A parodda sicreta devi avè almenu ${MIN_PASSWORD} caratteri.`)
      return
    }
    const mail = email.trim()

    setBusy(true)
    try {
      if (mode === 'verifySignup') {
        // Selon la version de Supabase, le code de confirmation se vérifie avec le type
        // « signup » ou « email » : on essaie l'un puis l'autre avant de dire que le code est faux.
        let { error } = await supabase.auth.verifyOtp({ email: mail, token, type: 'signup' })
        if (error && !isRateLimit(error as Err)) {
          const retry = await supabase.auth.verifyOtp({ email: mail, token, type: 'email' })
          error = retry.error
        }
        if (error) setError(codeErrorFor(error as Err))
        else switchMode('login') // la connexion s'affiche toute seule (état « connecté »)
      } else {
        authFlags.inAppRecovery = true // évite d'ouvrir en plus la fenêtre du lien du mail
        const { error } = await supabase.auth.verifyOtp({ email: mail, token, type: 'recovery' })
        if (error) {
          setError(codeErrorFor(error as Err))
        } else {
          // Le code est bon : le visiteur est connecté, il ne reste qu'à enregistrer le nouveau mot de passe.
          const { error: upErr } = await supabase.auth.updateUser({ password })
          setNotice(upErr ? { ok: false, text: messageFor(upErr as Err) } : { ok: true, text: MSG_PASSWORD_CHANGED })
          setPassword('')
          switchMode('login')
        }
      }
    } catch {
      setError(MSG_CONNECTION)
    } finally {
      authFlags.inAppRecovery = false
      setBusy(false)
    }
  }

  const resend = async () => {
    if (busy || cooldown > 0) return
    setError('')
    setInfo('')
    const mail = email.trim()
    setBusy(true)
    try {
      const { error } =
        mode === 'verifySignup'
          ? await supabase.auth.resend({ type: 'signup', email: mail })
          : await supabase.auth.resetPasswordForEmail(mail)
      if (error) {
        setError(messageFor(error as Err))
      } else {
        setInfo(MSG_RESENT)
        setCooldown(RESEND_SECONDS)
      }
    } catch {
      setError(MSG_CONNECTION)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  // ---- Connecté ----
  if (user) {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <UserRound className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-text">U me contu</p>
            <p className="text-text-muted text-sm truncate">{user.email}</p>
          </div>
        </div>
        {notice && (
          <div className={`mt-3 p-3 rounded-xl border ${notice.ok ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            <p className={`text-sm ${notice.ok ? 'text-green-400' : 'text-red-400'}`}>{notice.text}</p>
          </div>
        )}
        <p className="text-text-muted text-sm leading-relaxed mt-3">
          I voscii favuriti sò salvati in u vosciu contu.
        </p>
        <button
          type="button"
          onClick={() => { setNotice(null); onSignOut() }}
          className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg border border-border text-text-muted text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Scunnettà si
        </button>
      </div>
    )
  }

  const isVerify = mode === 'verifySignup' || mode === 'verifyReset'
  const mail = email.trim()

  // ---- Pas connecté ----
  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <UserRound className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-text">U me contu</p>
        </div>
      </div>

      {isVerify ? (
        /* ---------- Saisie du code reçu par mail ---------- */
        <div className="space-y-3">
          <p className="text-text-muted text-sm leading-relaxed">
            {mode === 'verifySignup'
              ? `Avemi mandatu un codici à ${CODE_LENGTH} cifri à ${mail}. Mittitilu quì pà cunfirmà u vosciu contu.`
              : `S'eddu esista un contu cù stu mail, avemi mandatu un codici à ${CODE_LENGTH} cifri à ${mail}. Mittitilu quì cù a voscia nova parodda sicreta.`}
          </p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && verify()}
            placeholder="123456"
            aria-label="Codici"
            className={`${inputClass} text-center text-lg tracking-[0.4em]`}
          />

          {mode === 'verifyReset' && (
            <>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-bg border border-border focus-within:border-accent transition-colors">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && verify()}
                  placeholder="Nova parodda sicreta"
                  className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-muted"
                />
                <button type="button" onClick={() => setShowPwd(s => !s)} aria-label="Fà veda o piattà a parodda sicreta">
                  {showPwd ? <EyeOff className="w-4 h-4 text-muted" /> : <Eye className="w-4 h-4 text-muted" />}
                </button>
              </div>
              <p className="text-text-muted text-xs">Almenu {MIN_PASSWORD} caratteri.</p>
            </>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {info && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
              <p className="text-green-400 text-sm">{info}</p>
            </div>
          )}

          <button
            type="button"
            onClick={verify}
            disabled={busy || code.length === 0 || (mode === 'verifyReset' && !password)}
            className="w-full py-3.5 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy && <Loader className="w-4 h-4 animate-spin" />}
            {mode === 'verifySignup' ? 'Cunfirmà' : 'Arrigistrà'}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={busy || cooldown > 0}
            className="w-full text-center text-text-muted text-sm disabled:opacity-50"
          >
            {cooldown > 0 ? `Mandà un altru codici (${cooldown} s)` : 'Mandà un altru codici'}
          </button>
          <button type="button" onClick={() => switchMode('login')} className="w-full text-center text-text-muted text-sm">
            Ritornu
          </button>
        </div>
      ) : (
        /* ---------- Formulaires de départ ---------- */
        <>
          {mode !== 'forgot' && (
            <div className="flex gap-2 mb-3">
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                    mode === m ? 'accent-gradient text-white' : 'bg-bg border border-border text-text-muted'
                  }`}
                >
                  {m === 'login' ? 'Cunnettà si' : 'Crià un contu'}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && (
            <p className="text-text-muted text-sm leading-relaxed mb-3">
              Mittiti u vosciu mail : vi mandemi un codici pà sceglia una nova parodda sicreta.
            </p>
          )}

          <div className="space-y-3">
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="U vosciu mail"
              className={inputClass}
            />

            {mode !== 'forgot' && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-bg border border-border focus-within:border-accent transition-colors">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder="Parodda sicreta"
                  className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-muted"
                />
                <button type="button" onClick={() => setShowPwd(s => !s)} aria-label="Fà veda o piattà a parodda sicreta">
                  {showPwd ? <EyeOff className="w-4 h-4 text-muted" /> : <Eye className="w-4 h-4 text-muted" />}
                </button>
              </div>
            )}

            {mode === 'signup' && (
              <p className="text-text-muted text-xs">Almenu {MIN_PASSWORD} caratteri.</p>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {info && (
              <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30">
                <p className="text-green-400 text-sm">{info}</p>
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={busy || !email.trim() || (mode !== 'forgot' && !password)}
              className="w-full py-3.5 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy && <Loader className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Cunnettà si' : mode === 'signup' ? 'Crià un contu' : 'Mandà'}
            </button>

            {mode === 'login' && (
              <button type="button" onClick={() => switchMode('forgot')} className="w-full text-center text-text-muted text-sm">
                Parodda sicreta scurdata ?
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('login')} className="w-full text-center text-text-muted text-sm">
                Ritornu
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
