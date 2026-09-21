import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import ArticlesBoard from "@/components/ArticlesBoard";
import { type Article, ARTICLE_COLUMNS } from "@/lib/articles";
import { readRows } from "@/lib/supabaseRead";

// Список всех «Кухонных заметок» (задача Y). SSR по правилам T/W: контент
// читается на сервере и попадает в HTML сразу (наш первый контент под поиск —
// важно, чтобы индексировался и грузился быстро). articles_public публичен,
// отдаёт только опубликованные и НЕ раскрывает список лайкнувших. body в список
// не тянем — только read_minutes.

export const metadata: Metadata = {
  title: "Кухонные заметки — SmartCook",
  description:
    "Короткие практичные заметки о готовке от команды SmartCook: без воды, только применимые советы.",
  alternates: { canonical: "/articles" },
  openGraph: {
    title: "Кухонные заметки — SmartCook",
    description: "Короткие практичные заметки о готовке от команды SmartCook.",
    type: "website",
    siteName: "SmartCook",
  },
};

async function getArticles(): Promise<Article[]> {
  // Сбой запроса — исключение, а не пустой список: иначе перегенерация на
  // сбое Supabase закэшировала бы «Заметки скоро появятся» на пять минут.
  // Настоящий пустой список (база ответила []) показываем как пустой.
  return readRows<Article>(`articles_public?select=${ARTICLE_COLUMNS}&limit=50`, {
    revalidate: 300,
  });
}

export default async function ArticlesPage() {
  const articles = await getArticles();

  return (
    <div className="container">
      <header style={{ margin: "var(--space-4) 0 var(--space-4)" }}>
        <h1
          className="section-title"
          style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}
        >
          <BookOpen size={22} color="var(--color-accent)" />
          Кухонные заметки
        </h1>
        <p style={{ margin: 0, color: "var(--color-text-secondary)", fontSize: "var(--font-size-caption)" }}>
          Короткие практичные заметки о готовке. Автор — команда SmartCook.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="feed-empty" style={{ marginBottom: "var(--space-5)" }}>
          <div className="feed-empty-icon">
            <BookOpen size={28} />
          </div>
          <p className="feed-empty-text">Заметки скоро появятся. Загляните позже!</p>
          <Link href="/search" className="btn-primary feed-empty-cta">
            Что приготовить?
          </Link>
        </div>
      ) : (
        <ArticlesBoard initialItems={articles} variant="list" returnPath="/articles" />
      )}
    </div>
  );
}
