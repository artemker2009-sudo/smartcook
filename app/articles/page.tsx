import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import AppNavigation from "@/components/AppNavigation";
import ArticlesBoard from "@/components/ArticlesBoard";
import { type Article, ARTICLE_COLUMNS } from "@/lib/articles";

// Список всех «Кухонных заметок» (задача Y). SSR по правилам T/W: контент
// читается на сервере и попадает в HTML сразу (наш первый контент под поиск —
// важно, чтобы индексировался и грузился быстро). articles_public публичен,
// отдаёт только опубликованные и НЕ раскрывает список лайкнувших. body в список
// не тянем — только read_minutes.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

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
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/articles_public?select=${ARTICLE_COLUMNS}&limit=50`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as Article[]) : [];
  } catch {
    return [];
  }
}

export default async function ArticlesPage() {
  const articles = await getArticles();

  return (
    <div className="container">
      <AppNavigation activeSection="daily" />

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
