'use client'

import { useEffect, useState } from 'react'
import { supabase, Song } from '@/lib/supabase'
import SongCard from './SongCard'
import { useSongsVersion } from '@/hooks/useSongsVersion'

interface Props {
  favorites: number[]
  onSelectSong: (s: Song, playlist?: Song[]) => void
  onToggleFavorite: (id: number) => void
  onGoToSearch: () => void
}

export default function HomeTab({ favorites, onSelectSong, onToggleFavorite, onGoToSearch }: Props) {
  const [recent, setRecent] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const songsVersion = useSongsVersion()

  useEffect(() => {
    const load = async () => {
      // Premier chargement seulement : les rechargements suivants se font en silence.
      const { data: recData } = await supabase
        .from('chansons')
        .select('*')
        .not('paroles', 'is', null)
        .neq('paroles', '')
        .order('paroles_updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(20)
      if (recData) setRecent(recData as Song[])
      setLoading(false)
    }
    load()
  }, [songsVersion])

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="px-4 pb-4 max-w-lg mx-auto">
      {/* Barre de recherche figée sous le bandeau : elle reste en place quand on fait défiler les récents.
          Un appui ouvre directement la recherche avec le clavier. */}
      <div className="sticky top-[60px] z-30 bg-bg -mx-4 px-4 pt-2 pb-4">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-card border border-border text-text-muted text-sm text-left"
          onClick={onGoToSearch}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Ricercà un artista, un titulu, una parola…
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-card pulse" />)}
        </div>
      ) : (
        <section>
          <p className="text-xs text-muted mb-3">
            Paroddi novi{recent[0] ? ` · aghjurnatu u ${formatDate(recent[0].paroles_updated_at || recent[0].created_at)}` : ''}
          </p>
          <div className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-text-muted text-sm py-4 text-center">Nisuna canzona</p>
            ) : (
              recent.map(song => (
                <SongCard
                  key={song.id}
                  song={song}
                  isFavorite={favorites.includes(song.id)}
                  onSelect={() => onSelectSong(song, recent)}
                  onToggleFavorite={() => onToggleFavorite(song.id)}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}
