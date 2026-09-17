import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";
import type { FeedPhoto } from "@/components/HomeFeed";
import { feedWindowStartISO } from "@/lib/feedWindow";
import { type DemoChip, filterAvailableChips } from "@/lib/demoChips";
import { SITE_URL, siteUrl } from "@/lib/site";

// Каноникал Главной — apex-корень. title/description/og наследуются из корневого
// layout (у Главной они и есть дефолтные), здесь добавляем только canonical.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Главная (/). Серверный компонент (этап 10 W): контент блоков читается на
// СЕРВЕРЕ и попадает в HTML сразу — раньше блоки грузились клиентом после
// гидрации (тот же класс проблемы, что T) и появлялись с задержкой.
// Интерактив и рецепт дня — в клиентском HomeContent.
//
// Кэш-ревалидация: кэш блюд под демо-чипы меняется редко → 5 минут; витрина
// живее (новые фото за день) → 60 сек. explicit columns (CLAUDE.md): без
// session_id/user_ref/is_visible в пейлоаде.
//
// Блок «Совет дня» снят с Главной (этап H11) — вместе с ним ушёл и его
// SSR-запрос к tips. Админка советов и таблица tips НЕ тронуты: вернуть блок =
// вернуть getTip() и одну строку рендера в HomeContent.

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

// Блок «Новости проекта» снят с Главной (только UI + этот SSR-запрос). Админка
// «Новости» и таблица news НЕ тронуты — компонент NewsBoard тоже на месте, так
// что вернуть блок = вернуть getNews() и одну строку рендера в HomeContent.

async function getFeed(): Promise<FeedPhoto[]> {
  // feed_photos_public уже отсортирован (created_at desc) и не отдаёт user_ref.
  // Тянем окно витрины (последние FEED_WINDOW_DAYS суток по МСК); режим
  // «сегодня»/«на этой неделе» и скрытие пустого блока решает клиент по факту
  // наполнения (lib/feedWindow.ts). recipe_id → кнопка «К рецепту» в карточке.
  const since = encodeURIComponent(feedWindowStartISO());
  return sbFetch<FeedPhoto>(
    `feed_photos_public?select=id,created_at,user_name,recipe_title,recipe_id,photo_url,likes_count,liked_by_me&created_at=gte.${since}&order=created_at.desc&limit=20`,
    60,
  );
}

async function getDemoChips(): Promise<DemoChip[]> {
  // Демо-чипы H8: читаем прогретые ключи блюд из публичного dish_cache и
  // оставляем только те чипы-кандидаты, что реально есть в кэше. Таблица
  // небольшая — тянем ключи целиком и пересекаем в памяти (без хрупкого
  // in.()-фильтра с кириллицей). Кэш живёт долго → ревалидация 5 минут.
  const rows = await sbFetch<{ query_key: string }>(
    "dish_cache?select=query_key&limit=500",
    300,
  );
  return filterAvailableChips(new Set(rows.map((r) => r.query_key)));
}

// JSON-LD Главной: WebSite (с кириллическим alternateName для брендовых
// запросов «смарткук») + Organization. Помогает поисковику связать бренд
// SmartCook / СмартКук с сайтом.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": siteUrl("/#website"),
      url: SITE_URL,
      name: "SmartCook",
      alternateName: ["СмартКук", "Смарт Кук", "smart cook pro"],
      inLanguage: "ru-RU",
      publisher: { "@id": siteUrl("/#organization") },
    },
    {
      "@type": "Organization",
      "@id": siteUrl("/#organization"),
      name: "SmartCook",
      alternateName: "СмартКук",
      url: SITE_URL,
      logo: siteUrl("/icon-512.png"),
      sameAs: ["https://t.me/smartcook2026"],
    },
  ],
};

export default async function Home() {
  const [feed, demoChips] = await Promise.all([getFeed(), getDemoChips()]);
  return (
    <>
      {/* Преднагрузка фотографии первого экрана — это LCP-кадр Главной.
          Ставится здесь, в серверном компоненте: React поднимает link в <head>
          первого же ответа, и браузер начинает качать снимок, не дожидаясь
          разбора разметки. type обязателен — по нему браузер без поддержки
          AVIF пропускает преднагрузку и берёт WebP из <picture>. */}
      <link
        rel="preload"
        as="image"
        type="image/avif"
        href="/hero/fresh-produce.avif"
        fetchPriority="high"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <HomeContent feed={feed} demoChips={demoChips} />
    </>
  );
}
