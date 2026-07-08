"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";

// Лайк на странице статьи. Данные из SSR (initialLikes под anon → liked=false),
// у залогиненного досинхронизируем свой лайк из view articles_public. Лайк —
// только залогиненным (аноним → мягкий вход с return на эту же статью).
// Заодно фиксируем цель article_open один раз при открытии страницы.
export default function ArticleLikeButton({
  articleId,
  slug,
  initialLikes,
}: {
  articleId: string;
  slug: string;
  initialLikes: number;
}) {
  const router = useRouter();
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    reachGoal("article_open");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  // У залогиненного подтягиваем актуальный счётчик и его liked_by_me.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from("articles_public")
      .select("likes_count,liked_by_me")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setLikes(data.likes_count as number);
          setLiked(Boolean(data.liked_by_me));
        }
      });
  }, [userId, slug]);

  const toggle = async () => {
    if (!userId) {
      reachGoal("article_like_login_prompt");
      toast("Войдите, чтобы лайкать — имя и пароль, без email, 30 секунд");
      router.push("/search?auth=register&return=" + encodeURIComponent(`/articles/${slug}`));
      return;
    }
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((n) => Math.max(0, n + (wasLiked ? -1 : 1)));
    try {
      if (wasLiked) {
        await supabase.from("article_likes").delete().match({ article_id: articleId, user_ref: userId });
      } else {
        await supabase.from("article_likes").insert({ article_id: articleId, user_ref: userId });
        reachGoal("article_like");
      }
    } catch {
      // рассинхрон — откатываем оптимистичное изменение
      setLiked(wasLiked);
      setLikes((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={`article-like-btn${liked ? " article-like-btn-active" : ""}`}
      aria-label={liked ? "Убрать лайк" : "Лайкнуть"}
    >
      <Heart size={18} fill={liked ? "currentColor" : "none"} />
      <span>{likes}</span>
    </button>
  );
}
