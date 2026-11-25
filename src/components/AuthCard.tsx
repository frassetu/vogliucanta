'use client'

import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { UserRound, Eye, EyeOff, Loader, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  user: User | null
  loading: boolean
  onSignOut: () => void
}

type Mode = 'login' | 'signup' | 'forgot'

const MIN_PASSWORD = 8

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-bg border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent transition-colors'

// Traduit les erreurs de Supabase en messages simples.
function messageFor(error: { message?: string; code?: string; status?: number }): string {
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Mail o parodda sicreta falza.'
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'Cunfirmate prima a vostra mail (verificate a vostra casella).'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429 || msg.includes('rate limit'))
    return 'Troppu tentativi. Ripruveti più tardi.'
  if (code === 'weak_password') return 'Parodda sicreta troppu debule.'
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Un contu esiste digià cù sta mail.'
  return 'Arrori. Ripruveti più tardi.'
}

export default function AuthCard({ user, loading, onSignOut }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const switchMode = (m: Mode) => {
    setMode(m)
    setError('')
    setInfo('')
  }

  const submit = async () => {
    if (busy) return
    setError('')
    setInfo('')
    const mail = email.trim()
    if (!mail) return
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      setError(`A parodda sicreta deve avè almenu ${MIN_PASSWORD} caratteri.`)
      return
    }
    if (mode !== 'forgot' && !password) return

    setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password })
        if (error) setError(messageFor(error as any))
        else setPassword('')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) {
          setError(messageFor(error as any))
        } else if (data.session) {
          setPassword('') // confirmation par mail désactivée : déjà connecté
        } else {
          // Message volontairement identique que l'adresse soit nouvelle ou non,
          // pour ne pas révéler qui a déjà un compte.
          setInfo("Mail mandatu. Verificate a vostra casella (è i spam) è seguitate u ligame, poi cunnettetevi quì.")
          setPassword('')
          setMode('login')
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: window.location.origin })
        if (error) setError(messageFor(error as any))
        else {
          setInfo("S'ellu esiste un contu cù sta mail, un ligame vi hè statu mandatu per sceglie una nova parodda sicreta.")
          setMode('login')
        }
      }
    } catch {
      setError('Arrori di cunnissioni. Ripruveti più tardi.')
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
            <p className="font-display font-semibold text-text">U mo contu</p>
            <p className="text-text-muted text-sm truncate">{user.email}</p>
          </div>
        </div>
        <p className="text-text-muted text-sm leading-relaxed mt-3">
          I vostri favuriti sò salvati in u vostru contu.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-bg border border-border text-text-muted text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          Scunnettà si
        </button>
      </div>
    )
  }

  // ---- Pas connecté ----
  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-4 mb-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
          <UserRound className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-text">U mo contu</p>
          <p className="text-text-muted text-sm leading-relaxed">
            Ùn hè ubligatoriu. Cù un contu, i vostri favuriti si ritrovanu nantu à tutti i vostri apparechji.
          </p>
        </div>
      </div>

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
              {m === 'login' ? 'Cunnettà si' : 'Creà un contu'}
            </button>
          ))}
        </div>
      )}

      {mode === 'forgot' && (
        <p className="text-text-muted text-sm leading-relaxed mb-3">
          Mittite a vostra mail : vi mandemu un ligame per sceglie una nova parodda sicreta.
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
          placeholder="A vostra mail"
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
            <button type="button" onClick={() => setShowPwd(s => !s)} aria-label="Fà vede o piattà a parodda sicreta">
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
          {mode === 'login' ? 'Cunnettà si' : mode === 'signup' ? 'Creà u contu' : 'Mandà'}
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
    </div>
  )
}
