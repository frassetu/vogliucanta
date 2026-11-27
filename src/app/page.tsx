'use client'

import { useState, useEffect } from 'react'
import HomeTab from '@/components/HomeTab'
import SearchTab from '@/components/SearchTab'
import ArtistTab from '@/components/ArtistTab'
import FavoritesTab from '@/components/FavoritesTab'
import ProfileTab from '@/components/ProfileTab'
import SongDetail from '@/components/SongDetail'
import BottomNav from '@/components/BottomNav'
import AdminPanel from '@/components/AdminPanel'
import Top100Tab from '@/components/Top100Tab'
import { getAllSongs } from '@/lib/songs'
import TopBar from '@/components/TopBar'
import Splash from '@/components/Splash'
import { Song, supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import LoginHint from '@/components/LoginHint'
import ResetPasswordModal from '@/components/ResetPasswordModal'

export type Tab = 'home' | 'search' | 'artists' | 'top100' | 'favorites' | 'profile'

export type SearchState = {
  query: string
  view: 'artists' | 'albums' | 'songs'
  selectedArtist: string | null
  selectedAlbum: string | null
}

export type ArtistState = {
  view: 'list' | 'albums' | 'songs'
  selectedArtist: string | null
  selectedAlbum: string | null
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [songHistory, setSongHistory] = useState<Song[]>([])
  const [highlightQuery, setHighlightQuery] = useState('')
  const [favorites, setFavorites] = useState<number[]>([])
  const { user, loading: authLoading, recovery, clearRecovery } = useAuth()
  const [showLoginHint, setShowLoginHint] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [searchState, setSearchState] = useState<SearchState>({
    query: '',
    view: 'artists',
    selectedArtist: null,
    selectedAlbum: null,
  })
  const [artistState, setArtistState] = useState<ArtistState>({
    view: 'list',
    selectedArtist: null,
    selectedAlbum: null,
  })

  useEffect(() => {
    const saved = localStorage.getItem('vogliucanta_favorites')
    if (saved) setFavorites(JSON.parse(saved))
  }, [])

  // Session admin : on demande au serveur si le cookie est encore valide
  // (elle survit à la fermeture de l'appli, contrairement à sessionStorage).
  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { admin: false }))
      .then(d => setIsAdmin(!!d.admin))
      .catch(() => {})
  }, [])

  // Lien partagé via « Spartà » : /?c=123 ouvre directement la chanson 123.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('c'))
    if (!Number.isInteger(id) || id <= 0) return
    window.history.replaceState(null, '', window.location.pathname)
    getAllSongs().then(all => {
      const song = all.find(s => s.id === id)
      if (song) {
        setSelectedSong(song)
        setSongHistory([song])
      }
    })
  }, [])

  useEffect(() => {
    if (selectedSong) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [selectedSong])

  // Favoris : toujours gardés sur l'appareil ; si le visiteur est connecté, ils
  // sont aussi enregistrés dans son compte (table « favoris »).
  const syncFavorite = async (userId: string, songId: number, adding: boolean) => {
    const { error } = adding
      ? await supabase.from('favoris').upsert({ user_id: userId, song_id: songId }, { onConflict: 'user_id,song_id', ignoreDuplicates: true })
      : await supabase.from('favoris').delete().eq('user_id', userId).eq('song_id', songId)
    if (error) console.error('favoris:', error.message)
  }

  const toggleFavorite = (id: number) => {
    const adding = !favorites.includes(id)
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
      localStorage.setItem('vogliucanta_favorites', JSON.stringify(next))
      return next
    })
    if (isAdmin) {
      // Administrateur : favoris enregistrés côté serveur, sans compte visiteur.
      fetch(adding ? '/api/admin/favorites' : `/api/admin/favorites?song_id=${id}`, {
        method: adding ? 'POST' : 'DELETE',
        ...(adding ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ song_id: id }) } : {}),
      }).catch(() => {})
    } else if (user) {
      syncFavorite(user.id, id, adding)
    } else if (adding && !authLoading && !localStorage.getItem('vogliucanta_login_hint')) {
      setShowLoginHint(true) // une seule fois : voir dismissLoginHint
    }
  }

  const dismissLoginHint = () => {
    localStorage.setItem('vogliucanta_login_hint', '1')
    setShowLoginHint(false)
  }

  // À la connexion : on fusionne les favoris de l'appareil et ceux du compte.
  useEffect(() => {
    if (!user || isAdmin) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('favoris').select('song_id')
      if (error || cancelled) return
      const remote = (data ?? []).map(r => Number(r.song_id))
      let local: number[] = []
      try { local = JSON.parse(localStorage.getItem('vogliucanta_favorites') || '[]') } catch {}
      const merged = Array.from(new Set([...remote, ...local]))
      setFavorites(merged)
      localStorage.setItem('vogliucanta_favorites', JSON.stringify(merged))
      const missing = merged.filter(id => !remote.includes(id))
      if (missing.length > 0) {
        const { error: upErr } = await supabase
          .from('favoris')
          .upsert(missing.map(song_id => ({ user_id: user.id, song_id })), { onConflict: 'user_id,song_id', ignoreDuplicates: true })
        if (upErr) console.error('favoris:', upErr.message)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, isAdmin])

  // Administrateur : à la connexion (ou au retour dans l'appli), on fusionne les favoris
  // de l'appareil et ceux du serveur.
  useEffect(() => {
    if (!isAdmin) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/admin/favorites', { cache: 'no-store' })
        if (!r.ok || cancelled) return
        const remote: number[] = await r.json()
        let local: number[] = []
        try { local = JSON.parse(localStorage.getItem('vogliucanta_favorites') || '[]') } catch {}
        const merged = Array.from(new Set([...remote, ...local]))
        setFavorites(merged)
        localStorage.setItem('vogliucanta_favorites', JSON.stringify(merged))
        const missing = merged.filter(id => !remote.includes(id))
        if (missing.length > 0) {
          await fetch('/api/admin/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ song_ids: missing }),
          })
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [isAdmin])

  // À la déconnexion, on vide les favoris de l'appareil : ils appartiennent au
  // compte et se retrouveront à la prochaine connexion.
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setFavorites([])
    localStorage.removeItem('vogliucanta_favorites')
  }

  const handleSelectSong = (song: Song, playlist?: Song[], highlightQuery?: string) => {
    setSelectedSong(song)
    if (playlist) setSongHistory(playlist)
    setHighlightQuery(highlightQuery || '')
  }

  const handlePrevSong = () => {
    if (!selectedSong || songHistory.length === 0) return
    const idx = songHistory.findIndex(s => s.id === selectedSong.id)
    if (idx > 0) setSelectedSong(songHistory[idx - 1])
  }

  const handleNextSong = () => {
    if (!selectedSong || songHistory.length === 0) return
    const idx = songHistory.findIndex(s => s.id === selectedSong.id)
    if (idx < songHistory.length - 1) setSelectedSong(songHistory[idx + 1])
  }

  // Depuis la page paroles : aller voir tous les albums de cet artiste.
  const handleGoToArtist = (artiste: string) => {
    setArtistState({ view: 'albums', selectedArtist: artiste, selectedAlbum: null })
    setActiveTab('artists')
    setSelectedSong(null)
    setHighlightQuery('')
  }

  // Depuis la page paroles : aller voir toutes les chansons de cet album.
  const handleGoToAlbum = (artiste: string, album: string | null) => {
    setArtistState({ view: 'songs', selectedArtist: artiste, selectedAlbum: album })
    setActiveTab('artists')
    setSelectedSong(null)
    setHighlightQuery('')
  }

  const selectedIdx = selectedSong ? songHistory.findIndex(s => s.id === selectedSong.id) : -1

  const handleChangeTab = (tab: Tab) => {
    setShowAdmin(false)
    setActiveTab(tab)
  }

  const pageTitles: Record<Tab, string | undefined> = {
    home: undefined,
    search: undefined,
    artists: 'Artisti',
    top100: 'Top 100',
    favorites: 'I me favuriti',
    profile: 'Prufilu',
  }

  return (
    <>
      {showSplash && <Splash onFinish={() => setShowSplash(false)} />}

      {/* Les deux "modes" (appli normale / admin) restent montés en
          permanence, on bascule juste leur visibilité en CSS — sinon
          fermer puis rouvrir l'admin (ou changer d'onglet) faisait tout
          redémarrer à zéro (onglet admin, position de recherche, etc.). */}
      <div className={showAdmin ? 'hidden' : ''}>
        <TopBar title={pageTitles[activeTab]} />
        <div className="flex flex-col min-h-screen bg-bg">
          <div className="flex-1 pt-[60px] pb-20">
            <div className={activeTab === 'home' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <HomeTab
                favorites={favorites}
                onSelectSong={handleSelectSong}
                onToggleFavorite={toggleFavorite}
                onGoToSearch={() => setActiveTab('search')}
              />
            </div>
            <div className={activeTab === 'search' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <SearchTab
                favorites={favorites}
                onSelectSong={handleSelectSong}
                onToggleFavorite={toggleFavorite}
                searchState={searchState}
                onSearchStateChange={setSearchState}
                active={activeTab === 'search' && !showAdmin}
              />
            </div>
            <div className={activeTab === 'artists' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <ArtistTab
                favorites={favorites}
                onSelectSong={handleSelectSong}
                onToggleFavorite={toggleFavorite}
                artistState={artistState}
                onArtistStateChange={setArtistState}
              />
            </div>
            <div className={activeTab === 'top100' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <Top100Tab
                favorites={favorites}
                onSelectSong={handleSelectSong}
                onToggleFavorite={toggleFavorite}
              />
            </div>
            <div className={activeTab === 'favorites' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <FavoritesTab
                favorites={favorites}
                onSelectSong={handleSelectSong}
                onToggleFavorite={toggleFavorite}
              />
            </div>
            <div className={activeTab === 'profile' ? 'h-[calc(100vh-140px)]' : 'hidden'}>
              <ProfileTab
                isAdmin={isAdmin}
                onOpenAdmin={() => setShowAdmin(true)}
                user={user}
                authLoading={authLoading}
                onSignOut={handleSignOut}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={showAdmin ? '' : 'hidden'}>
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          isAdmin={isAdmin}
          onLogin={() => {
            setIsAdmin(true)
          }}
          onLogout={() => {
            setIsAdmin(false)
            // Comme pour un visiteur : les favoris appartiennent à l'admin, on les retire de l'appareil.
            setFavorites([])
            localStorage.removeItem('vogliucanta_favorites')
          }}
        />
      </div>

      {/* Toujours affiché, y compris en admin — un appui referme l'admin et
          bascule directement sur l'onglet choisi. */}
      <BottomNav activeTab={activeTab} onChangeTab={handleChangeTab} />

      {/* Vue paroles affichée en surimpression : les onglets restent montés
          en dessous, ce qui préserve l'état de navigation (recherche, artiste,
          album…) quand on revient en arrière depuis les paroles. */}
      {selectedSong && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-bg">
          <SongDetail
            song={selectedSong}
            isFavorite={favorites.includes(selectedSong.id)}
            onToggleFavorite={() => toggleFavorite(selectedSong.id)}
            onBack={() => { setSelectedSong(null); setHighlightQuery('') }}
            isAdmin={isAdmin}
            hasPrev={selectedIdx > 0}
            hasNext={selectedIdx >= 0 && selectedIdx < songHistory.length - 1}
            onPrev={handlePrevSong}
            onNext={handleNextSong}
            highlightQuery={highlightQuery}
            onGoToArtist={handleGoToArtist}
            onGoToAlbum={handleGoToAlbum}
          />
        </div>
      )}

      {showLoginHint && (
        <LoginHint
          onLogin={() => {
            dismissLoginHint()
            setSelectedSong(null)
            handleChangeTab('profile')
          }}
          onLater={dismissLoginHint}
        />
      )}

      {recovery && <ResetPasswordModal onClose={clearRecovery} />}
    </>
  )
}
