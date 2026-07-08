import HomeContent from "@/components/HomeContent";
import type { NewsItem } from "@/components/NewsBoard";
import type { FeedPhoto } from "@/components/HomeFeed";

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

export default async function Home() {
  const [news, feed] = await Promise.all([getNews(), getFeed()]);
  return <HomeContent news={news} feed={feed} />;
}
