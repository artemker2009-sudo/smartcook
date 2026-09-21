// Запись в localStorage С ПРОВЕРКОЙ и с отчётом о сбое.
//
// Заблокированная запись выглядит как успешная — это правило из CLAUDE.md про
// RLS, и оно ровно так же верно для браузерного хранилища. Раньше запись
// избранного падала молча: сердечко закрашивалось, тост говорил «Добавлено в
// избранное», а в хранилище не было ничего. Проверено на живом запуске: при
// упавшем setItem человек видел успех, в error_reports не приходило ничего.
//
// Как запись падает в Safari: QuotaExceededError при переполненном хранилище
// (5 МБ на домен, делим со списками покупок), SecurityError при запрете
// хранилища в настройках. Отдельный случай — setItem не бросает, но значение
// не сохраняется; его ловит только чтение обратно.

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type WriteResult = { ok: true } | { ok: false; reason: string };

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 300);
  return String(error ?? "unknown").slice(0, 300);
}

/**
 * Записать и прочитать обратно. Успех — только если прочитали ровно то, что
 * писали. Чистая функция над переданным хранилищем: тестируется без браузера.
 */
export function verifiedWrite(storage: StorageLike | null, key: string, value: string): WriteResult {
  if (!storage) return { ok: false, reason: "хранилище недоступно" };
  try {
    storage.setItem(key, value);
  } catch (error) {
    return { ok: false, reason: describe(error) };
  }
  let back: string | null;
  try {
    back = storage.getItem(key);
  } catch (error) {
    return { ok: false, reason: `чтение обратно: ${describe(error)}` };
  }
  if (back !== value) return { ok: false, reason: "записанное значение не сохранилось" };
  return { ok: true };
}

/**
 * localStorage, до которого можно дотянуться. В Safari с запретом хранилища
 * бросает уже само обращение к window.localStorage — отсюда try.
 */
export function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Один отчёт на ключ за жизнь страницы. Если хранилище сломано, оно сломано
// на каждом нажатии, и сотня одинаковых строк в error_reports ничего не
// добавит к первой — только упрётся в лимит отправок.
const reported = new Set<string>();

const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

/** Отчёт о сбое записи в error_reports. Никогда не бросает. */
export function reportStorageFailure(key: string, reason: string, bytes: number): void {
  if (typeof window === "undefined" || reported.has(key)) return;
  reported.add(key);
  try {
    let standalone = false;
    try {
      standalone = window.matchMedia("(display-mode: standalone)").matches;
    } catch {}
    const payload = JSON.stringify({
      message:
        `[storage_write_error] Не удалось записать в localStorage\n` +
        `Ключ: ${key}\n` +
        `Размер значения: ${bytes} симв.\n` +
        `Причина: ${reason}`,
      url: window.location.href,
      display_mode: standalone ? "standalone" : "browser",
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      app_version: APP_VERSION,
    });
    // keepalive — отчёт переживёт уход со страницы. Токен не шлём: отчёт
    // анонимный, а тянуть сюда клиент Supabase ради одного заголовка незачем.
    fetch("/api/report-error", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {
      try {
        navigator.sendBeacon?.("/api/report-error", new Blob([payload], { type: "application/json" }));
      } catch {}
    });
  } catch {
    // Телеметрия не должна ронять экран.
  }
}
