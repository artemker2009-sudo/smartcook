"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Flag, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";

// Пользовательская модерация UGC (App Store 1.2) — общая для обоих разделов с
// пользовательским контентом: витрины «Приготовили сегодня» на Главной
// (feed_photos) и Ленты сообщества (community_posts).
//
// Раньше это жило только в CommunityFeed. Проверяющий App Store видит витрину
// ПЕРВОЙ — она на Главной, — а «Пожаловаться» там не было вовсе. Чтобы две
// копии одного и того же меню не разъехались (а разошлись бы они на первой же
// правке текста), нижний лист, модалка жалобы и чёрный список автора вынесены
// сюда. Оба раздела получают буквально один и тот же UI.
//
// Личность жалующегося серверу не передаётся: /api/feed/report берёт её из
// проверенного JWT либо из httpOnly-cookie sc_guest. Поэтому жаловаться можно
// и без регистрации.

const BLOCKED_AUTHORS_KEY = "sc_blocked_authors";

// Ключ автора — нормализованное отображаемое имя. Именно имя, а не user_ref:
// идентификатор владельца наружу не отдаёт ни один публичный view, и это
// осознанная часть модели безопасности. Плата — тёзки скрываются вместе.
export function authorKey(name: string | null | undefined): string {
  return (name || "").trim().toLowerCase();
}

// --- Хранилище чёрного списка -------------------------------------------------
//
// localStorage читается через useSyncExternalStore, а не через useEffect с
// setState. Две причины, и обе не про линтер:
//   * серверный снапшот — стабильный пустой массив, поэтому SSR-разметка
//     совпадает с первым клиентским рендером (никакого mismatch);
//   * подписка общая на весь модуль → «Скрыть автора» на витрине мгновенно
//     перерисовывает и Ленту сообщества на той же странице, без перезагрузки.
// Снапшот кэшируется по сырой строке: useSyncExternalStore сравнивает
// результаты по ссылке и зациклился бы на каждый раз новом массиве.

const EMPTY_AUTHORS: string[] = [];
const authorsListeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedAuthors: string[] = EMPTY_AUTHORS;

function readBlockedAuthors(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(BLOCKED_AUTHORS_KEY);
  } catch {
    // Приватный режим / доступ к хранилищу закрыт — считаем, что список пуст.
    return EMPTY_AUTHORS;
  }
  if (raw === cachedRaw) return cachedAuthors;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw || "[]");
    cachedAuthors = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : EMPTY_AUTHORS;
  } catch {
    cachedAuthors = EMPTY_AUTHORS;
  }
  return cachedAuthors;
}

function subscribeBlockedAuthors(onChange: () => void): () => void {
  authorsListeners.add(onChange);
  return () => {
    authorsListeners.delete(onChange);
  };
}

/**
 * Локальный чёрный список авторов. Живёт в localStorage этого устройства,
 * серверу не нужен. Список ОБЩИЙ для витрины и ленты (тот же ключ, что был у
 * ленты): человек, которого скрыли в одном разделе, исчезает и в другом — это
 * ровно то, чего ждёшь от «Скрыть автора».
 */
export function useBlockedAuthors() {
  const blockedAuthors = useSyncExternalStore(
    subscribeBlockedAuthors,
    readBlockedAuthors,
    () => EMPTY_AUTHORS,
  );

  const blockAuthor = useCallback((name: string | null | undefined) => {
    const key = authorKey(name);
    if (!key) return;
    const next = Array.from(new Set([...readBlockedAuthors(), key]));
    try {
      localStorage.setItem(BLOCKED_AUTHORS_KEY, JSON.stringify(next));
    } catch {
      /* приватный режим — скрытие не переживёт перезагрузку, но сейчас сработает */
      cachedRaw = JSON.stringify(next);
      cachedAuthors = next;
    }
    authorsListeners.forEach((listener) => listener());
    reachGoal("feed_author_block");
    toast.success("Публикации этого автора скрыты");
  }, []);

  // Отфильтровать любой список публикаций по чёрному списку.
  const filterBlocked = useCallback(
    <T extends { user_name: string | null }>(list: T[]): T[] =>
      blockedAuthors.length === 0 ? list : list.filter((p) => !blockedAuthors.includes(authorKey(p.user_name))),
    [blockedAuthors],
  );

  return { blockedAuthors, blockAuthor, filterBlocked };
}

/**
 * Отправка жалобы. Цель задаётся ровно одним полем — postId (лента) либо
 * photoId (витрина); роут /api/feed/report сам выберет ветку.
 */
