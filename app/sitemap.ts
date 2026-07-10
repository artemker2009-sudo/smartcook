import { MetadataRoute } from 'next'

// Заметки — наш первый контент под поисковый трафик, поэтому добавляем и
// раздел /articles, и каждую опубликованную статью в карту сайта. Slug и
// published_at читаем из публичного view articles_public (только опубликованные).
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yjfqwwiqwoighjdlkodg.supabase.co'
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z'

type ArticleRef = { slug: string; published_at: string | null; created_at: string }

async function getArticleRefs(): Promise<ArticleRef[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/articles_public?select=slug,published_at,created_at&limit=1000`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 3600 },
      },
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as ArticleRef[]) : []
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await getArticleRefs()

  return [
    {
      url: 'https://smart-cook.pro',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: 'https://smart-cook.pro/search',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: 'https://smart-cook.pro/parties',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://smart-cook.pro/about',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://smart-cook.pro/articles',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    ...articles.map((a) => ({
      url: `https://smart-cook.pro/articles/${a.slug}`,
      lastModified: new Date(a.published_at || a.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
