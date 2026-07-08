"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Heart, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import { type Article, ARTICLE_COLUMNS } from "@/lib/articles";
import { coverTone } from "@/lib/articleCover";

// Блок «Кухонные заметки» — статьи с лайками. Данные (без тела) приходят ПРОПОМ
// initialItems из серверного компонента (SSR, как витрина/новости) → блок в HTML
// сразу. На клиенте перечитываем ТОЛЬКО у залогиненного, чтобы подтянуть его
// liked_by_me (в SSR под anon он всегда false) — тот же приём, что в HomeFeed.
//
// Источник — публичный view articles_public: не отдаёт список лайкнувших,
// счётчик — агрегат. Лайк — только залогиненным (аноним → мягкий вход с
// return-путём). Автор у всех один — «Команда SmartCook» (в UI, не в БД).
// Тип Article и ARTICLE_COLUMNS живут в @/lib/articles (обычный модуль): их
// импортируют и серверные компоненты, а из "use client"-модуля значение
// приходило бы в SSR как заглушка client-reference (ломало запрос заметок).
// Обложки (Z-3) — пастельный тон по хэшу slug (coverTone), в стиле Notion.

export default function ArticlesBoard({
  initialItems,
  variant = "home",
  returnPath = "/",
}: {
  initialItems: Article[];
  variant?: "home" | "list";
  returnPath?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Article[]>(initialItems);
  const [userId, setUserId] = useState<string | null>(null);

  const limit = variant === "home" ? 3 : 50;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("articles_public")
      .select(ARTICLE_COLUMNS)
      .limit(limit);
    if (!error && data) setItems(data as Article[]);
  }, [limit]);

  // Только для залогиненного: синхронизируем его лайки поверх SSR-данных.
  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

  const toggleLike = async (item: Article) => {
    // Лайкать может только залогиненный. Аноним → мягкая подсказка + вход,
    // return-путь обратно туда, где он был.
    if (!userId) {
      reachGoal("article_like_login_prompt");
      toast("Войдите, чтобы лайкать — имя и пароль, без email, 30 секунд");
      router.push("/search?auth=register&return=" + encodeURIComponent(returnPath));
      return;
    }
    const liked = item.liked_by_me;
    setItems((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? { ...p, liked_by_me: !liked, likes_count: Math.max(0, p.likes_count + (liked ? -1 : 1)) }
          : p,
      ),
    );
    try {
      if (liked) {
        await supabase.from("article_likes").delete().match({ article_id: item.id, user_ref: userId });
      } else {
        await supabase.from("article_likes").insert({ article_id: item.id, user_ref: userId });
        reachGoal("article_like");
      }
    } catch {
      load(); // рассинхрон — перечитываем правду из view
    }
  };

  const visible = items.slice(0, limit);
  // Пустое состояние: блок на Главной не показываем вовсе.
  if (variant === "home" && visible.length === 0) return null;

  const cards = (
    <div className="articles-grid">
      {visible.map((item) => {
        const tone = coverTone(item.slug);
        return (
          <article key={item.id} className="article-card">
            {/* Обложка в стиле Notion (Z-3): пастельный тон по slug, крупная
                эмодзи и заголовок прямо на плитке — вместо фото. */}
            <Link
              href={`/articles/${item.slug}`}
              className="article-cover"
              style={{ background: tone.bg }}
            >
              <span className="article-cover-emoji" aria-hidden>
                {item.emoji_icon || "📝"}
              </span>
              <span className="article-cover-title" style={{ color: tone.fg }}>
                {item.title}
              </span>
            </Link>
            <div className="article-card-under">
              <Link href={`/articles/${item.slug}`} className="article-card-excerpt-link">
                <p className="article-card-excerpt">{item.excerpt}</p>
              </Link>
              <div className="article-card-meta">
                <span className="article-read">
                  <Clock size={13} />
                  {item.read_minutes} мин
                </span>
                <button
                  type="button"
                  className={`feed-like${item.liked_by_me ? " feed-like-active" : ""}`}
                  onClick={() => toggleLike(item)}
                  aria-label={item.liked_by_me ? "Убрать лайк" : "Лайкнуть"}
                >
                  <Heart size={16} fill={item.liked_by_me ? "currentColor" : "none"} />
                  <span>{item.likes_count}</span>
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );

  if (variant === "list") return cards;

  return (
    <section className="articles-board">
      <div className="articles-head">
        <h2 className="section-title" style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
          <BookOpen size={20} color="var(--color-accent)" />
          Кухонные заметки
        </h2>
        <Link href="/articles" className="articles-all">
          Все заметки
          <ArrowRight size={15} />
        </Link>
      </div>
      {cards}
    </section>
  );
}
