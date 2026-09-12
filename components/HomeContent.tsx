"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import HeroLanding from "@/components/HeroLanding";
import HowItWorks from "@/components/HowItWorks";
import ShoppingEntryCard from "@/components/ShoppingEntryCard";
import SuggestCard from "@/components/SuggestCard";
import RuStoreBadge from "@/components/RuStoreBadge";
import HomeFeed, { type FeedPhoto } from "@/components/HomeFeed";
import type { DemoChip } from "@/lib/demoChips";
import type { DailyRecipeType } from "@/lib/types";

// Клиентская оболочка Главной (H11 «одно обещание, одна кнопка»). Порядок
// блоков сверху вниз:
//   1. первый экран — обещание + одна кнопка (весь viewport телефона)
//   2. «Как это работает» + демо-чипы H8
//   3. компактный вход в список покупок
//   4. рецепт дня
//   5. витрина «Приготовили сегодня»
//   6. «Что добавить, а что убрать?»
//
// Что снято с Главной в этом этапе (компоненты и роуты НЕ удалены, вернуть =
// одна строка рендера): плавающий хамбургер (дублировал таб-бар и тащил на
// Главную банкеты с лентой; позже снят и с остальных страниц — компонент
// AppNavigation удалён), ProcessAnimation, ShoppingPromoBanner,
// ShoppingFeatureCard (заменён компактным ShoppingEntryCard), «Совет дня»
// (вместе с SSR-запросом tips в app/page.tsx), ссылка «Смотреть все блюда в
// ленте». Раньше отсюда же уехали «Кухонные заметки» (/articles) и «Новости».
//
// Тяжёлый контент (первые фото витрины, доступные демо-чипы) приходит готовым
// пропом из серверного app/page.tsx — он в HTML сразу, без запроса после
// гидрации. Рецепт дня остаётся клиентским (генерится через OpenAI с кэшом по
// дате — блокировать им SSR Главной нельзя), у него скелет фиксированной
// высоты — без прыжка макета.
export default function HomeContent({
  feed,
  demoChips,
}: {
  feed: FeedPhoto[];
  demoChips: DemoChip[];
}) {
  const router = useRouter();
  const [daily, setDaily] = useState<DailyRecipeType | null>(null);

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

  useEffect(() => {
    let alive = true;
    fetch("/api/daily")
      .then((res) => res.json())
      .then((json) => {
        if (alive && json && json.title && !json.error) setDaily(json);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="container container-home">
      <HeroLanding />

      <HowItWorks demoChips={demoChips} />

      <ShoppingEntryCard />

      {/* Рецепт дня. Клик ведёт в полноэкранный вид на /search. */}
      <button
        type="button"
        className={`daily-teaser${daily ? " daily-teaser-in" : ""}`}
        onClick={() => router.push("/search?daily=true")}
        aria-label="Открыть рецепт дня"
      >
        <div style={{ background: "var(--color-accent-subtle)", padding: "var(--space-2)", borderRadius: "var(--radius-sm)" }}>
          <Flame color="var(--color-accent)" size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "2px" }}>
            <span className="daily-today-badge">Рецепт дня</span>
            {daily?.date && (
              <span style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-medium)" }}>
                {daily.date}
              </span>
            )}
          </div>
          {daily ? (
            <div style={{ fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-body)", color: "var(--color-text)" }}>
              {daily.title}
            </div>
          ) : (
            <div className="sc-skel" style={{ height: "18px", width: "70%", marginTop: "var(--space-1)" }} />
          )}
        </div>
      </button>

      {/* Витрина «Приготовили сегодня». Ссылка «Смотреть все блюда в ленте»
          (home_feed_open) с Главной снята — вход в ленту остался в профиле. */}
      <HomeFeed initialItems={feed} />

      {/* Обратная связь — последний блок Главной, прямо перед футером: просьба
          рассказать, чего не хватает, уместна после того, как человек
          посмотрел, что уже есть. */}
      <SuggestCard />

      {/* Плашка «Скачайте в RuStore» — только Android и только вне
          установленного приложения (логика внутри компонента). Уехала сюда с
          первого экрана: он теперь про одно обещание и одну кнопку. */}
      <div className="home-store-badge">
        <RuStoreBadge />
      </div>
    </div>
  );
}
