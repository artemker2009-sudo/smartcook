import "server-only";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

// Настройки Премиума из базы. ТОЛЬКО сервер: у premium_settings нет ни политик,
// ни привилегий для anon/authenticated (supabase_premium.sql), поэтому читать её
// умеет лишь service_role. Клиенту число приезжает пропом из серверного рендера
// или в ответе API — прямого доступа к таблице у браузера нет и не будет.

/** Если базу не прочитать — число по умолчанию из ТЗ. */
export const DEFAULT_FREE_PODBORS_PER_WEEK = 3;

export const MIN_FREE_PODBORS_PER_WEEK = 0;
export const MAX_FREE_PODBORS_PER_WEEK = 50;

/**
 * Сколько бесплатных подборов в неделю. Сбой чтения НЕ ломает страницу и НЕ
 * закрывает подборы: возвращаем значение по умолчанию и пишем в лог.
 *
 * Почему именно так, а не «исключение», как в lib/supabaseRead.ts: там пустой
 * ответ мог закэшироваться и стереть каталог из выдачи. Здесь цена ошибки
 * обратная — упавший запрос настроек не должен превращаться в 500 на странице
 * «Премиум» или в отказ сделать подбор.
 */
export async function getFreePodborsPerWeek(): Promise<number> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("premium_settings")
      .select("free_podbors_per_week")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[premiumSettings] read failed:", error.message);
      return DEFAULT_FREE_PODBORS_PER_WEEK;
    }

    const value = data?.free_podbors_per_week;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return DEFAULT_FREE_PODBORS_PER_WEEK;
    }
    return clampFreePodbors(value);
  } catch (e) {
    console.error("[premiumSettings] read threw:", e instanceof Error ? e.message : e);
    return DEFAULT_FREE_PODBORS_PER_WEEK;
  }
}

/** Ограничитель 0–50 (тот же, что стоит check-ограничением в базе). */
export function clampFreePodbors(value: number): number {
  return Math.min(
    MAX_FREE_PODBORS_PER_WEEK,
    Math.max(MIN_FREE_PODBORS_PER_WEEK, Math.round(value)),
  );
}
