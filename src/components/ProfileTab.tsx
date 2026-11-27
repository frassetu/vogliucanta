'use client'

import { useRef, useState } from 'react'
import { ShieldCheck, Info, ChevronDown } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import SuggestionForm from './SuggestionForm'
import AuthCard from './AuthCard'

interface Props {
  isAdmin: boolean
  onOpenAdmin: () => void
  user: User | null
  authLoading: boolean
  onSignOut: () => void
}

// Nombre de taps sur "Version" nécessaires pour révéler l'accès admin,
// et délai max entre deux taps avant que le compteur ne se réinitialise.
const TAPS_REQUIRED = 5
const TAP_RESET_MS = 3000

export default function ProfileTab({ isAdmin, onOpenAdmin, user, authLoading, onSignOut }: Props) {
  const [revealed, setRevealed] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const tapCount = useRef(0)
  const tapTimer = useRef<NodeJS.Timeout>()

  const handleVersionTap = () => {
    tapCount.current += 1
    clearTimeout(tapTimer.current)
    if (tapCount.current >= TAPS_REQUIRED) {
      setRevealed(true)
      tapCount.current = 0
      return
    }
    tapTimer.current = setTimeout(() => { tapCount.current = 0 }, TAP_RESET_MS)
  }

  const showAdminEntry = isAdmin || revealed

  return (
    <div className="px-4 pt-4 pb-28 max-w-lg mx-auto">
      <div className="space-y-3">
        {/* En administrateur, pas de compte visiteur : les favoris sont enregistrés côté serveur. */}
        {!isAdmin && <AuthCard user={user} loading={authLoading} onSignOut={onSignOut} />}

        {showAdminEntry && (
          <button
            onClick={onOpenAdmin}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-accent transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-text">Spaziu amministratori</p>
              <p className="text-text-muted text-sm">
                {isAdmin ? "Cunnessu cum'è amministratori" : 'Accessu risirvatu'}
              </p>
            </div>
            {isAdmin && (
              <span className="text-xs bg-accent/10 text-accent px-2 py-1 rounded-full font-medium">
                Amministratori
              </span>
            )}
          </button>
        )}

        <SuggestionForm />

        {/* À prupositu : le texte se déplie, mais la ligne « Versioni » reste
            toujours visible et cliquable (5 taps = accès admin). */}
        <div className="rounded-2xl bg-card border border-border">
          <button
            type="button"
            onClick={() => setAboutOpen(o => !o)}
            aria-expanded={aboutOpen}
            className="w-full flex items-center gap-3 p-4 text-left"
          >
            <Info className="w-5 h-5 text-text-muted flex-shrink-0" />
            <p className="flex-1 font-display font-semibold text-text">À prupositu</p>
            <ChevronDown className={`w-5 h-5 text-text-muted flex-shrink-0 transition-transform ${aboutOpen ? 'rotate-180' : ''}`} />
          </button>
          {aboutOpen && (
            <p className="px-4 pb-2 text-text-muted text-sm leading-relaxed">
              Vogliu Cantà hè una appiicazioni di paroddi di i canzoni corsi.
              Ogni visitori pò fighjulà è metta in favuritu i so canzoni favuriti.
            </p>
          )}
          <p
            onClick={handleVersionTap}
            className="px-4 pt-1 pb-4 text-muted text-xs select-none"
          >
            Versioni {process.env.NEXT_PUBLIC_BUILD_SHA} · {process.env.NEXT_PUBLIC_BUILD_DATE}
          </p>
        </div>
      </div>
    </div>
  )
}