export async function submitFeedReport(
  target: { postId: string } | { photoId: string },
  reason: string | null,
): Promise<boolean> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch("/api/feed/report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ ...target, reason: reason?.trim() || null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Общий стиль пункта нижнего листа: зона тапа 56px, крупный текст.
const sheetItemStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "56px",
  textAlign: "left",
  padding: "0 var(--space-2)",
  background: "none",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--color-text)",
  fontSize: "var(--font-size-body)",
  fontWeight: "var(--font-weight-medium)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
};

/**
 * Меню действий с публикацией — нижний лист. Позиционируется от низа ЭКРАНА, а
 * не от карточки: выпадающий список у последнего поста упирался в край и
 * «Скрыть автора» обрезалось.
 */
export function FeedActionSheet({
  title,
  authorName,
  onReport,
  onBlockAuthor,
  onClose,
}: {
  title: string;
  authorName: string;
  onReport: () => void;
  onBlockAuthor: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 100000,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="menu"
        style={{
          background: "var(--color-surface)",
          width: "100%",
          maxWidth: "520px",
          borderTopLeftRadius: "var(--radius-md)",
          borderTopRightRadius: "var(--radius-md)",
          padding: "var(--space-3) var(--space-3) calc(env(safe-area-inset-bottom) + var(--space-3)) var(--space-3)",
        }}
      >
        <div
          style={{
            padding: "var(--space-2) var(--space-2) var(--space-3) var(--space-2)",
            borderBottom: "1px solid var(--color-border)",
            marginBottom: "var(--space-2)",
          }}
        >
          <div
            style={{
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
              fontSize: "var(--font-size-body)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "var(--font-size-caption)", color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {authorName}
          </div>
        </div>

        <button type="button" role="menuitem" onClick={onReport} style={sheetItemStyle}>
          <Flag size={20} color="var(--color-danger)" /> Пожаловаться
        </button>

        <button type="button" role="menuitem" onClick={onBlockAuthor} style={sheetItemStyle}>
          <EyeOff size={20} color="var(--color-text-secondary)" /> Скрыть автора
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            minHeight: "56px",
            marginTop: "var(--space-2)",
            background: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-text-secondary)",
            fontSize: "var(--font-size-body)",
            fontWeight: "var(--font-weight-semibold)",
            cursor: "pointer",
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

const REPORT_REASONS = ["Спам", "Оскорбления", "Не еда", "Чужое фото", "Другое"];
const REASON_MAX = 300;

/**
 * Модалка жалобы. Причина необязательна — требовать её значит терять часть
 * сигналов; App Store 1.2 хватает самого факта жалобы.
 */
export function FeedReportModal({
  isSending,
  reason,
  onReasonChange,
  onSubmit,
  onClose,
}: {
  isSending: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={() => !isSending && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-3)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          width: "100%",
          maxWidth: "400px",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
          <Flag size={20} color="var(--color-danger)" />
          <h3
            style={{
              margin: 0,
              color: "var(--color-text)",
              fontSize: "var(--font-size-heading)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            Пожаловаться
          </h3>
        </div>
        <p
          style={{
            margin: "0 0 var(--space-3) 0",
            fontSize: "var(--font-size-caption)",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
          }}
        >
          Расскажите, что не так с этой публикацией. Мы проверим её в течение суток.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onReasonChange(r)}
              style={{
                padding: "var(--space-1) var(--space-3)",
                borderRadius: "var(--radius-full)",
                border: "1px solid " + (reason === r ? "var(--color-accent)" : "var(--color-border)"),
                background: reason === r ? "var(--color-accent-subtle)" : "var(--color-bg)",
                color: reason === r ? "var(--color-accent)" : "var(--color-text-secondary)",
                fontSize: "var(--font-size-caption)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer",
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value.slice(0, REASON_MAX))}
          placeholder="Комментарий (необязательно)"
          rows={2}
          style={{
            width: "100%",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg)",
            color: "var(--color-text)",
            fontSize: "var(--font-size-body)",
            resize: "vertical",
            marginBottom: "var(--space-3)",
          }}
        />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              color: "var(--color-text-secondary)",
              fontWeight: "var(--font-weight-semibold)",
              cursor: isSending ? "default" : "pointer",
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSending}
            style={{
              flex: 1,
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              background: "var(--color-danger)",
              color: "white",
              fontWeight: "var(--font-weight-semibold)",
              cursor: isSending ? "default" : "pointer",
              opacity: isSending ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-1)",
            }}
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : null}
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
