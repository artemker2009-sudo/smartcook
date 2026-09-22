import type { Metadata } from "next";
import HomeContent from "@/components/HomeContent";
import { FEATURE_IDEAS } from "@/lib/features";
import { HOME_IDEAS_COUNT, mskDateKey, pickDailyIdeas } from "@/lib/homeIdeas";
import { IDEA_FEED_COLUMNS, toIdeaCard, type IdeaCard } from "@/lib/ideasFeed";
import { SITE_URL, siteUrl } from "@/lib/site";
import { readRows } from "@/lib/supabaseRead";

// Каноникал Главной — apex-корень. title/description/og наследуются из корневого
// layout (у Главной они и есть дефолтные), здесь добавляем только canonical.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Главная (/). Серверный компонент: контент блоков читается на СЕРВЕРЕ и
// попадает в HTML сразу — карточки «Идей» видны и без JS.
//
// Окно ревалидации задано ЯВНО, а не выведено из запросов: набор «Идей на
// сегодня» меняется в полночь по МСК, и от этого числа зависит, как быстро
// закэшированная Главная подхватит новый набор. Пять минут — тот же бакет, что
// у ленты «Идей» (значит тот же кэш на edge), и дольше пяти минут вчерашняя
// четвёрка после полуночи не живёт.
//
// Блоки, снятые с Главной вместе с их SSR-запросами (компоненты и таблицы НЕ
// тронуты, вернуть = вернуть функцию-запрос и строку рендера):
//   • витрина «Приготовили сегодня» — запрос к feed_photos_public;
//   • демо-чипы H8 «магия без фото» — запрос к dish_cache.
export const revalidate = 300;

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

/**
 * Четыре карточки блока «Идеи на сегодня».
 *
 * Читаем ВЕСЬ опубликованный каталог (он маленький, сотня-две строк) тем же
 * запросом, что и лента «Идей»: одна строка запроса — один кэш на edge, и
 * Главная не заводит собственного обращения к базе. Набор дня выбирается уже в
 * памяти, детерминированно по дате (lib/homeIdeas.ts), поэтому у всех в один
 * день он одинаковый и серверная разметка совпадает с клиентской.
 *
 * Сбой запроса — исключение, а не пустой блок (lib/supabaseRead.ts): иначе
 * секундный сбой Supabase закэшировал бы Главную без «Идей» на пять минут для
 * всех. Раздел выключен флагом — блока нет вовсе (на /ideas всё равно 404).
 */
async function getHomeIdeas(): Promise<IdeaCard[]> {
  if (!FEATURE_IDEAS) return [];
  const rows = await readRows<Parameters<typeof toIdeaCard>[0]>(
    `idea_recipes?select=${IDEA_FEED_COLUMNS}` +
      `&is_published=eq.true&order=sort_weight.desc,published_at.desc&limit=300`,
    { revalidate },
  );
  const cards = rows.map(toIdeaCard).filter((c): c is IdeaCard => c !== null);
  return pickDailyIdeas(cards, mskDateKey(), HOME_IDEAS_COUNT);
}

export default async function Home() {
  const ideas = await getHomeIdeas();
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
      <HomeContent ideas={ideas} />
    </>
  );
}
