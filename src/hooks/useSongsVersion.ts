'use client'

import { useSyncExternalStore } from 'react'
import { subscribeSongs, getSongsVersion } from '@/lib/songs'

// Renvoie un numéro qui change à chaque modification du catalogue par l'admin.
// À mettre dans les dépendances d'un useEffect pour recharger les chansons.
export function useSongsVersion(): number {
  return useSyncExternalStore(subscribeSongs, getSongsVersion, () => 0)
}
