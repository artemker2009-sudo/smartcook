import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import AppNavigation from "@/components/AppNavigation";
import ArticleLikeButton from "@/components/ArticleLikeButton";
import { renderMarkdown } from "@/lib/markdown";

// Страница «Кухонной заметки» (задача Y). SSR (правила T/W): статья читается
// ОДНИМ серверным запросом и попадает в HTML сразу — это наш первый контент,
// который может приводить людей из поиска, поэтому важны и скорость, и OG-теги.
// Источник — публичный view articles_public (только опубликованные, не отдаёт
// список лайкнувших). Тело рендерим безопасным markdown-подмножеством на сервере.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

type FullArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  emoji_icon: string | null;
  read_minutes: number;
  likes_count: number;
};

const ARTICLE_FIELDS = "id,title,slug,excerpt,body,emoji_icon,read_minutes,likes_count";

async function getArticle(slug: string): Promise<FullArticle | null> {
  // slug приходит из URL — валидируем по тому же формату, что БД-констрейнт,
  // прежде чем подставлять в запрос.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/articles_public?select=${ARTICLE_FIELDS}&slug=eq.${slug}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/vnd.pgrst.object+json",
        },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.title ? (data as FullArticle) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Заметка — SmartCook" };
  const title = `${article.title} — SmartCook`;
  const description = article.excerpt;
  return {
    title,
    description,
    alternates: { canonical: `https://smart-cook.pro/articles/${article.slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      siteName: "SmartCook",
      url: `https://smart-cook.pro/articles/${article.slug}`,
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);

  if (!article) {
    return (
      <div className="container">
        <AppNavigation activeSection="daily" />
        <div className="card" style={{ marginTop: "var(--space-5)", textAlign: "center" }}>
          <h1 className="recipe-title" style={{ marginBottom: "var(--space-2)" }}>
            Заметка не найдена
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-4)" }}>
            Возможно, ссылка устарела или заметку сняли с публикации.
          </p>
          <Link href="/articles" className="btn-primary" style={{ display: "inline-flex", width: "auto" }}>
            Все заметки
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <AppNavigation activeSection="daily" />

      <article style={{ margin: "var(--space-3) 0 var(--space-5)" }}>
        <Link href="/articles" className="articles-all" style={{ marginBottom: "var(--space-3)" }}>
          <ArrowLeft size={15} />
          Все заметки
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", margin: "var(--space-3) 0 var(--space-2)" }}>
          <div className="article-tile article-tile-green" aria-hidden>
            <span className="article-emoji">{article.emoji_icon || "📝"}</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)", fontWeight: "var(--font-weight-medium)" }}>
              Команда SmartCook
            </div>
            <div className="article-read" style={{ marginTop: "2px" }}>
              <Clock size={13} />
              {article.read_minutes} мин чтения
            </div>
          </div>
        </div>

        <h1 style={{ fontSize: "var(--font-size-title)", fontWeight: 700, lineHeight: 1.25, margin: "0 0 var(--space-2)", color: "var(--color-text)" }}>
          {article.title}
        </h1>
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--color-text-secondary)", fontSize: "var(--font-size-body)" }}>
          {article.excerpt}
        </p>

        <ArticleLikeButton articleId={article.id} slug={article.slug} initialLikes={article.likes_count} />

        <div
          className="article-prose"
          style={{ marginTop: "var(--space-4)" }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
        />

        {/* CTA: заметка ведёт к главному действию сервиса. */}
        <div className="article-cta">
          <div className="article-cta-text">Что приготовить из ваших продуктов?</div>
          <Link href="/search?focus=photo" className="btn-primary article-cta-btn">
            Подобрать рецепт
            <ArrowRight size={16} />
          </Link>
        </div>
      </article>
    </div>
  );
}
