"use client";

import { ChefHat } from "lucide-react";
import { useRouter } from "next/navigation";

// Витрина «Приготовили сегодня» (лента v1). В Блоке 1 таблицы ещё нет —
// показываем только красивое пустое состояние (сетку фото и лайки добавит
// Блок 2). Пустую сетку не показываем никогда.
export default function HomeFeed() {
  const router = useRouter();
  return (
    <section className="home-feed">
      <h2 className="section-title">Приготовили сегодня</h2>
      <div className="feed-empty">
        <div className="feed-empty-icon">
          <ChefHat size={28} />
        </div>
        <p className="feed-empty-text">
          Здесь появятся блюда, которые приготовили сегодня. Приготовьте первым!
        </p>
        <button
          type="button"
          className="btn-primary feed-empty-cta"
          onClick={() => router.push("/search")}
        >
          Найти рецепт
        </button>
      </div>
    </section>
  );
}
