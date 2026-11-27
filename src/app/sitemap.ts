import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'
import { songSlug } from '@/lib/slug'
import { SITE_URL } from '@/lib/site'

// Plan du site : une ligne par chanson qui a des paroles. Calculé à chaque demande
// (Google le lit rarement), donc toujours à jour quand tu ajoutes des chansons.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
  ]
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await supabase
      .from('chansons')
      .select('id,titre,artiste,created_at,paroles_updated_at')
      .not('paroles', 'is', null)
      .neq('paroles', '')
      .order('id')
      .range(from, from + pageSize - 1)
    if (error || !data || data.length === 0) break
    for (const s of data) {
      urls.push({
        url: `${SITE_URL}/chanson/${songSlug(s)}`,
        lastModified: s.paroles_updated_at || s.created_at ? new Date(s.paroles_updated_at || s.created_at) : undefined,
        changeFrequency: 'monthly',
        priority: 0.6,
      })
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return urls
}
