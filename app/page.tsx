"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import HeroLanding from "@/components/HeroLanding";
import NewsBoard from "@/components/NewsBoard";
import HomeFeed from "@/components/HomeFeed";
import AppNavigation from "@/components/AppNavigation";
import type { DailyRecipeType } from "@/lib/types";

// Главная (/). Лёгкая витрина: hero+анимация+2 CTA, рецепт дня, новости и
// лента «Приготовили сегодня». Весь поисковый апп живёт на /search. Старые
// диплинки, которые исторически прилетали на / (расшаренные рецепты, рецепт
// дня, вход из баннеров банкетов), редиректим на /search — там их обработчик.
export default function Home() {
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
            <span className="daily-today-badge">Сегодня</span>
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

      <NewsBoard />

      <HomeFeed />
    </div>
  );
}
