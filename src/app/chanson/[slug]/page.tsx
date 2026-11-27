import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { supabase, Song } from '@/lib/supabase'
import { songSlug, idFromSlug } from '@/lib/slug'
import { SITE_URL } from '@/lib/site'

// Page publique d'une chanson, générée à la demande puis gardée en cache 24 h.
// C'est elle que Google indexe (le reste de l'appli est une seule page).
export const revalidate = 86400
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}

type Params = { params: { slug: string } }

async function getSong(id: number): Promise<Song | null> {
  const { data } = await supabase.from('chansons').select('*').eq('id', id).maybeSingle()
  return (data as Song | null) ?? null
}

const hasLyrics = (s: Song) => !!s.paroles && s.paroles.trim().length > 0

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = idFromSlug(params.slug)
  const song = id ? await getSong(id) : null
  if (!song) return { title: 'Chanson introuvable', robots: { index: false } }
  const title = `${song.titre} – ${song.artiste} : paroles`
  const description =
    `Paroles de « ${song.titre} » de ${song.artiste}` +
    (song.album ? `, album ${song.album}` : '') +
    (song.annee ? ` (${song.annee})` : '') +
    '. Chanson corse sur Vogliu Cantà.'
  const url = `/chanson/${songSlug(song)}`
  return {
    title,
    description,
    alternates: { canonical: url },
    // Une page sans paroles n'a rien à offrir à Google : on ne l'indexe pas.
    robots: { index: hasLyrics(song), follow: true },
    openGraph: { title, description, url, type: 'article', siteName: 'Vogliu Cantà !', locale: 'fr_FR' },
  }
}

export default async function SongPage({ params }: Params) {
  const id = idFromSlug(params.slug)
  if (!id) notFound()
  const song = await getSong(id)
  if (!song) notFound()

  // Adresse unique : toute variante du texte après le numéro redirige vers la bonne.
  const expected = songSlug(song)
  if (params.slug !== expected) permanentRedirect(`/chanson/${expected}`)

  // Autres chansons du même album (ou du même artiste) : liens internes utiles à Google et aux visiteurs.
  let related: Song[] = []
  {
    let q = supabase.from('chansons').select('id,titre,artiste,album,numero').neq('id', song.id).eq('artiste', song.artiste)
    if (song.album) q = q.eq('album', song.album)
    const { data } = await q.order('numero', { ascending: true, nullsFirst: false }).limit(40)
    related = (data as Song[]) || []
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: song.titre,
    byArtist: { '@type': 'MusicGroup', name: song.artiste },
    ...(song.album ? { inAlbum: { '@type': 'MusicAlbum', name: song.album } } : {}),
    url: `${SITE_URL}/chanson/${expected}`,
    inLanguage: 'co',
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 text-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <a href="/" className="text-sm text-accent">← Vogliu Cantà !</a>

      <h1 className="font-display font-bold text-2xl mt-4">{song.titre}</h1>
      <p className="text-text-muted mt-1">
        {song.artiste}
        {song.album ? ` · ${song.album}` : ''}
        {song.annee ? ` · ${song.annee}` : ''}
      </p>

      <a
        href={`/?c=${song.id}`}
        className="inline-block mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium"
      >
        Aprì in l&apos;appiicazioni
      </a>

      {hasLyrics(song) ? (
        <div className="lyrics-text mt-6">{song.paroles}</div>
      ) : (
        <p className="mt-8 text-muted">Paroddi micca dispunibili per sta canzona.</p>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display font-bold text-lg mb-3">
            {song.album ? `Altre canzone di l'album « ${song.album} »` : `Altre canzone di ${song.artiste}`}
          </h2>
          <ul className="space-y-1.5">
            {related.map(r => (
              <li key={r.id}>
                <a href={`/chanson/${songSlug(r)}`} className="text-text-muted hover:text-accent">
                  {r.numero ? `${r.numero}. ` : ''}{r.titre}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
