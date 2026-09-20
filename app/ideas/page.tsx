import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURE_IDEAS, IDEAS_INDEXABLE } from "@/lib/features";

// Раздел «Идеи» — каталог рецептов, который наполняем мы сами. Здесь пока
// только каркас маршрута (этап 1): вкладка в таб-баре ведёт на существующий
// адрес, а не в 404. Сетка, фильтры и данные приедут следующими этапами.
//
// При выключенном FEATURE_IDEAS метаданных нет вовсе — иначе название раздела
// просочилось бы в <title> страницы 404 (та же аккуратность, что у /feed).
export const metadata: Metadata = FEATURE_IDEAS
  ? {
      title: "Идеи — SmartCook",
      description: "Подборка рецептов от SmartCook: что приготовить сегодня.",
      alternates: { canonical: "/ideas" },
      // Пока каталог не наполнен — раздел закрыт от поисковиков одним общим
      // переключателем IDEAS_INDEXABLE (см. lib/features.ts).
      ...(IDEAS_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
    }
  : {};

export default function IdeasPage() {
  // Раздел скрыт флагом — настоящий 404, как у /feed и /parties.
  if (!FEATURE_IDEAS) notFound();

  return (
    <div className="container">
      <header style={{ margin: "var(--space-4) 0" }}>
        <h1 className="section-title" style={{ marginBottom: "var(--space-1)" }}>
          Идеи
        </h1>
        <p
          style={{
            margin: 0,
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-caption)",
          }}
        >
          Подборка SmartCook. Картинки блюд созданы ИИ.
        </p>
      </header>
    </div>
  );
}
