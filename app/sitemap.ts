import { MetadataRoute } from 'next'
import { FEATURE_BANQUETS, FEATURE_COMMUNITY_FEED, FEATURE_IDEAS, IDEAS_INDEXABLE } from '@/lib/features'
import { SITE_URL, siteUrl } from '@/lib/site'
import { readRows } from '@/lib/supabaseRead'

// Заметки — наш первый контент под поисковый трафик, поэтому добавляем и
// раздел /articles, и каждую опубликованную статью в карту сайта. Slug и
// published_at читаем из публичного view articles_public (только опубликованные).
//
// Сбой запроса — исключение, а не пустой список (lib/supabaseRead.ts). Для
// карты сайта это особенно важно: закэшированная на час пустая карта говорит
// поисковику, что все рецепты и заметки пропали.

type ArticleRef = { slug: string; published_at: string | null; created_at: string }

async function getArticleRefs(): Promise<ArticleRef[]> {
  return readRows<ArticleRef>('articles_public?select=slug,published_at,created_at&limit=1000', {
    revalidate: 3600,
  })
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
  return readRows<RecipeRef>(
    'recipes?select=id,created_at,image_url&title=not.is.null&steps=not.is.null&order=created_at.desc&limit=5000',
    { revalidate: 3600 },
  )
}

// Каталог «Идеи». Только опубликованные: фильтр is_published стоит в запросе,
// а RLS на idea_recipes и так пускает anon только к ним (черновик в карте —
// это 404 для поисковика). lastModified — updated_at: правка вычитанного
// рецепта тоже повод перечитать страницу. Карта сбрасывается при публикации
// через revalidatePath в /api/admin/ideas.
const IDEAS_IN_SITEMAP = FEATURE_IDEAS && IDEAS_INDEXABLE

type IdeaRef = { slug: string; updated_at: string }

async function getIdeaRefs(): Promise<IdeaRef[]> {
  if (!IDEAS_IN_SITEMAP) return []
  return readRows<IdeaRef>(
    'idea_recipes?select=slug,updated_at&is_published=eq.true&order=published_at.desc&limit=5000',
    { revalidate: 3600 },
  )
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, recipes, ideas] = await Promise.all([
    getArticleRefs(),
    getRecipeRefs(),
    getIdeaRefs(),
  ])

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: siteUrl('/search'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // Банкеты скрыты флагом — в карте сайта их тоже нет (иначе поисковик получит 404).
    ...(FEATURE_BANQUETS
      ? [
          {
            url: siteUrl('/parties'),
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.8,
          },
        ]
      : []),
    // «Умный список покупок» — раздел, который продукт называет новинкой и
    // рекламирует на Главной, но в карте сайта его не было вовсе: для поиска
    // его просто не существовало. Приоритет 0.8 — это самостоятельный
    // раздел, а не служебная страница.
    {
      url: siteUrl('/shopping'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Лента сообщества: контент обновляется чаще разделов, но приоритет ниже —
    // это витрина, а не точка входа в основной сценарий. Скрыта флагом — в
    // карте сайта её тоже нет (иначе поисковик получит 404).
    ...(FEATURE_COMMUNITY_FEED
      ? [
          {
            url: siteUrl('/feed'),
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 0.6,
          },
        ]
      : []),
    {
      url: siteUrl('/about'),
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: siteUrl('/articles'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    // «Идеи» — вычитанный каталог, поэтому приоритет выше заметок и
    // сгенерированных /recipe/<id>: это лучшие страницы сайта для выдачи.
    ...(IDEAS_IN_SITEMAP
      ? [
          {
            url: siteUrl('/ideas'),
            lastModified: new Date(),
            changeFrequency: 'daily' as const,
            priority: 0.8,
          },
        ]
      : []),
    ...ideas.map((i) => ({
      url: siteUrl(`/ideas/${i.slug}`),
      lastModified: new Date(i.updated_at),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...articles.map((a) => ({
      url: siteUrl(`/articles/${a.slug}`),
      lastModified: new Date(a.published_at || a.created_at),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...recipes.map((r) => ({
      url: siteUrl(`/recipe/${r.id}`),
      lastModified: new Date(r.created_at),
      changeFrequency: 'monthly' as const,
      priority: r.image_url ? 0.7 : 0.6,
    })),
  ]
}
