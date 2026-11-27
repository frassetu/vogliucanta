'use client'

import { useState, useEffect, useRef, Fragment, type ReactNode } from 'react'
import { ChevronLeft, Heart, Music, Flag, Share2, Pencil, Trash2, Loader } from 'lucide-react'
import TopBar from './TopBar'
import { Song, trackView } from '@/lib/supabase'
import { findHighlightRanges } from '@/lib/format'


interface Props {
  song: Song
  isFavorite: boolean
  onToggleFavorite: () => void
  onBack: () => void
  isAdmin: boolean
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  highlightQuery?: string
  onGoToArtist?: (artiste: string) => void
  onGoToAlbum?: (artiste: string, album: string | null) => void
}

type ModalType = 'report' | 'edit' | null

// Champs du formulaire de modification (admin) et de correction (visiteurs).
const FIELDS = [
  { key: 'artiste', label: 'Artistu *', placeholder: 'Artistu' },
  { key: 'titre', label: 'Titulu *', placeholder: 'Titulu' },
  { key: 'album', label: 'Dischettu', placeholder: 'Dischettu' },
  { key: 'annee', label: 'Annata', placeholder: '2024' },
  { key: 'numero', label: 'Numeru di canzona', placeholder: '1' },
]

type SongForm = { artiste: string; album: string; titre: string; annee: string; numero: string; paroles: string }

function songToForm(song: Song): SongForm {
  return {
    artiste: song.artiste,
    album: song.album || '',
    titre: song.titre,
    annee: song.annee?.toString() || '',
    numero: song.numero?.toString() || '',
    paroles: song.paroles || '',
  }
}

// Découpe les paroles en conservant de vrais <br/> (copier/coller fiable),
// et surligne les passages correspondant à highlightQuery si présent (n'est
// fourni que quand la chanson vient d'un résultat "dans les paroles" de la
// recherche — jamais pour un match titre/artiste/album).
function renderParoles(text: string, highlightQuery?: string) {
  const ranges = highlightQuery ? findHighlightRanges(text, highlightQuery) : []
  const segments: { text: string; highlight: boolean }[] = []
  let pos = 0
  for (const [start, end] of ranges) {
    if (start > pos) segments.push({ text: text.slice(pos, start), highlight: false })
    segments.push({ text: text.slice(start, end), highlight: true })
    pos = end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), highlight: false })

  let key = 0
  const nodes: ReactNode[] = []
  segments.forEach(seg => {
    const lines = seg.text.split('\n')
    lines.forEach((line, i) => {
      if (line) {
        nodes.push(
          seg.highlight
            ? <mark key={key++} className="bg-accent/40 text-text rounded px-0.5">{line}</mark>
            : <Fragment key={key++}>{line}</Fragment>
        )
      }
      if (i < lines.length - 1) nodes.push(<br key={key++} />)
    })
  })
  return nodes
}

