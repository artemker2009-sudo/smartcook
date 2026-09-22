"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import HomeHero from "@/components/home/HomeHero";
import HomeCookResume from "@/components/home/HomeCookResume";
import HomeIdeas from "@/components/home/HomeIdeas";
import HomeShoppingCard from "@/components/home/HomeShoppingCard";
import RuStoreBadge from "@/components/RuStoreBadge";
import type { IdeaCard } from "@/lib/ideasFeed";

// Клиентская оболочка Главной (v2, утверждённый макет). Порядок блоков сверху
// вниз — и больше на Главной ничего нет:
//   1. первый экран: фотография продуктов, название, обещание, одна кнопка;
//   2. «Вы собирались приготовить …» — только у вернувшегося;
//   3. «Идеи на сегодня»: четыре карточки каталога + «Больше идей»;
//   4. «Список покупок»: что это и кнопка в раздел;
//   5. плашка RuStore (только Android в браузере — решает сам компонент) и
//      подвал, который рисует LayoutGate в root-layout.
//
// Что снято с Главной в этом этапе. Компоненты и роуты НЕ удалены — вернуть
// каждый значит вернуть одну строку рендера:
//   • HowItWorks («Сфотографируйте → Выберите → Готовьте») вместе с чипами H8
//     и SSR-запросом к dish_cache;
//   • «Рецепт дня» вместе с клиентским запросом /api/daily;
//   • витрина «Приготовили сегодня» (HomeFeed) вместе с SSR-запросом к
//     feed_photos — её место заняли «Идеи»;
//   • ShoppingEntryCard («Мой список покупок») — заменён карточкой раздела;
//   • SuggestCard («Что добавить, а что убрать?») — переехал в Профиль, вниз.
// Раньше отсюда же уехали «Совет дня», «Кухонные заметки» и «Новости».
//
// Весь контент блоков приходит готовым пропом из серверного app/page.tsx — он
// в HTML сразу, без единого запроса после гидрации.
export default function HomeContent({ ideas }: { ideas: IdeaCard[] }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const search = window.location.search;
    const params = new URLSearchParams(search);
    // ?recipeId уводится на быстрый /recipe/:id серверным редиректом (next.config),
    // сюда уже не долетает. Остаются рецепт дня и вход из баннеров банкетов.
    if (params.get("daily") === "true" || params.has("auth")) {
      router.replace("/search" + search);
    }
  }, [router]);

  return (
    <div className="container container-home">
      <HomeHero />
      <HomeCookResume />
      <HomeIdeas cards={ideas} />
      <HomeShoppingCard />

      {/* Плашка «Скачайте в RuStore» — только Android и только вне
          установленного приложения (логика внутри компонента). Внизу, перед
          подвалом: это точка входа в установку, а установка = возврат. */}
      <div className="home-store-badge">
        <RuStoreBadge />
      </div>
    </div>
  );
}
