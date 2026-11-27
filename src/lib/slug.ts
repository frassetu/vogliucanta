// Adresse lisible d'une chanson : /chanson/123-titre-artiste
// Seul le numéro au début compte pour retrouver la chanson ; le reste sert à Google et aux humains.
export function slugify(str: string | null | undefined): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function songSlug(song: { id: number; titre: string; artiste: string }): string {
  const rest = [slugify(song.titre), slugify(song.artiste)].filter(Boolean).join('-')
  return rest ? `${song.id}-${rest}` : String(song.id)
}

export function idFromSlug(slug: string): number | null {
  const m = /^(\d+)(?:-|$)/.exec(slug)
  if (!m) return null
  const id = Number(m[1])
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
