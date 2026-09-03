"use client";

import { useCallback, useEffect, useRef, useState, ChangeEvent } from "react";
import { Heart, ImagePlus, Loader2, Clock, CheckCircle2, XCircle, Trash2, MoreHorizontal, Flag, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import { preparePhoto, reportPhotoError } from "@/lib/photo";

// Лента сообщества (премодерируемая). Публичные данные — ТОЛЬКО из view
// community_posts_public (не раскрывает user_ref/status, счётчик лайков —
// агрегат, показываются лишь одобренные). Свои посты «на модерации»/«отклонено»
// автор видит отдельным запросом к таблице по RLS (select own).
export type CommunityPost = {
  id: string;
  created_at: string;
  user_name: string | null;
  recipe_title: string | null;
  recipe_id: number | null;
  photo_url: string;
  caption: string | null;
  likes_count: number;
  liked_by_me: boolean;
};

type MyPost = {
  id: string;
  created_at: string;
  recipe_title: string | null;
  photo_url: string;
  caption: string | null;
  status: "pending" | "approved" | "rejected";
};

const PUBLIC_COLUMNS =
  "id,created_at,user_name,recipe_title,recipe_id,photo_url,caption,likes_count,liked_by_me";

const CAPTION_MAX = 300;
const TITLE_MAX = 200;

export default function CommunityFeed({ initialItems }: { initialItems: CommunityPost[] }) {
  const router = useRouter();
  const [items, setItems] = useState<CommunityPost[]>(initialItems);
  const [userId, setUserId] = useState<string | null>(null);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);

  // Компоновщик поста.
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authChecked, setAuthChecked] = useState(false);

  // Модерация со стороны пользователя (App Store 1.2).
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<CommunityPost | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [isReporting, setIsReporting] = useState(false);
  // «Скрыть автора» — локальный чёрный список по отображаемому имени (user_ref
  // наружу не отдаётся). Живёт на устройстве, серверу не нужен.
  const [blockedAuthors, setBlockedAuthors] = useState<string[]>([]);
  // Публикация требует согласия с правилами.
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("sc_blocked_authors") || "[]");
      if (Array.isArray(raw)) setBlockedAuthors(raw.filter((x) => typeof x === "string"));
    } catch {}
  }, []);

  const loadPublic = useCallback(async () => {
    const { data, error } = await supabase
      .from("community_posts_public")
      .select(PUBLIC_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(60);
    if (!error && data) setItems(data as CommunityPost[]);
  }, []);

  // Свои посты (в т.ч. на модерации/отклонённые) — RLS отдаёт только владельцу.
  const loadMine = useCallback(async () => {
    const { data, error } = await supabase
      .from("community_posts")
      .select("id,created_at,recipe_title,photo_url,caption,status")
      .order("created_at", { ascending: false })
      .limit(30);
    if (!error && data) setMyPosts(data as MyPost[]);
  }, []);

  // У залогиненного: подтягиваем liked_by_me поверх SSR-данных и свои посты.
  useEffect(() => {
    if (userId) {
      loadPublic();
      loadMine();
    }
  }, [userId, loadPublic, loadMine]);

  // У гостя liked_by_me из view всегда false (в SQL гостя не опознать) —
  // спрашиваем свои лайки у роута по httpOnly-cookie. Если cookie ещё нет
  // (человек ни разу не лайкал), ответ пустой и новых cookie не появляется.
  useEffect(() => {
    if (!authChecked || userId) return;
    let cancelled = false;
    fetch("/api/feed/like")
      .then((r) => (r.ok ? r.json() : { likedPostIds: [] }))
      .then((json: { likedPostIds?: string[] }) => {
        const liked = new Set(json.likedPostIds ?? []);
        if (cancelled || liked.size === 0) return;
        setItems((prev) => prev.map((p) => (liked.has(p.id) ? { ...p, liked_by_me: true } : p)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authChecked, userId]);

  // Лайк работает БЕЗ регистрации. Пишем не напрямую в таблицу, а через
  // серверный роут: личность гостя он берёт из httpOnly-cookie (сам её и
  // выдаёт при первом лайке), там же лимит по частоте и склейка гостевого
  // лайка с аккаунтом. Прямых anon-политик на запись в RLS нет специально.
  const toggleLike = async (item: CommunityPost) => {
    const liked = item.liked_by_me;
    // Оптимистично — сердечко и счётчик реагируют мгновенно; сервер вернёт
    // точное число и мы его применим.
    setItems((prev) =>
      prev.map((p) =>
        p.id === item.id
          ? { ...p, liked_by_me: !liked, likes_count: Math.max(0, p.likes_count + (liked ? -1 : 1)) }
          : p,
      ),
    );
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/feed/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ postId: item.id, like: !liked }),
      });
      if (!res.ok) throw new Error("like failed");
      const json = (await res.json()) as { liked: boolean; likesCount: number };
      // Единственная точка отправки цели — после успешного ответа роута,
      // одинаково для гостя и залогиненного.
      reachGoal("feed_like_click");
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, liked_by_me: json.liked, likes_count: json.likesCount } : p,
        ),
      );
    } catch {
      // Откатываем оптимистичное состояние фактическим.
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id
            ? { ...p, liked_by_me: liked, likes_count: item.likes_count }
            : p,
        ),
      );
      toast.error("Не удалось поставить лайк");
    }
  };

  const openPost = (item: CommunityPost) => {
    reachGoal("feed_photo_open");
    if (item.recipe_id) router.push(`/recipe/${item.recipe_id}`);
  };

  const openCompose = () => {
    if (!userId) {
      toast("Войдите, чтобы поделиться блюдом — имя и пароль, без email");
      router.push("/search?auth=register&return=" + encodeURIComponent("/feed"));
      return;
    }
    setIsComposeOpen(true);
  };

  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsPreparing(true);
    try {
      // Тот же пайплайн, что у витрины: сжатие + чистка EXIF (см. lib/photo.ts).
      const finalFile = await preparePhoto(
        files[0],
        { maxSizeMB: 1, maxWidthOrHeight: 1080, useWebWorker: false },
        `post_${Date.now()}.jpg`,
      );
      setPhotoFile(finalFile);
      setPhotoPreview(URL.createObjectURL(finalFile));
    } catch (error) {
      void reportPhotoError("post", files[0], error);
      toast.error("Не удалось обработать фото");
      setPhotoFile(null);
      setPhotoPreview(null);
    } finally {
      setIsPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetCompose = () => {
    setIsComposeOpen(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setTitle("");
    setCaption("");
    setAgree(false);
  };

  // Жалоба на пост. Личность серверу не передаём — он берёт её из JWT/cookie.
  // У пожаловавшегося пост сразу исчезает из его ленты (оптимистично).
  const submitReport = async () => {
    if (!reportPost || isReporting) return;
    setIsReporting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/feed/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ postId: reportPost.id, reason: reportReason.trim() || null }),
      });
      if (!res.ok) throw new Error("report failed");
      reachGoal("feed_post_report");
      const hiddenId = reportPost.id;
      setItems((prev) => prev.filter((p) => p.id !== hiddenId));
      toast.success("Спасибо, жалоба отправлена на модерацию");
      setReportPost(null);
      setReportReason("");
    } catch {
      toast.error("Не удалось отправить жалобу");
    } finally {
      setIsReporting(false);
    }
  };

  // Скрыть все публикации автора (локально, на этом устройстве).
  const blockAuthor = (name: string | null) => {
    const key = (name || "").trim().toLowerCase();
    setMenuPostId(null);
    if (!key) return;
    const next = Array.from(new Set([...blockedAuthors, key]));
    setBlockedAuthors(next);
    try {
      localStorage.setItem("sc_blocked_authors", JSON.stringify(next));
    } catch {}
    reachGoal("feed_author_block");
    toast.success("Публикации этого автора скрыты");
  };

  const submitPost = async () => {
    if (!userId) return;
    if (!photoFile) {
      toast.error("Сначала выберите фото");
      return;
    }
    setIsSubmitting(true);
    try {
      // 1) Загружаем фото в тот же публичный бакет, что и витрина. Имя файла —
      //    случайный id (не светим идентификаторы в URL).
      const fileName = `${crypto.randomUUID()}.jpg`;
      const buffer = await photoFile.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from("feed_photos")
        .upload(fileName, buffer, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("feed_photos").getPublicUrl(fileName);

      // 2) Создаём пост через сервер (владелец из проверенной сессии, санитизация,
      //    отправка на модерацию в Telegram). Пробрасываем JWT.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const displayName =
        (sess.session?.user?.user_metadata?.full_name as string) ||
        (sess.session?.user?.user_metadata?.username as string) ||
        "Гость";

      const res = await fetch("/api/feed/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          photoUrl: pub.publicUrl,
          userName: displayName,
          recipeTitle: title.trim().slice(0, TITLE_MAX) || null,
          caption: caption.trim().slice(0, CAPTION_MAX) || null,
        }),
      });
      if (!res.ok) throw new Error("submit failed");

      reachGoal("feed_post_submit");
      toast.success("Отправлено на модерацию — появится в ленте после одобрения");
      resetCompose();
      loadMine();
    } catch {
      toast.error("Не удалось опубликовать. Попробуйте позже");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMyPost = async (id: string) => {
    if (!confirm("Удалить этот пост?")) return;
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) throw error;
      setMyPosts((prev) => prev.filter((p) => p.id !== id));
      setItems((prev) => prev.filter((p) => p.id !== id));
      toast.success("Пост удалён");
    } catch {
      toast.error("Не удалось удалить");
    }
  };

  const statusBadge = (status: MyPost["status"]) => {
    if (status === "approved")
      return { text: "В ленте", color: "var(--color-success)", icon: <CheckCircle2 size={12} /> };
    if (status === "rejected")
      return { text: "Отклонено", color: "var(--color-danger)", icon: <XCircle size={12} /> };
    return { text: "На модерации", color: "var(--color-warning)", icon: <Clock size={12} /> };
  };

  // Пост, для которого открыт нижний лист действий.
  const menuPost = menuPostId ? items.find((p) => p.id === menuPostId) ?? null : null;

  // Публичная лента за вычетом скрытых авторов (локальный блок-лист).
  const visibleItems =
    blockedAuthors.length === 0
      ? items
      : items.filter((p) => !blockedAuthors.includes((p.user_name || "").trim().toLowerCase()));

  return (
    <section className="home-feed" style={{ paddingBottom: "var(--space-6)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <h2 className="section-title" style={{ marginBottom: 0 }}>Лента сообщества</h2>
        <button
          type="button"
          onClick={openCompose}
          style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
            background: "var(--color-accent)", color: "white", border: "none",
            padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius-full)",
            fontWeight: "var(--font-weight-semibold)", fontSize: "var(--font-size-caption)", cursor: "pointer",
          }}
        >
          <ImagePlus size={16} /> Поделиться
        </button>
      </div>

      {/* Мои посты на модерации/отклонённые (видны только автору) */}
      {myPosts.some((p) => p.status !== "approved") && (
        <div style={{ margin: "var(--space-3) 0" }}>
          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-2)" }}>
            Мои публикации
          </div>
          <div className="feed-grid">
            {myPosts
              .filter((p) => p.status !== "approved")
              .map((p) => {
                const badge = statusBadge(p.status);
                return (
                  <article key={p.id} className="feed-card">
                    <img className="feed-card-photo" src={p.photo_url} alt={p.recipe_title || "Блюдо"} loading="lazy" />
                    <div className="feed-card-body">
                      <div className="feed-card-title">{p.recipe_title || "Блюдо"}</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)", marginTop: "var(--space-1)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "var(--font-size-caption)", color: badge.color, fontWeight: "var(--font-weight-semibold)" }}>
                          {badge.icon} {badge.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteMyPost(p.id)}
                          aria-label="Удалить пост"
                          style={{ background: "var(--color-danger-subtle)", border: "none", color: "var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "4px", cursor: "pointer", display: "flex" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
          </div>
        </div>
      )}

      {/* Публичная лента (одобренные) */}
      {visibleItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "var(--space-5) var(--space-3)", color: "var(--color-text-secondary)" }}>
          <ImagePlus size={32} style={{ display: "block", margin: "0 auto var(--space-2) auto", opacity: 0.6 }} />
          <div style={{ color: "var(--color-text)", fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>Пока пусто</div>
          <div style={{ fontSize: "var(--font-size-caption)" }}>Станьте первым — поделитесь фото своего блюда.</div>
        </div>
      ) : (
        // Полноширинная лента (Instagram-стиль): одна колонка, фото крупно с
        // сохранением пропорций (без кропа в квадрат). Классы feed-post-*
        // отдельные от сетки витрины (.feed-card на Главной), чтобы её не задеть.
        <div className="feed-list" style={{ marginTop: "var(--space-3)" }}>
          {visibleItems.map((item) => (
            <article key={item.id} className="feed-post">
              <img
                className="feed-post-photo"
                src={item.photo_url}
                alt={item.recipe_title || "Блюдо"}
                loading="lazy"
                style={{ cursor: item.recipe_id ? "pointer" : "default" }}
                onClick={() => openPost(item)}
              />
              <div className="feed-post-body">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-2)" }}>
                  <span className="feed-post-user">{item.user_name || "Гость"}</span>
                  {/* Меню действий открывается нижним листом (см. ниже), а не
                      выпадающим списком: внутри карточки список упирался в её
                      нижний край и «Скрыть автора» обрезалось на последнем посте. */}
                  <button
                    type="button"
                    aria-label="Действия с публикацией"
                    aria-haspopup="menu"
                    onClick={() => setMenuPostId(item.id)}
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: "44px", height: "44px", margin: "-10px -10px -10px 0" }}
                  >
                    <MoreHorizontal size={20} />
                  </button>
                </div>
                <div className="feed-post-title">{item.recipe_title || "Блюдо"}</div>
                {item.caption ? (
                  <div className="feed-post-caption">{item.caption}</div>
                ) : null}
                <div className="feed-post-actions">
                  <button
                    type="button"
                    className={`feed-like${item.liked_by_me ? " feed-like-active" : ""}`}
                    onClick={() => toggleLike(item)}
                    aria-label={item.liked_by_me ? "Убрать лайк" : "Лайкнуть"}
                  >
                    <Heart size={18} fill={item.liked_by_me ? "currentColor" : "none"} />
                    <span>{item.likes_count}</span>
                  </button>
                  {item.recipe_id ? (
                    <button type="button" className="feed-card-recipe-link" onClick={() => openPost(item)}>
                      К рецепту
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Компоновщик */}
      {isComposeOpen && (
        <div
          onClick={resetCompose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--color-surface)", width: "100%", maxWidth: "520px", borderTopLeftRadius: "var(--radius-md)", borderTopRightRadius: "var(--radius-md)", padding: "var(--space-4)", maxHeight: "90vh", overflowY: "auto" }}
          >
            <h3 style={{ margin: "0 0 var(--space-3) 0", color: "var(--color-text)" }}>Поделиться блюдом</h3>

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />

            {photoPreview ? (
              <img src={photoPreview} alt="Превью" style={{ width: "100%", borderRadius: "var(--radius-sm)", marginBottom: "var(--space-3)", maxHeight: "320px", objectFit: "cover" }} />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPreparing}
                style={{ width: "100%", padding: "var(--space-5)", borderRadius: "var(--radius-sm)", border: "1px dashed var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}
              >
                {isPreparing ? <Loader2 size={24} className="animate-spin" /> : <ImagePlus size={24} />}
                {isPreparing ? "Обрабатываем фото…" : "Выберите фото"}
              </button>
            )}

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="Название блюда (необязательно)"
              style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", marginBottom: "var(--space-2)", fontSize: "var(--font-size-body)" }}
            />
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, CAPTION_MAX))}
              placeholder="Подпись (необязательно)"
              rows={3}
              style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", marginBottom: "var(--space-1)", fontSize: "var(--font-size-body)", resize: "vertical" }}
            />
            <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-muted)", marginBottom: "var(--space-3)" }}>
              Пост появится в ленте после проверки модератором.
            </div>

            {/* Согласие с правилами (App Store 1.2 — EULA + запрет оскорбительного
                контента). Без галочки публикация недоступна. */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", marginBottom: "var(--space-3)", cursor: "pointer", fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                style={{ marginTop: "2px", flexShrink: 0, width: "16px", height: "16px", accentColor: "var(--color-accent)" }}
              />
              <span>
                Это моё фото. Публикуя, я соглашаюсь с{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", fontWeight: "var(--font-weight-semibold)" }}>правилами</a>{" "}
                и подтверждаю, что контент не оскорбителен и не нарушает прав других людей.
              </span>
            </label>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                onClick={resetCompose}
                style={{ flex: 1, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer" }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submitPost}
                disabled={isSubmitting || isPreparing || !photoFile || !agree}
                style={{ flex: 2, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "none", background: "var(--color-accent)", color: "white", fontWeight: "var(--font-weight-semibold)", cursor: isSubmitting || !photoFile || !agree ? "default" : "pointer", opacity: isSubmitting || !photoFile || !agree ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)" }}
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                Отправить на модерацию
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Меню действий с публикацией — нижний лист, как у выбора фото.
          Рендерится один на всю ленту и позиционируется от низа ЭКРАНА, поэтому
          не зависит от того, первый это пост или последний, и не может быть
          обрезан карточкой. Пункты — по 56px, крупные зоны тапа. */}
      {menuPost && (
        <div
          onClick={() => setMenuPostId(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="menu"
            style={{ background: "var(--color-surface)", width: "100%", maxWidth: "520px", borderTopLeftRadius: "var(--radius-md)", borderTopRightRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-3) calc(env(safe-area-inset-bottom) + var(--space-3)) var(--space-3)" }}
          >
            <div style={{ padding: "var(--space-2) var(--space-2) var(--space-3) var(--space-2)", borderBottom: "1px solid var(--color-border)", marginBottom: "var(--space-2)" }}>
              <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text)", fontSize: "var(--font-size-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {menuPost.recipe_title || "Блюдо"}
              </div>
              <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                {menuPost.user_name || "Гость"}
              </div>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuPostId(null); setReportPost(menuPost); setReportReason(""); }}
              style={{ width: "100%", minHeight: "56px", textAlign: "left", padding: "0 var(--space-2)", background: "none", border: "none", borderRadius: "var(--radius-sm)", color: "var(--color-text)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-medium)", cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-3)" }}
            >
              <Flag size={20} color="var(--color-danger)" /> Пожаловаться
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => blockAuthor(menuPost.user_name)}
              style={{ width: "100%", minHeight: "56px", textAlign: "left", padding: "0 var(--space-2)", background: "none", border: "none", borderRadius: "var(--radius-sm)", color: "var(--color-text)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-medium)", cursor: "pointer", display: "flex", alignItems: "center", gap: "var(--space-3)" }}
            >
              <EyeOff size={20} color="var(--color-text-secondary)" /> Скрыть автора
            </button>

            <button
              type="button"
              onClick={() => setMenuPostId(null)}
              style={{ width: "100%", minHeight: "56px", marginTop: "var(--space-2)", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", color: "var(--color-text-secondary)", fontSize: "var(--font-size-body)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer" }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Модалка жалобы (App Store 1.2). Причина необязательна. */}
      {reportPost && (
        <div
          onClick={() => !isReporting && setReportPost(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-3)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--color-surface)", width: "100%", maxWidth: "400px", borderRadius: "var(--radius-md)", padding: "var(--space-4)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
              <Flag size={20} color="var(--color-danger)" />
              <h3 style={{ margin: 0, color: "var(--color-text)", fontSize: "var(--font-size-heading)", fontWeight: "var(--font-weight-semibold)" }}>Пожаловаться</h3>
            </div>
            <p style={{ margin: "0 0 var(--space-3) 0", fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Расскажите, что не так с этой публикацией. Мы проверим её в течение суток.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
              {["Спам", "Оскорбления", "Не еда", "Чужое фото", "Другое"].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReportReason(r)}
                  style={{ padding: "var(--space-1) var(--space-3)", borderRadius: "var(--radius-full)", border: "1px solid " + (reportReason === r ? "var(--color-accent)" : "var(--color-border)"), background: reportReason === r ? "var(--color-accent-subtle)" : "var(--color-bg)", color: reportReason === r ? "var(--color-accent)" : "var(--color-text-secondary)", fontSize: "var(--font-size-caption)", fontWeight: "var(--font-weight-semibold)", cursor: "pointer" }}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value.slice(0, 300))}
              placeholder="Комментарий (необязательно)"
              rows={2}
              style={{ width: "100%", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "var(--font-size-body)", resize: "vertical", marginBottom: "var(--space-3)" }}
            />
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                type="button"
                onClick={() => setReportPost(null)}
                disabled={isReporting}
                style={{ flex: 1, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)", fontWeight: "var(--font-weight-semibold)", cursor: isReporting ? "default" : "pointer" }}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={isReporting}
                style={{ flex: 1, padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "none", background: "var(--color-danger)", color: "white", fontWeight: "var(--font-weight-semibold)", cursor: isReporting ? "default" : "pointer", opacity: isReporting ? 0.6 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "var(--space-1)" }}
              >
                {isReporting ? <Loader2 size={16} className="animate-spin" /> : null}
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
