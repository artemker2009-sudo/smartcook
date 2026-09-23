import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IdeasFeed from "@/components/IdeasFeed";
import AppPromoStrip from "@/components/AppPromoStrip";
import { FEATURE_IDEAS, IDEAS_INDEXABLE } from "@/lib/features";
import { IDEA_FEED_COLUMNS, toIdeaCard, type IdeaCard } from "@/lib/ideasFeed";
import { readRows } from "@/lib/supabaseRead";

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

export const metadata: Metadata = FEATURE_IDEAS
  ? {
      title: "Идеи — SmartCook",
      description: "Подборка рецептов от SmartCook: что приготовить сегодня.",
      alternates: { canonical: "/ideas" },
      ...(IDEAS_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
    }
  : {};

async function getCards(): Promise<IdeaCard[]> {
  // Сбой запроса НЕ превращаем в пустой каталог — см. lib/supabaseRead.ts.
  // Иначе перегенерация на секундном сбое Supabase закэшировала бы ленту
  // «Таких блюд пока нет» на пять минут для всех.
  const rows = await readRows<Parameters<typeof toIdeaCard>[0]>(
    `idea_recipes?select=${IDEA_FEED_COLUMNS}` +
      `&is_published=eq.true&order=sort_weight.desc,published_at.desc&limit=300`,
    { revalidate: 300 },
  );
  // toIdeaCard здесь же срезает количества ингредиентов: в пейлоад браузера
  // уходят только названия, нужные фильтру «Подходит мне».
  return rows.map(toIdeaCard).filter((c): c is IdeaCard => c !== null);
}

export default async function IdeasPage() {
  if (!FEATURE_IDEAS) notFound();

  const cards = await getCards();

  return (
    <div className="ideas-page">
      {/* Строка «Удобнее в приложении» — только Android в браузере, сама решает,
          показываться ли (см. AppPromoStrip). Стоит ВЫШЕ ленты и вне
          IdeasFeed: внутри она уезжала бы вместе с жестом «потянуть, чтобы
          обновить», который двигает всю ленту трансформом. */}
      <AppPromoStrip />

      {/* Заголовок ленты живёт ВНУТРИ IdeasFeed: рядом с ним стоит кнопка
          «Избранное», переключающая фильтр избранного, а фильтры — состояние ленты, из
          серверного компонента его не достать. На SSR это не влияет: клиентский
          компонент рендерится сервером так же, заголовок в HTML остаётся.

          Suspense-границы здесь нет намеренно: лента НЕ вызывает
          useSearchParams, иначе Next отрендерил бы её целиком на клиенте и
          статический HTML остался бы без карточек. */}
      <IdeasFeed initialCards={cards} />
    </div>
  );
}
