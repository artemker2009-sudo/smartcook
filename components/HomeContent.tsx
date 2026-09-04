"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Flame, ImageIcon, Lightbulb } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import HeroLanding from "@/components/HeroLanding";
import ShoppingPromoBanner from "@/components/ShoppingPromoBanner";
import ShoppingFeatureCard from "@/components/ShoppingFeatureCard";
import HomeFeed, { type FeedPhoto } from "@/components/HomeFeed";
import type { DemoChip } from "@/lib/demoChips";
import AppNavigation from "@/components/AppNavigation";
import type { DailyRecipeType } from "@/lib/types";

type HomeTip = { id: string; body: string; emoji_icon: string | null };

// Клиентская оболочка Главной. Интерактив (редиректы диплинков, рецепт дня из
// /api/daily) живёт здесь, а тяжёлый контент — заметки, совет и первые фото
// витрины — приходит уже готовым пропом из серверного app/page.tsx (этап 10 W): он в HTML
// сразу, без клиентского запроса после гидрации. Рецепт дня оставлен клиентским
// (генерится через OpenAI с кэшом по дате — блокировать им SSR Главной нельзя),
// у него свой скелет фиксированной высоты — без прыжка макета.
export default function HomeContent({
  feed,
  tip,
  demoChips,
}: {
  feed: FeedPhoto[];
  tip: HomeTip | null;
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
    <div className="container">
      <AppNavigation />

      <HeroLanding demoChips={demoChips} />

      {/* Плашка-новинка «Покупки»: один раз на устройство и только вернувшимся
          (логика в lib/shoppingPromo). Стоит ПОД hero — первый экран H7 (бренд,
          заголовок, одна CTA) не трогаем. Сам себя не рендерит, если не нужно. */}
      <ShoppingPromoBanner />

      {/* Рецепт дня переезжает на Главную. Клик ведёт в полноэкранный вид на /search. */}
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

      {/* Премиальная карточка «Умный список покупок» — сразу после «Рецепта дня».
          Заметный градиентный блок с живым примером пользы. Тап ведёт в /shopping. */}
      <ShoppingFeatureCard />

      {/* Совет дня (Z-2): пассивная плитка рядом с «Рецептом дня», без кнопок.
          Пусто (нет опубликованных советов) — не показываем вовсе. */}
      {tip && (
        <div className="tip-card">
          <div className="tip-icon" aria-hidden>
            {tip.emoji_icon ? <span className="tip-emoji">{tip.emoji_icon}</span> : <Lightbulb size={22} />}
          </div>
          <div className="tip-body">
            <div className="tip-label">Совет дня</div>
            <p className="tip-text">{tip.body}</p>
          </div>
        </div>
      )}

      {/* Блок «Кухонные заметки» снят с Главной (полировка PR A) — заметки
          остаются доступны на /articles (SEO/поисковики, канал №1), компонент
          ArticlesBoard там не тронут. */}

      {/* Витрина — последний блок Главной. Ниже стоял компактный блок «Новости
          проекта»; он снят (админка и таблица news не тронуты, компонент
          NewsBoard на месте — вернуть можно одной строкой). Собственный
          margin-bottom у .home-feed сохраняет нижний отступ страницы. */}
      <HomeFeed initialItems={feed} />

      {/* Вход в полную ленту сообщества. Постов пока мало — на Главной только
          дневная витрина, а тут аккуратная ссылка на всю ленту (/feed).
          Цель Метрики home_feed_open меряет интерес к переходу. */}
      <Link
        href="/feed"
        className="feed-entry"
        onClick={() => reachGoal("home_feed_open")}
        aria-label="Смотреть все блюда в ленте"
      >
        <span className="feed-entry-icon" aria-hidden>
          <ImageIcon size={22} />
        </span>
        <span className="feed-entry-text">
          <span className="feed-entry-title">Смотреть все блюда в ленте</span>
          <span className="feed-entry-sub">Фото блюд от сообщества</span>
        </span>
        <ArrowRight size={20} className="feed-entry-arrow" aria-hidden />
      </Link>
    </div>
  );
}
