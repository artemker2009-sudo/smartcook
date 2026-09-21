// Чтение публичных таблиц Supabase для серверных страниц с revalidate.
//
// ГЛАВНОЕ ПРАВИЛО: ОШИБКА ЗАПРОСА И ПУСТОЙ ОТВЕТ — РАЗНЫЕ СЛУЧАИ.
//
// Раньше каждая страница писала свой fetch и на любой сбой возвращала [] или
// null. На статической странице с revalidate это кэширует ПУСТОТУ: Next при
// фоновой перегенерации ходит за свежими данными (устаревшую запись data
// cache он в этот момент не подставляет), получает 500 или обрыв сети,
// страница честно рендерится с пустым списком — и в таком виде отдаётся
// всем до следующего окна ревалидации. Наблюдали на локальной прод-сборке:
// в базе десять опубликованных рецептов, а лента пишет «Таких блюд пока нет».
//
// Теперь сбой — это ИСКЛЮЧЕНИЕ. Что с ним делает Next:
//   - фоновая перегенерация статической страницы падает, и дальше
//     отдаётся ПРЕЖНЯЯ удачная версия (так устроен ISR);
//   - в data cache попадают только ответы со статусом 200
//     (next/dist/server/lib/patch-fetch.js), так что сбой не закрепится;
//   - динамическая страница показывает экран ошибки «попробуйте ещё раз»
//     вместо лживого «рецепт не найден»;
//   - ПЛАТА: если Supabase лежит во время `next build`, сборка падает. Это
//     осознанно: прод остаётся на прошлом деплое, а не выкатывает пустоту.
//
// А успешный ответ с [] — это настоящий пустой каталог, и его показываем
// как пустой: «заметки скоро появятся», «такого рецепта нет».

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
// Публичный anon-ключ — тот же, что уходит в браузер. Секретов здесь нет.
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

/** Сбой чтения: сеть, не-200, не JSON или не массив. НЕ «пусто». */
export class SupabaseReadError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "SupabaseReadError";
    this.status = status;
  }
}

/**
 * Строки из PostgREST. Успех — всегда массив, в том числе пустой.
 * Любой сбой — SupabaseReadError, и вызывающий его НЕ глотает.
 *
 * path — всё после /rest/v1/: «таблица?select=…&фильтры». Колонки
 * перечисляются явно (CLAUDE.md), select=* здесь не место.
 */
export async function readRows<T>(path: string, opts: { revalidate: number }): Promise<T[]> {
  // Имя таблицы для текста ошибки: сам запрос с фильтрами в лог не пишем.
  const table = path.split("?")[0];

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      next: { revalidate: opts.revalidate },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SupabaseReadError(`${table}: сеть недоступна (${reason})`);
  }

  if (!res.ok) {
    throw new SupabaseReadError(`${table}: HTTP ${res.status}`, res.status);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new SupabaseReadError(`${table}: ответ не JSON`, res.status);
  }

  // PostgREST без Accept: object отдаёт массив всегда. Объект вместо массива —
  // это не «пусто», а неожиданный ответ (прокси, страница ошибки, смена API).
  if (!Array.isArray(data)) {
    throw new SupabaseReadError(`${table}: ответ не массив`, res.status);
  }
  return data as T[];
}
