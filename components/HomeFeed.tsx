"use client";

import { useCallback, useEffect, useState } from "react";
import { ChefHat, Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";

// Витрина «Приготовили сегодня» (лента v1). Данные — ТОЛЬКО из публичного view
// feed_photos_public (не раскрывает user_ref, счётчик лайков — агрегат).
// Сортировка на стороне view: сегодняшние сверху, затем вчерашние.
type FeedPhoto = {
  id: string;
  created_at: string;
  user_name: string | null;
  recipe_title: string | null;
  photo_url: string;
  likes_count: number;
  liked_by_me: boolean;
};

export default function HomeFeed() {
  const router = useRouter();
  const [items, setItems] = useState<FeedPhoto[] | null>(null); // null = загрузка
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("feed_photos_public").select("*").limit(20);
    setItems(error ? [] : ((data as FeedPhoto[]) ?? []));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleLike = async (item: FeedPhoto) => {
    // Лайкать может только залогиненный. Аноним → мягкая подсказка + вход,
    // return-путь обратно на Главную к ленте.
    if (!userId) {
      reachGoal("feed_like_login_prompt");
      toast("Войдите, чтобы лайкать — имя и пароль, без email, 30 секунд");
      router.push("/search?auth=register&return=" + encodeURIComponent("/"));
      return;
    }
    const liked = item.liked_by_me;
    setItems(
      (prev) =>
        prev?.map((p) =>
          p.id === item.id ? { ...p, liked_by_me: !liked, likes_count: Math.max(0, p.likes_count + (liked ? -1 : 1)) } : p,
        ) ?? prev,
    );
    try {
      if (liked) {
        await supabase.from("feed_photo_likes").delete().match({ photo_id: item.id, user_ref: userId });
      } else {
        await supabase.from("feed_photo_likes").insert({ photo_id: item.id, user_ref: userId });
        reachGoal("feed_like");
      }
    } catch {
      load(); // рассинхрон — перечитываем правду из view
    }
  };

  // Загрузка — не мигаем: ничего не рисуем, пока данных нет.
  if (items === null) return null;

  return (
    <section className="home-feed">
      <h2 className="section-title">Приготовили сегодня</h2>

      {items.length === 0 ? (
        <div className="feed-empty">
          <div className="feed-empty-icon">
            <ChefHat size={28} />
          </div>
          <p className="feed-empty-text">
            Здесь появятся блюда, которые приготовили сегодня. Приготовьте первым!
          </p>
          <button type="button" className="btn-primary feed-empty-cta" onClick={() => router.push("/search")}>
            Найти рецепт
          </button>
        </div>
      ) : (
        <div className="feed-grid">
          {items.map((item) => (
            <article key={item.id} className="feed-card">
              <img className="feed-card-photo" src={item.photo_url} alt={item.recipe_title || "Блюдо"} loading="lazy" />
              <div className="feed-card-body">
                <div className="feed-card-title">{item.recipe_title || "Блюдо"}</div>
                <div className="feed-card-meta">
                  <span className="feed-card-user">{item.user_name || "Гость"}</span>
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
          ))}
        </div>
      )}
    </section>
  );
}
