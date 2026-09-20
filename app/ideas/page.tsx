import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IdeasFeed from "@/components/IdeasFeed";
import { FEATURE_IDEAS, IDEAS_INDEXABLE } from "@/lib/features";
import { IDEA_FEED_COLUMNS, toIdeaCard, type IdeaCard } from "@/lib/ideasFeed";

// Раздел «Идеи» — каталог рецептов, который наполняем мы сами.
//
// СТРАНИЦА НАМЕРЕННО НЕ ЧИТАЕТ searchParams. Как только серверный компонент
// заглядывает в параметры запроса, маршрут становится полностью динамическим,
// и ISR с revalidate пропадает — каждая прокрутка ленты ходила бы в базу.
// Поэтому сервер отдаёт ВЕСЬ опубликованный каталог (он маленький, сотня-две
// строк), а фильтры живут на клиенте и в адресе. Побочная польза: фильтрация
// мгновенная, без единого запроса.
//
// Кэш-ревалидация 300 секунд — как у /articles. Заодно это тот же бакет
// staleTimes.static, поэтому возврат из рецепта в пределах пяти минут
// достаёт ленту из клиентского кэша вместе с позицией скролла.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

export const metadata: Metadata = FEATURE_IDEAS
  ? {
      title: "Идеи — SmartCook",
      description: "Подборка рецептов от SmartCook: что приготовить сегодня.",
      alternates: { canonical: "/ideas" },
      ...(IDEAS_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
    }
  : {};

async function getCards(): Promise<IdeaCard[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/idea_recipes?select=${IDEA_FEED_COLUMNS}` +
        `&is_published=eq.true&order=sort_weight.desc,published_at.desc&limit=300`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // toIdeaCard здесь же срезает количества ингредиентов: в пейлоад браузера
    // уходят только названия, нужные фильтру «Подходит мне».
    return data.map(toIdeaCard).filter((c): c is IdeaCard => c !== null);
  } catch {
    return [];
  }
}

export default async function IdeasPage() {
  if (!FEATURE_IDEAS) notFound();

  const cards = await getCards();

  return (
    <div className="ideas-page">
      <header className="ideas-header">
        <h1 className="ideas-title">Идеи</h1>
        <p className="ideas-subtitle">Подборка SmartCook. Картинки блюд созданы ИИ.</p>
      </header>

      {/* Suspense-границы здесь нет намеренно: лента НЕ вызывает
          useSearchParams, иначе Next отрендерил бы её целиком на клиенте и
          статический HTML остался бы без карточек. */}
      <IdeasFeed initialCards={cards} />
    </div>
  );
}
