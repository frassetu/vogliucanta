'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const MIN_PASSWORD = 8

// Affichée quand le visiteur arrive depuis le lien « parodda sicreta scurdata » du mail.
export default function ResetPasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const save = async () => {
    if (busy) return
    if (password.length < MIN_PASSWORD) {
      setError(`A parodda sicreta deve avè almenu ${MIN_PASSWORD} caratteri.`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) {
        setError('Arrori. Ripruveti più tardi (u ligame hà forse spiratu).')
      } else {
        setDone(true)
        setTimeout(onClose, 1800)
      }
    } catch {
      setError('Arrori di cunnissioni. Ripruveti più tardi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[80] flex items-end justify-center p-4">
      <div className="w-full max-w-lg bg-surface rounded-2xl p-5 space-y-4">
        {done ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">✅</p>
            <p className="font-display font-semibold text-text">Parodda sicreta cambiata !</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-text">Nova parodda sicreta</h3>
              <button onClick={onClose} className="text-muted text-sm">Annullà</button>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-card border border-border focus-within:border-accent transition-colors">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                placeholder="Nova parodda sicreta"
                className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-muted"
              />
              <button type="button" onClick={() => setShowPwd(s => !s)} aria-label="Fà vede o piattà a parodda sicreta">
                {showPwd ? <EyeOff className="w-4 h-4 text-muted" /> : <Eye className="w-4 h-4 text-muted" />}
              </button>
            </div>
            <p className="text-text-muted text-xs">Almenu {MIN_PASSWORD} caratteri.</p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={save}
              disabled={busy || !password}
              className="w-full py-3 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy && <Loader className="w-4 h-4 animate-spin" />}
              Arrigistrà
            </button>
          </>
        )}
      </div>
    </div>
  )
}
