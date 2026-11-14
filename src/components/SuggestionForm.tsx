'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, MessageSquarePlus, Loader, CheckCircle } from 'lucide-react'
import { Song } from '@/lib/supabase'
import { getAllSongs } from '@/lib/songs'
import { normalize } from '@/lib/format'

const emptyForm = { artiste: '', album: '', annee: '', numero: '', titre: '', paroles: '' }

type Status = 'idle' | 'sending' | 'sent' | 'error'

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-bg border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent transition-colors'

// Propositions qui s'affichent pendant la frappe : d'abord les noms qui
// COMMENCENT par ce qui est tapé, puis ceux qui le CONTIENNENT. Insensible
// aux accents, à la casse et aux apostrophes (comme la recherche de l'appli).
function suggest(list: string[], typed: string): string[] {
  const q = normalize(typed)
  if (!q) return []
  const starts: string[] = []
  const contains: string[] = []
  for (const item of list) {
    const n = normalize(item)
    if (n === q) continue // déjà tapé en entier : inutile de le reproposer
    if (n.startsWith(q)) starts.push(item)
    else if (n.includes(q)) contains.push(item)
  }
  return [...starts.sort(), ...contains.sort()].slice(0, 6)
}

export default function SuggestionForm() {
  const [open, setOpen] = useState(false)
  const [songs, setSongs] = useState<Song[]>([])
  const [form, setForm] = useState(emptyForm)
  const [honey, setHoney] = useState('') // piège à robots : un humain ne le voit pas
  const [showArtistSug, setShowArtistSug] = useState(false)
  const [showAlbumSug, setShowAlbumSug] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Les chansons ne sont chargées qu'à la première ouverture du bloc
  // (elles sont de toute façon déjà en cache si un autre onglet les a lues).
  useEffect(() => {
    if (open && songs.length === 0) getAllSongs().then(setSongs)
  }, [open, songs.length])

  const artists = useMemo(
    () => Array.from(new Set(songs.map(s => s.artiste).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [songs]
  )

  const typedArtist = normalize(form.artiste)
  const artistExists = !!typedArtist && artists.some(a => normalize(a) === typedArtist)

  // Dischetti proposés : ceux de l'artistu s'il existe déjà, sinon tous.
  const albums = useMemo(() => {
    const relevant = artistExists ? songs.filter(s => normalize(s.artiste) === typedArtist) : songs
    return Array.from(new Set(relevant.map(s => s.album).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b))
  }, [songs, artistExists, typedArtist])

  const artistSug = showArtistSug ? suggest(artists, form.artiste) : []
  const albumSug = showAlbumSug ? suggest(albums, form.album) : []

  const update = (patch: Partial<typeof emptyForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (status === 'sent' || status === 'error') setStatus('idle')
  }

  const pickAlbum = (album: string) => {
    const matches = songs.filter(s => s.album === album)
    const distinctArtists = Array.from(new Set(matches.map(s => s.artiste)))
    const withYear = matches.find(s => s.annee)
    setForm(f => ({
      ...f,
      album,
      artiste: !f.artiste.trim() && distinctArtists.length === 1 ? distinctArtists[0] : f.artiste,
      annee: !f.annee && withYear?.annee ? String(withYear.annee) : f.annee,
    }))
    setShowAlbumSug(false)
  }

  const canSend = !!form.artiste.trim() && !!form.titre.trim() && !!form.paroles.trim() && status !== 'sending'

  const send = async () => {
    if (!canSend) return
    setStatus('sending')
    setErrorMsg('')
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, website: honey }),
      })
      if (res.ok) {
        setStatus('sent')
        setForm(emptyForm)
      } else {
        const d = await res.json().catch(() => ({}))
        setErrorMsg(d.error || "Arrori : u missaghju ùn hè micca partutu. Ripruveti più tardi.")
        setStatus('error')
      }
    } catch {
      setErrorMsg('Arrori di cunnissioni. Ripruveti più tardi.')
      setStatus('error')
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <MessageSquarePlus className="w-5 h-5 text-text-muted flex-shrink-0" />
        <p className="flex-1 font-display font-semibold text-text">Mandà qualchi paroddi</p>
        <ChevronDown className={`w-5 h-5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-text-muted text-sm leading-relaxed">
            Ci mancanu i paroddi d'una canzona ? Mandetili quì, è i vidareti in l'appiicazioni dopu à a verificazioni.
          </p>

          {/* Artistu avec propositions au fil de la frappe */}
          <div className="relative">
            <label className="text-text-muted text-xs mb-1.5 block">Artistu *</label>
            <input
              type="text"
              value={form.artiste}
              maxLength={120}
              onChange={e => { update({ artiste: e.target.value }); setShowArtistSug(true) }}
              onFocus={() => setShowArtistSug(true)}
              onBlur={() => setTimeout(() => setShowArtistSug(false), 150)}
              placeholder="Nomi di l'artistu"
              className={inputClass}
            />
            {artistSug.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl overflow-hidden shadow-lg">
                {artistSug.map(a => (
                  <button
                    key={a}
                    type="button"
                    className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-border transition-colors"
                    onMouseDown={() => { update({ artiste: a }); setShowArtistSug(false) }}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            {artistExists && (
              <p className="text-xs mt-1.5 text-green-400">Artistu dighjà prisenti in l'appiicazioni</p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="w-24 flex-shrink-0">
              <label className="text-text-muted text-xs mb-1.5 block">Annata</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.annee}
                onChange={e => update({ annee: e.target.value })}
                placeholder="2024"
                className="w-full px-3 py-3 rounded-xl bg-bg border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent transition-colors"
              />
            </div>
            <div className="flex-1 relative">
              <label className="text-text-muted text-xs mb-1.5 block">Dischettu</label>
              <input
                type="text"
                value={form.album}
                maxLength={120}
                onChange={e => { update({ album: e.target.value }); setShowAlbumSug(true) }}
                onFocus={() => setShowAlbumSug(true)}
                onBlur={() => setTimeout(() => setShowAlbumSug(false), 150)}
                placeholder="Nomi di u dischettu"
                className={inputClass}
              />
              {albumSug.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl overflow-hidden shadow-lg">
                  {albumSug.map(a => (
                    <button
                      key={a}
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm text-text hover:bg-border transition-colors"
                      onMouseDown={() => pickAlbum(a)}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-20 flex-shrink-0">
              <label className="text-text-muted text-xs mb-1.5 block">Nº</label>
              <input
                type="number"
                inputMode="numeric"
                value={form.numero}
                onChange={e => update({ numero: e.target.value })}
                placeholder="1"
                className="w-full px-3 py-3 rounded-xl bg-bg border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="text-text-muted text-xs mb-1.5 block">Titulu *</label>
              <input
                type="text"
                value={form.titre}
                maxLength={150}
                onChange={e => update({ titre: e.target.value })}
                placeholder="Titulu di a canzona"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-text-muted text-xs mb-1.5 block">Paroddi *</label>
            <textarea
              value={form.paroles}
              maxLength={20000}
              onChange={e => update({ paroles: e.target.value })}
              placeholder="Mittiti i paroddi quì…"
              rows={8}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Piège à robots : champ invisible pour un humain */}
          <input
            type="text"
            name="website"
            value={honey}
            onChange={e => setHoney(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] w-px h-px opacity-0"
          />

          {status === 'error' && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-red-400 text-sm">{errorMsg}</p>
            </div>
          )}
          {status === 'sent' && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-sm">Grazia ! I paroddi sò stati mandati.</p>
            </div>
          )}

          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="w-full py-3.5 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {status === 'sending' && <Loader className="w-4 h-4 animate-spin" />}
            Mandà
          </button>
        </div>
      )}
    </div>
  )
}