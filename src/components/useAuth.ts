'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// Capturé dès le chargement du module, AVANT que Supabase ne nettoie l'adresse :
// un lien « mot de passe oublié » arrive avec "#…&type=recovery" dans l'URL.
const RECOVERY_IN_URL = typeof window !== 'undefined' && window.location.hash.includes('type=recovery')

// Drapeau partagé : quand le visiteur réinitialise son mot de passe avec un CODE
// saisi dans l'appli, Supabase émet quand même l'événement « PASSWORD_RECOVERY ».
// On le met à true pendant cette opération pour ne pas ouvrir en plus la fenêtre
// « Nova parodda sicreta » prévue pour le lien du mail.
export const authFlags = { inAppRecovery: false }

// État de connexion du visiteur (compte Supabase). Sans rapport avec l'accès
// administrateur, qui reste un système séparé.
export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (RECOVERY_IN_URL) setRecovery(true)

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Ici on se contente de mettre à jour l'état (pas d'appel Supabase dans ce rappel).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY' && !authFlags.inAppRecovery) setRecovery(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { user, loading, recovery, clearRecovery: () => setRecovery(false) }
}
