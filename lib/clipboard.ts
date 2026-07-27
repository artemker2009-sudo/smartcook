/**
 * Копирование текста в буфер обмена с фолбэком.
 *
 * Основной путь — асинхронный navigator.clipboard.writeText (нужен HTTPS +
 * пользовательский жест). Он может отсутствовать (старый WebView, http) или
 * отклониться — тогда падаем в синхронный execCommand через скрытую textarea.
 *
 * ВАЖНО про жест: вызывать строго из обработчика клика/тапа. Не «глотаем»
 * ошибку молча наружу — возвращаем boolean, чтобы вызывающий решил, что
 * показать пользователю.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Нет прав / отклонено — пробуем legacy-путь ниже.
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    // Прячем, но оставляем в потоке документа, иначе select() не сработает.
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
