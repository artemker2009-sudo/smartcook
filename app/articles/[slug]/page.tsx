import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import AppNavigation from "@/components/AppNavigation";
import ArticleLikeButton from "@/components/ArticleLikeButton";
import { renderMarkdown } from "@/lib/markdown";
import { coverTone } from "@/lib/articleCover";

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
      // Та же болезнь, что была у /recipe/[id]: заданный здесь openGraph не
      // добирает images из корневого layout, и ссылка на заметку уходила в чат
      // без картинки. Своей картинки у заметок нет (обложка рисуется на клиенте
      // из эмодзи и тона по slug), поэтому — брендовая.
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "SmartCook — кухонные заметки",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
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

        {/* Обложка в стиле Notion (Z-3): пастельный тон по slug, крупная эмодзи
            и заголовок прямо на плитке — вместо фото. */}
        <div className="article-hero" style={{ background: coverTone(article.slug).bg }}>
          <span className="article-hero-emoji" aria-hidden>{article.emoji_icon || "📝"}</span>
          <h1 className="article-hero-title" style={{ color: coverTone(article.slug).fg }}>
            {article.title}
          </h1>
        </div>

        <div className="article-byline">
          <span className="article-byline-team">Команда SmartCook</span>
          <span className="article-read">
            <Clock size={13} />
            {article.read_minutes} мин чтения
          </span>
        </div>

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
