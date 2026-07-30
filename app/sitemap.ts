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

// Страницы рецептов — канал №1 SEO-стратегии, поэтому каждая публичная
// страница /recipe/[id] должна быть в карте сайта. RLS на recipes открывает
// SELECT всем (supabase_recipes_social_rls.sql), маршрут /recipe/[id] рендерит
// рецепт по id. Индексируем только реально рендерящиеся страницы: title и steps
// должны существовать (маршрут иначе отдаёт «не найдено», а без шагов страница
// пустая). Explicit-колонки (CLAUDE.md, без select=*): id/created_at/image_url —
// image_url задаёт приоритет (рецепты с картинкой богаче для выдачи).
// limit 5000 — предохранитель против будущего роста; лимит sitemap 50 000 URL.
type RecipeRef = { id: number; created_at: string; image_url: string | null }

async function getRecipeRefs(): Promise<RecipeRef[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/recipes?select=id,created_at,image_url&title=not.is.null&steps=not.is.null&order=created_at.desc&limit=5000`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 3600 },
      },
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? (data as RecipeRef[]) : []
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, recipes] = await Promise.all([getArticleRefs(), getRecipeRefs()])

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
    ...recipes.map((r) => ({
      url: `https://smart-cook.pro/recipe/${r.id}`,
      lastModified: new Date(r.created_at),
      changeFrequency: 'monthly' as const,
      priority: r.image_url ? 0.7 : 0.6,
    })),
  ]
}
