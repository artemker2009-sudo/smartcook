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

// Накопительный список гостевых идентификаторов, под которыми на этом
// устройстве сохранялись рецепты. Только ДОБАВЛЯЕМ; убираем строго после
// подтверждённого переноса в аккаунт.
//
// Зачем отдельный список, если есть cook_user_id. При входе в аккаунт
// cook_user_id перезаписывается на user.id, и прежнее значение пропадает. Читать
// его «в момент авторизации» нельзя: перезапись живёт в эффекте SearchApp по
// смене user, а перенос вызывается из useAuthModal сразу после
// signInWithPassword — кто из них успеет первым, не определено. Накопительный
// список этой гонки не знает вовсе: он переживает и вход, и выход, и второе
// устройство.
export const GUEST_IDS_KEY = "smartcook_guest_recipe_ids";

// Событие «гостевые рецепты переехали в аккаунт» — экраны с историей по нему
// перечитывают список. Тот же приём, что у SHOPPING_CHANGED_EVENT.
export const RECIPES_CLAIMED_EVENT = "smartcook:recipes-claimed";

// Больше на одном устройстве не накапливается: это защита от разрастания
// localStorage, а не архив.
const MAX_GUEST_IDS = 20;

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

  if (stored && !isAccountId(stored)) {
    rememberGuestId(stored);
    return stored;
  }

  const fresh = newGuestId();
  try {
    localStorage.setItem(COOK_USER_ID_KEY, fresh);
  } catch {}
  rememberGuestId(fresh);
  return fresh;
}

// --- накопительный список гостевых id -------------------------------------

function readGuestIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_IDS_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0 && !isAccountId(v))
      : [];
  } catch {
    return [];
  }
}

function writeGuestIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const unique = Array.from(new Set(ids));
    localStorage.setItem(GUEST_IDS_KEY, JSON.stringify(unique.slice(-MAX_GUEST_IDS)));
  } catch {
    // Переполнение/приватный режим: перенос просто не состоится, рецепты целы.
  }
}

/** Запомнить гостевой идентификатор как кандидата на перенос. */
export function rememberGuestId(id: string): void {
  if (!id || isAccountId(id)) return;
  const ids = readGuestIds();
  if (ids.includes(id)) return;
  writeGuestIds([...ids, id]);
}

/**
 * Все гостевые идентификаторы устройства, которые ещё не переехали в аккаунт.
 *
 * Кроме самого списка смотрит на текущий cook_user_id: на устройствах, живших
 * до появления списка, гостевой id лежит только там. Это же вытаскивает тех,
 * кто регистрировался через /profile — SearchApp у них не монтировался, и
 * cook_user_id до сих пор хранит гостевое значение, а не uuid аккаунта.
 */
export function collectGuestIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids = readGuestIds();
  try {
    const stored = localStorage.getItem(COOK_USER_ID_KEY);
    if (stored && !isAccountId(stored) && !ids.includes(stored)) ids.push(stored);
  } catch {}
  return ids.slice(0, MAX_GUEST_IDS);
}

/** Убрать из списка идентификаторы, перенос которых сервер подтвердил. */
export function forgetGuestIds(claimed: string[]): void {
  if (!claimed.length) return;
  const done = new Set(claimed);
  writeGuestIds(readGuestIds().filter((id) => !done.has(id)));
}

/** Запомнить, что устройство теперь работает под аккаунтом. */
export function rememberAccountId(userId: string): void {
  try {
    localStorage.setItem(COOK_USER_ID_KEY, userId);
  } catch {}
}
