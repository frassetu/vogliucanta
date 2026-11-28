import { supabase, Song } from './supabase'

// Cache mémoire partagé : la table complète n'est téléchargée qu'UNE fois,
// puis réutilisée quand on change d'onglet (avant : chaque onglet refaisait
// un select('*') sur toutes les chansons, paroles comprises).
let cache: Promise<Song[]> | null = null

// « Empreinte » légère du catalogue (nombre de chansons + dernière date de paroles/ajout) :
// trois toutes petites requêtes, pour savoir s'il y a du nouveau sans retélécharger toutes les paroles.
async function fetchSignature(): Promise<string | null> {
  try {
    const [count, lyrics, created] = await Promise.all([
      supabase.from('chansons').select('id', { count: 'exact', head: true }),
      supabase.from('chansons').select('paroles_updated_at').not('paroles_updated_at', 'is', null)
        .order('paroles_updated_at', { ascending: false }).limit(1),
      supabase.from('chansons').select('created_at').order('created_at', { ascending: false }).limit(1),
    ])
    if (count.error || lyrics.error || created.error) return null
    return `${count.count}|${lyrics.data?.[0]?.paroles_updated_at ?? ''}|${created.data?.[0]?.created_at ?? ''}`
  } catch {
    return null
  }
}

let knownSignature: string | null = null

async function fetchAllSongs(): Promise<Song[]> {
  // Empreinte prise AVANT le téléchargement : si quelque chose change pendant, on le verra au contrôle suivant.
  fetchSignature().then(sig => { if (sig) knownSignature = sig })
  let all: Song[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('chansons')
      .select('*')
      .range(from, from + pageSize - 1)
      .order('artiste')
    if (error || !data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

export function getAllSongs(): Promise<Song[]> {
  if (!cache) cache = fetchAllSongs()
  return cache
}

// Compteur de « version » du catalogue : les onglets s'y abonnent pour se recharger
// tout seuls après une modification (ajout/édition/suppression/import de paroles).
let version = 0
const listeners = new Set<() => void>()
let notifyTimer: ReturnType<typeof setTimeout> | null = null

export function subscribeSongs(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
export function getSongsVersion(): number {
  return version
}

// À appeler après une modification admin : vide le cache ET prévient les onglets.
// La notification est regroupée (une seule après une rafale de modifications, ex. un import).
export function invalidateSongs(): void {
  cache = null
  if (notifyTimer) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => {
    version++
    listeners.forEach(l => l())
  }, 400)
}


// Rafraîchissement automatique quand l'appli est déjà ouverte : au retour au premier plan,
// puis toutes les 5 minutes tant qu'elle est visible, on compare l'empreinte du catalogue.
// Seulement si elle a changé (nouvelles paroles, ajout, suppression), les onglets se rechargent.
let lastCheck = 0
async function checkForChanges(minGapMs: number): Promise<void> {
  if (!cache || !knownSignature) return
  const now = Date.now()
  if (now - lastCheck < minGapMs) return
  lastCheck = now
  const sig = await fetchSignature()
  if (sig && knownSignature && sig !== knownSignature) invalidateSongs()
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForChanges(60_000)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') checkForChanges(4 * 60_000)
  }, 5 * 60_000)
}