export default function SongDetail({ song, isFavorite, onToggleFavorite, onBack, isAdmin, hasPrev, hasNext, onPrev, onNext, highlightQuery, onGoToArtist, onGoToAlbum }: Props) {
  const [fontSize, setFontSize] = useState(16)
  const [modal, setModal] = useState<ModalType>(null)
  const [reportForm, setReportForm] = useState<SongForm>(() => songToForm(song))
  const [reportStatus, setReportStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [reportError, setReportError] = useState('')
  const [honey, setHoney] = useState('') // piège à robots (champ invisible)
  const [shareFeedback, setShareFeedback] = useState(false)
  const [currentSong, setCurrentSong] = useState(song)

  const [editForm, setEditForm] = useState({
    artiste: song.artiste,
    album: song.album || '',
    titre: song.titre,
    annee: song.annee?.toString() || '',
    numero: (song as any).numero?.toString() || '',
    paroles: song.paroles || '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const touchStart = useRef<{ x: number; y: number; edge: boolean } | null>(null)

  useEffect(() => {
    trackView(song.id)
    const saved = localStorage.getItem('lyrics_font_size')
    if (saved) setFontSize(parseInt(saved))
  }, [song.id])

  useEffect(() => {
    setCurrentSong(song)
    setEditForm({
      artiste: song.artiste,
      album: song.album || '',
      titre: song.titre,
      annee: song.annee?.toString() || '',
      numero: (song as any).numero?.toString() || '',
      paroles: song.paroles || '',
    })
  }, [song])

  const updateFontSize = (size: number) => {
    setFontSize(size)
    localStorage.setItem('lyrics_font_size', size.toString())
  }

  // Spartà : partage natif du téléphone (WhatsApp, SMS…) avec un lien qui ouvre
  // directement cette chanson ; sur ordinateur, le lien est copié.
  const handleShare = async () => {
    const url = `${window.location.origin}/?c=${song.id}`
    const title = `${song.titre} – ${song.artiste}`
    try {
      if (navigator.share) {
        await navigator.share({ title, text: `${title} · Vogliu Cantà`, url })
        return
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // l'utilisateur a fermé la fenêtre de partage
    }
    try {
      await navigator.clipboard.writeText(url)
      setShareFeedback(true)
      setTimeout(() => setShareFeedback(false), 2000)
    } catch {}
  }

  // Signalà : ouvre le formulaire prérempli avec la chanson telle qu'elle est.
  const openReport = () => {
    setReportForm(songToForm(song))
    setReportStatus('idle')
    setReportError('')
    setModal('report')
  }

  const original = songToForm(song)
  const norm = (v: string) => v.replace(/\r\n/g, '\n').trim()
  const reportChanged = (Object.keys(original) as (keyof SongForm)[]).some(k => norm(reportForm[k]) !== norm(original[k]))

  const handleSendReport = async () => {
    setReportStatus('sending')
    setReportError('')
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'correction', id: song.id, ...reportForm, website: honey }),
      })
      if (res.ok) {
        setReportStatus('sent')
        setTimeout(() => { setModal(null); setReportStatus('idle') }, 2000)
      } else {
        const d = await res.json().catch(() => ({}))
        setReportError(d.error || 'Arrori : u missaghju ùn hè micca partutu. Ritentate più tardi.')
        setReportStatus('error')
      }
    } catch {
      setReportError('Arrori di cunnissioni. Ritentate più tardi.')
      setReportStatus('error')
    }
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        id: song.id,
        artiste: editForm.artiste.trim(),
        album: editForm.album.trim(),
        titre: editForm.titre.trim(),
        annee: editForm.annee ? parseInt(editForm.annee) : null,
        numero: editForm.numero ? parseInt(editForm.numero) : null,
        paroles: editForm.paroles.trim() || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setCurrentSong({ ...currentSong, ...editForm, annee: editForm.annee ? parseInt(editForm.annee) : null, paroles: editForm.paroles || null })
      setModal(null)
    } else {
      const err = await res.json().catch(() => ({ error: 'Sbagliu' }))
      setSaveError(err.error || "Sbagliu mentri l'arrigistramentu")
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Sguassà "${song.titre}" ?`)) return
    setDeleting(true)
    await fetch(`/api/admin?id=${song.id}`, {
      method: 'DELETE',
    })
    setDeleting(false)
    onBack()
  }

  const EDGE_ZONE = 24
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, edge: t.clientX <= EDGE_ZONE }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const SWIPE_THRESHOLD = 60
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (start.edge && dx > 0) { onBack(); return }
    if (dx < 0 && hasNext) onNext()
    else if (dx > 0 && hasPrev) onPrev()
  }

  return (
    <div
      className="relative flex flex-col min-h-full bg-bg max-w-lg mx-auto"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >

      <TopBar />

      <div className="px-4 pt-[60px] pb-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-card flex items-center justify-center flex-shrink-0">
            <ChevronLeft className="w-5 h-5 text-text" />
          </button>
          <div className="flex-1 min-w-0">
            {onGoToArtist ? (
              <button onClick={() => onGoToArtist(currentSong.artiste)}
                className="text-accent text-xs underline truncate text-left block max-w-full">
                {currentSong.artiste}
              </button>
            ) : (
              <p className="text-text-muted text-xs truncate">{currentSong.artiste}</p>
            )}
            <h1 className="text-text font-bold text-lg leading-tight truncate">{currentSong.titre}</h1>
            <p className="text-text-muted text-xs truncate">
              {(currentSong as any).numero ? `N°${(currentSong as any).numero} · ` : ''}
              {currentSong.album && onGoToAlbum ? (
                <button onClick={() => onGoToAlbum(currentSong.artiste, currentSong.album)}
                  className="text-accent underline">
                  {currentSong.album}
                </button>
              ) : (
                currentSong.album
              )}
              {currentSong.annee ? ` · ${currentSong.annee}` : ''}
            </p>
          </div>
          <button onClick={onToggleFavorite} className="p-1 flex-shrink-0">
            <Heart className={`w-5 h-5 ${isFavorite ? 'text-red-500 fill-red-500' : 'text-muted'}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 px-4 pb-10">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => updateFontSize(Math.max(12, fontSize - 2))}
            className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-text font-bold">−</button>
          <span className="text-sm text-muted">Grandezza</span>
          <button onClick={() => updateFontSize(Math.min(32, fontSize + 2))}
            className="w-8 h-8 rounded-lg bg-card flex items-center justify-center text-text font-bold">+</button>
          <div className="flex-1" />
          {isAdmin ? (
            <>
              <button onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-text-muted text-xs font-medium">
                <Share2 className="w-3.5 h-3.5" />
                {shareFeedback ? 'Ligame cupiatu !' : 'Sparta'}
              </button>
              <button onClick={() => { setModal('edit'); setSaveError('') }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium">
                <Pencil className="w-3.5 h-3.5" />
                Scambià
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-xs font-medium">
                {deleting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Sguassà
              </button>
            </>
          ) : (
            <>
              <button onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-text-muted text-xs font-medium">
                <Share2 className="w-3.5 h-3.5" />
                {shareFeedback ? 'Ligame cupiatu !' : 'Sparta'}
              </button>
              <button onClick={openReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-text-muted text-xs font-medium">
                <Flag className="w-3.5 h-3.5" />
                Signalà
              </button>
            </>
          )}
        </div>

        {currentSong.paroles ? (
          <div className="text-text" style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}>
            {renderParoles(currentSong.paroles, highlightQuery)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center text-muted mt-20">
            <Music className="w-10 h-10 mb-3" />
            <p className="font-medium">Paroddi micca dispunibili</p>
            <p className="text-sm opacity-70">Sta canzona ùn hà ancu paroddi</p>
          </div>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
          <div className="w-full max-w-lg bg-surface rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-auto">

            {modal === 'edit' && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-text">Scambià a canzona</h3>
                  <button onClick={() => setModal(null)} className="text-muted text-sm">Annullà</button>
                </div>
                <div className="space-y-3">
                  {FIELDS.map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="text-text-muted text-xs mb-1 block">{label}</label>
                      <input
                        value={(editForm as any)[key]}
                        onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-text-muted text-xs mb-1 block">Paroddi</label>
                    <textarea
                      value={editForm.paroles}
                      onChange={e => setEditForm(f => ({ ...f, paroles: e.target.value }))}
                      rows={10}
                      className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent resize-none"
                    />
                  </div>
                </div>
                {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
                <button
                  disabled={!editForm.artiste.trim() || !editForm.titre.trim() || saving}
                  onClick={handleSaveEdit}
                  className="w-full py-3 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving && <Loader className="w-4 h-4 animate-spin" />}
                  Arrigistrà
                </button>
              </>
            )}

            {modal === 'report' && (
              <>
                {reportStatus === 'sent' ? (
                  <div className="text-center py-4">
                    <p className="text-2xl mb-2">✅</p>
                    <p className="font-display font-semibold text-text">Mandatu, grazia !</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="font-display font-bold text-text">Signalà un sbagliu</h3>
                      <button onClick={() => setModal(null)} className="text-muted text-sm">Annullà</button>
                    </div>
                    <p className="text-text-muted text-sm leading-relaxed">
                      Currigite ciò chì ùn va micca, poi mandate. I campi sò digià pieni cù a canzona attuale.
                    </p>
                    <div className="space-y-3">
                      {FIELDS.map(({ key, label, placeholder }) => (
                        <div key={key}>
                          <label className="text-text-muted text-xs mb-1 block">{label}</label>
                          <input
                            value={(reportForm as any)[key]}
                            onChange={e => { setReportForm(f => ({ ...f, [key]: e.target.value })); if (reportStatus === 'error') setReportStatus('idle') }}
                            placeholder={placeholder}
                            className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="text-text-muted text-xs mb-1 block">Paroddi</label>
                        <textarea
                          value={reportForm.paroles}
                          onChange={e => { setReportForm(f => ({ ...f, paroles: e.target.value })); if (reportStatus === 'error') setReportStatus('idle') }}
                          rows={10}
                          className="w-full px-4 py-2.5 rounded-xl bg-card border border-border text-text text-sm outline-none placeholder:text-muted focus:border-accent resize-none"
                        />
                      </div>
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

                    {reportStatus === 'error' && <p className="text-red-400 text-sm">{reportError}</p>}
                    <button
                      disabled={!reportForm.artiste.trim() || !reportForm.titre.trim() || !reportChanged || reportStatus === 'sending'}
                      onClick={handleSendReport}
                      className="w-full py-3 rounded-xl accent-gradient text-white font-display font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2">
                      {reportStatus === 'sending' && <Loader className="w-4 h-4 animate-spin" />}
                      Mandà
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}