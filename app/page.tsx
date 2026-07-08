import HomeContent from "@/components/HomeContent";
import type { NewsItem } from "@/components/NewsBoard";
import type { FeedPhoto } from "@/components/HomeFeed";
import { type Article, ARTICLE_COLUMNS } from "@/lib/articles";

// Главная (/). Серверный компонент (этап 10 W): новости и первые фото витрины
// читаются на СЕРВЕРЕ и попадают в HTML сразу — раньше оба блока грузились
// клиентом после гидрации (тот же класс проблемы, что T) и появлялись с задержкой.
// Интерактив и рецепт дня — в клиентском HomeContent.
//
// Кэш-ревалидация: новости меняются редко (админка) → 5 минут; витрина живее
// (новые фото за день) → 60 сек. explicit columns (CLAUDE.md): без session_id/
// user_ref/is_visible в пейлоаде.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

async function sbFetch<T>(path: string, revalidate: number): Promise<T[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      next: { revalidate },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

async function getNews(): Promise<NewsItem[]> {
  return sbFetch<NewsItem>(
    "news?select=id,date,title,body&is_visible=eq.true&order=created_at.desc",
    300,
  );
}

async function getFeed(): Promise<FeedPhoto[]> {
  // feed_photos_public уже отсортирован (created_at desc) и не отдаёт user_ref.
  return sbFetch<FeedPhoto>(
    "feed_photos_public?select=id,created_at,user_name,recipe_title,photo_url,likes_count,liked_by_me&limit=20",
    60,
  );
}

async function getArticles(): Promise<Article[]> {
  // articles_public уже отсортирован (свежие сверху) и НЕ отдаёт список
  // лайкнувших. Тело статьи (body) в карточки не тянем — только read_minutes.
  // Заметки меняются редко (админка) → кэш 5 минут.
  return sbFetch<Article>(
    `articles_public?select=${ARTICLE_COLUMNS}&limit=3`,
    300,
  );
}

export type HomeTip = { id: string; body: string; emoji_icon: string | null };

async function getTip(): Promise<HomeTip | null> {
  // Явные колонки (без is_published в пейлоаде). RLS отдаёт только
  // опубликованные. Стабильный порядок (published_at) → детерминированная
  // ротация по дате: один и тот же совет весь день, разный по дням.
  const tips = await sbFetch<HomeTip>(
    "tips?select=id,body,emoji_icon&is_published=eq.true&order=published_at.asc,created_at.asc&limit=500",
    300,
  );
  if (tips.length === 0) return null;
  const now = new Date();
  const dayOfYear = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000,
  );
  return tips[dayOfYear % tips.length];
}

export default async function Home() {
  const [news, feed, articles, tip] = await Promise.all([getNews(), getFeed(), getArticles(), getTip()]);
  return <HomeContent news={news} feed={feed} articles={articles} tip={tip} />;
}
