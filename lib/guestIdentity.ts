// Гостевая идентичность для истории рецептов (ключ localStorage cook_user_id,
// колонка recipes.session_id).
//
// Раньше вся эта логика жила одной строкой внутри эффекта SearchApp. Вынесено
// сюда из-за конкретного бага: выход из аккаунта НЕ трогал cook_user_id, и в
// ключе оставался uuid бывшего аккаунта. То есть «гость» после выхода
// продолжал писать рецепты в историю аккаунта, из которого только что вышел, —
// на общем устройстве это ещё и показ чужой истории следующему человеку.
//
// Пока на recipes висит лишняя разрешающая INSERT-политика (см.
// supabase_recipes_insert_policy_fix.sql), такие записи ПРОХОДЯТ. После того
// как политику починят, они начнут отлетать по RLS — и рецепт, сделанный после
// выхода, не сохранится вообще, молча. Поэтому ротация обязана появиться в
// проде НЕ ПОЗЖЕ той миграции.

export const COOK_USER_ID_KEY = "cook_user_id";

// Идентификатор аккаунта — это uuid из auth.users. Гостевой — "user_xxxxxxxxx".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Похож ли сохранённый идентификатор на идентификатор аккаунта (а не гостя). */
export function isAccountId(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

// Формат намеренно тот же, что был в SearchApp: в БД уже 300+ строк с такими
// идентификаторами, и менять форму сейчас значит разойтись с ними.
export function newGuestId(): string {
  return "user_" + Math.random().toString(36).substr(2, 9);
}

/**
 * Возвращает гостевой идентификатор устройства для НЕзалогиненного состояния,
 * при необходимости создавая новый и записывая его в localStorage.
 *
 * Новый выдаётся в двух случаях:
 *   1) ключа нет вовсе (первый визит);
 *   2) в ключе лежит uuid аккаунта — значит человек вышел из аккаунта (или
 *      сессия истекла, или аккаунт удалили с другого устройства). Продолжать
 *      писать под ним нельзя.
 */
export function ensureGuestId(): string {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(COOK_USER_ID_KEY);
  } catch {
    // Приватный режим: идентичность не переживёт перезагрузку, но в рамках
    // сессии всё работает — отдаём свежий и не падаем.
    return newGuestId();
  }

  if (stored && !isAccountId(stored)) return stored;

  const fresh = newGuestId();
  try {
    localStorage.setItem(COOK_USER_ID_KEY, fresh);
  } catch {}
  return fresh;
}

/** Запомнить, что устройство теперь работает под аккаунтом. */
export function rememberAccountId(userId: string): void {
  try {
    localStorage.setItem(COOK_USER_ID_KEY, userId);
  } catch {}
}
