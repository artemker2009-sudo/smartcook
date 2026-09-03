import { toast } from "sonner";
import { reachGoal } from "@/lib/metrika";

export interface SharePayload {
  /** Заголовок для системного диалога шеринга (мобильные). */
  title?: string;
  /** Текст-подводка (например «Блюдо • 25 мин»). Ссылка добавляется отдельно. */
  text: string;
  /** Ссылка на страницу рецепта/банкета. */
  url: string;
  /** Цель Яндекс.Метрики, отправляется через безопасный reachGoal. */
  goal?: string;
}

function isAbortError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "name" in e &&
    (e as { name?: string }).name === "AbortError"
  );
}

/**
 * Единый шеринг: navigator.share на мобильных, иначе фолбэк — копирование
 * ссылки в буфер с тостом «Ссылка скопирована».
 *
 * Всё обёрнуто в try/catch. Отмена шеринга пользователем (AbortError) — это НЕ
 * ошибка: тихо выходим, тост не показываем. reachGoal вызывается «мягко» и не
 * влияет на исход.
 */
export async function shareOrCopy({ title, text, url, goal }: SharePayload): Promise<void> {
  if (goal) reachGoal(goal);

  const shareData: ShareData = { title, text: `${text}\n${url}`, url };

  // В нативной оболочке — системный share sheet через плагин Capacitor.
  // navigator.share в WKWebView работает не всегда (требует жеста и доверенного
  // контекста), а нативный лист — всегда и с полным набором приложений. Это
  // один из device capability, на которые мы ссылаемся по App Store 4.2.
  // На вебе shareNative вернёт false, и дальше всё как раньше — без изменений.
  const { shareNative } = await import("@/lib/native");
  if (await shareNative({ title, text, url, dialogTitle: title })) return;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return;
    } catch (e) {
      // Пользователь закрыл системный лист шеринга — это не ошибка.
      if (isAbortError(e)) return;
      // Иная ошибка share (нет прав, не поддержано) — падаем в копирование.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  } catch {
    toast.error("Не удалось поделиться ссылкой");
  }
}
