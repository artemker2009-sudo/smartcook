"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import { feedWindowStartISO, partitionFeedWindow } from "@/lib/feedWindow";
import {
  FeedActionSheet,
  FeedReportModal,
  submitFeedReport,
  useBlockedAuthors,
} from "@/components/FeedModeration";

// Витрина «Приготовили сегодня» (лента v1). Данные — ТОЛЬКО из публичного view
// feed_photos_public (не раскрывает user_ref, счётчик лайков — агрегат).
// Сортировка на стороне view: сегодняшние сверху, затем вчерашние.
// Первые фото приходят ПРОПОМ initialItems из серверного компонента (этап 10 W) →
// витрина в HTML сразу. На клиенте перечитываем ТОЛЬКО у залогиненного, чтобы
// подтянуть его liked_by_me (в SSR под anon он всегда false).
export type FeedPhoto = {
  id: string;
  created_at: string;
  user_name: string | null;
  recipe_title: string | null;
  recipe_id: number | null;
  photo_url: string;
  likes_count: number;
  liked_by_me: boolean;
};

const FEED_COLUMNS =
  "id,created_at,user_name,recipe_title,recipe_id,photo_url,likes_count,liked_by_me";

export default function HomeFeed({ initialItems }: { initialItems: FeedPhoto[] }) {
  const router = useRouter();
  const [items, setItems] = useState<FeedPhoto[]>(initialItems);
  const [userId, setUserId] = useState<string | null>(null);

  // Пользовательская модерация витрины (App Store 1.2). Ровно то же меню, что
  // и в Ленте сообщества: общие компоненты и общий чёрный список авторов.
  const [menuPhotoId, setMenuPhotoId] = useState<string | null>(null);
  const [reportPhoto, setReportPhoto] = useState<FeedPhoto | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  const { blockAuthor, filterBlocked } = useBlockedAuthors();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    // Тот же оконный запрос, что и в SSR (app/page.tsx): последние сутки окна по
    // МСК, свежие сверху. Нужен, чтобы у залогиненного подтянуть liked_by_me,
    // не ломая набор фото и режим витрины.
    const { data, error } = await supabase
      .from("feed_photos_public")
      .select(FEED_COLUMNS)
      .gte("created_at", feedWindowStartISO())
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && data) setItems(data as FeedPhoto[]);
  }, []);

  // Только для залогиненного: синхронизируем его лайки поверх SSR-данных.
  useEffect(() => {
    if (userId) load();
  }, [userId, load]);

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

  // Жалоба на фото витрины. Личность серверу не передаём — он берёт её из
  // JWT/cookie. У пожаловавшегося фото сразу исчезает из его витрины.
  const submitReport = async () => {
    if (!reportPhoto || isReporting) return;
    setIsReporting(true);
    const hiddenId = reportPhoto.id;
    const ok = await submitFeedReport({ photoId: hiddenId }, reportReason);
    setIsReporting(false);
    if (!ok) {
      toast.error("Не удалось отправить жалобу");
      return;
    }
    reachGoal("showcase_photo_report");
    setItems((prev) => prev.filter((p) => p.id !== hiddenId));
    toast.success("Спасибо, жалоба отправлена на модерацию");
    setReportPhoto(null);
    setReportReason("");
  };

  // Открытие рецепта из витрины (тап по фото или кнопка «К рецепту»). Цель
  // Метрики нужна для решения о полноценной ленте — меряем интерес к фото даже
  // когда рецепта под ним нет (recipe_id === null → просто сигнал, без перехода).
  const openRecipe = (item: FeedPhoto) => {
    reachGoal("showcase_photo_open");
    if (item.recipe_id) router.push(`/recipe/${item.recipe_id}`);
  };

  // Режим и набор фото по факту наполнения: «сегодня» либо фолбэк «на этой
  // неделе». Пустое окно → витрину не рендерим совсем (лучше ничего, чем врать).
  const { mode, items: windowItems } = partitionFeedWindow(items);
  // Скрытые автором-блок-листом фото убираем ПОСЛЕ окна: иначе витрина могла бы
  // молча переключиться в режим «на этой неделе» из-за локального скрытия.
  const visibleItems = filterBlocked(windowItems);
  const menuPhoto = menuPhotoId ? items.find((p) => p.id === menuPhotoId) ?? null : null;
  if (visibleItems.length === 0) return null;

  return (
    <section className="home-feed">
      <h2 className="section-title">{mode === "today" ? "Приготовили сегодня" : "Приготовили на этой неделе"}</h2>

      <div className="feed-grid">
        {visibleItems.map((item) => (
          <article key={item.id} className="feed-card">
            <img
              className="feed-card-photo"
              src={item.photo_url}
              alt={item.recipe_title || "Блюдо"}
              loading="lazy"
              style={{ cursor: "pointer" }}
              onClick={() => openRecipe(item)}
            />
            {/* «⋯» поверх фото, а не в строке автора: карточка витрины вдвое уже
                поста ленты, и третий элемент в meta-строке выдавливал бы имя.
                Зона тапа 44px, кружок-подложка — чтобы иконка читалась на любом
                снимке. Само меню — общий нижний лист (см. FeedModeration). */}
            <button
              type="button"
              className="feed-card-menu"
              aria-label="Действия с публикацией"
              aria-haspopup="menu"
              onClick={() => setMenuPhotoId(item.id)}
            >
              <MoreHorizontal size={18} />
            </button>
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
              {item.recipe_id ? (
                <button type="button" className="feed-card-recipe-link" onClick={() => openRecipe(item)}>
                  К рецепту
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {/* Меню действий и жалоба — те же компоненты, что и в Ленте сообщества. */}
      {menuPhoto && (
        <FeedActionSheet
          title={menuPhoto.recipe_title || "Блюдо"}
          authorName={menuPhoto.user_name || "Гость"}
          onReport={() => {
            setMenuPhotoId(null);
            setReportPhoto(menuPhoto);
            setReportReason("");
          }}
          onBlockAuthor={() => {
            setMenuPhotoId(null);
            blockAuthor(menuPhoto.user_name);
          }}
          onClose={() => setMenuPhotoId(null)}
        />
      )}

      {reportPhoto && (
        <FeedReportModal
          isSending={isReporting}
          reason={reportReason}
          onReasonChange={setReportReason}
          onSubmit={submitReport}
          onClose={() => setReportPhoto(null)}
        />
      )}
    </section>
  );
}
