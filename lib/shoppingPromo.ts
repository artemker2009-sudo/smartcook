// Логика показа плашки-новинки «Покупки» на Главной. БЕЗ БД — только
// localStorage на устройстве.
//
// Два правила:
//  1) показать ОДИН раз на устройство (флаг SHOPPING_PROMO_SEEN_KEY);
//  2) показать ТОЛЬКО вернувшимся — тем, у кого уже есть следы прошлых визитов.
//     Первым визитам не показываем: им раздел и так новый, лишний шум не нужен.

export const SHOPPING_PROMO_SEEN_KEY = "smartcook_shopping_promo_seen";

// Ключи-«следы» реального прошлого использования приложения. КАЖДЫЙ из них
// пишется только при осознанном действии (поиск/генерация, правка вкусов, игра,
// список покупок, банкет), а НЕ при простой загрузке Главной — иначе первый
// визит ложно считался бы возвратом.
//
// СПЕЦИАЛЬНО не включаем smartcook_onboarding_seen: онбординг-модалка ставит
// этот флаг уже на ПЕРВОМ визите, поэтому как признак «вернувшегося» он не годится.
const RETURNING_TRACE_KEYS = [
  "cook_user_id", // ставится в SearchApp при первом поиске/генерации
  "sc_gen_count",
  "sc_last_gen_date",
  "sc_allergies",
  "sc_dislikes",
  "sc_taste_nudge_seen",
  "sc_pwa_prompt_seen",
  "sc_cooks", // прогресс мини-игры
  "smartcook_shopping_list_v1",
  "smartcook_guest_parties",
] as const;

// Ключи банкета именованы с id (party_admin_<id> и т.п.) — участие в банкете
// тоже след возврата. Ищем по префиксу.
const RETURNING_TRACE_PREFIXES = ["party_admin_", "party_participant_", "party_user_id_"] as const;

/** Есть ли в localStorage следы реального прошлого визита (вернувшийся пользователь). */
export function hasReturningTrace(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (const key of RETURNING_TRACE_KEYS) {
      if (localStorage.getItem(key) !== null) return true;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && RETURNING_TRACE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Показывать ли плашку: ещё не показывали на этом устройстве И это вернувшийся. */
export function shouldShowShoppingPromo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(SHOPPING_PROMO_SEEN_KEY)) return false;
  } catch {
    return false;
  }
  return hasReturningTrace();
}

/** Пометить плашку показанной — больше не покажется (крестик = закрыть навсегда). */
export function markShoppingPromoSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SHOPPING_PROMO_SEEN_KEY, "1");
  } catch {
    // Приватный режим / переполнение — не критично, плашка просто покажется в
    // следующий раз. Ломать Главную из-за этого нельзя.
  }
}
