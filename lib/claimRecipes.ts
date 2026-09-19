import { supabase } from "@/lib/supabase";
import {
  RECIPES_CLAIMED_EVENT,
  collectGuestIds,
  forgetGuestIds,
  rememberAccountId,
} from "@/lib/guestIdentity";

/**
 * Переносит в аккаунт рецепты, сохранённые на этом устройстве анонимно.
 *
 * Best-effort, ровно как claimGuestPartiesToAccount: любые ошибки глотаем, вход
 * и регистрацию не блокируем. Что не доехало сейчас — доедет при следующем
 * запуске, потому что подметалка вызывает эту же функцию (см. SearchApp и
 * ProfileApp), а список гостевых id живёт в localStorage до подтверждения.
 *
 * Сетевого ожидания здесь ждать нельзя: сразу после регистрации показывается
 * код восстановления, и задерживать этот экран запросом недопустимо — код
 * показывается ровно один раз. Поэтому вызывающие стороны не await'ят.
 */
export async function claimGuestRecipesToAccount(accountUserId: string): Promise<void> {
  try {
    const guestIds = collectGuestIds();
    if (!guestIds.length) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    const res = await fetch("/api/recipes/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ guestIds }),
    });
    if (!res.ok) return;

    const payload = (await res.json().catch(() => null)) as
      | { claimed?: number; claimedIds?: unknown }
      | null;
    if (!payload) return;

    // Вычёркиваем только то, что сервер подтвердил. Список — единственное, что
    // связывает устройство с его гостевыми строками; чистить его «на всякий
    // случай» нельзя.
    const claimedIds = Array.isArray(payload.claimedIds)
      ? payload.claimedIds.filter((v): v is string => typeof v === "string")
      : [];
    forgetGuestIds(claimedIds);

    // Теперь устройство работает под аккаунтом. Важно для тех, кто
    // регистрировался через /profile: там SearchApp не монтируется, и без этой
    // строки в cook_user_id навсегда остался бы гостевой идентификатор.
    rememberAccountId(accountUserId);

    if ((payload.claimed ?? 0) > 0 && typeof window !== "undefined") {
      window.dispatchEvent(new Event(RECIPES_CLAIMED_EVENT));
    }
  } catch {
    /* перенос — не критичный путь, вход не блокируем */
  }
}
