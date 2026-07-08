"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Lightbulb } from "lucide-react";
import HeroLanding from "@/components/HeroLanding";
import NewsBoard, { type NewsItem } from "@/components/NewsBoard";
import HomeFeed, { type FeedPhoto } from "@/components/HomeFeed";
import ArticlesBoard from "@/components/ArticlesBoard";
import type { Article } from "@/lib/articles";
import AppNavigation from "@/components/AppNavigation";
import type { DailyRecipeType } from "@/lib/types";

type HomeTip = { id: string; body: string; emoji_icon: string | null };

// Клиентская оболочка Главной. Интерактив (редиректы диплинков, рецепт дня из
// /api/daily) живёт здесь, а тяжёлый контент — новости и первые фото витрины —
// приходит уже готовым пропом из серверного app/page.tsx (этап 10 W): он в HTML
// сразу, без клиентского запроса после гидрации. Рецепт дня оставлен клиентским
// (генерится через OpenAI с кэшом по дате — блокировать им SSR Главной нельзя),
// у него свой скелет фиксированной высоты — без прыжка макета.
export default function HomeContent({
  news,
  feed,
  articles,
  tip,
}: {
  news: NewsItem[];
  feed: FeedPhoto[];
  articles: Article[];
  tip: HomeTip | null;
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
      <AppNavigation activeSection="daily" />

      <HeroLanding />

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

      {/* Блок «Кухонные заметки» занял место, где раньше были «Новости проекта».
          Наш первый контент из поиска — потому выше витрины. */}
      <ArticlesBoard initialItems={articles} />

      <HomeFeed initialItems={feed} />

      {/* Новости проекта не потеряли: демонтированы вниз в компактном виде. */}
      <NewsBoard items={news} variant="compact" />
    </div>
  );
}
