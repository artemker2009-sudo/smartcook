import "server-only";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isPremiumActive, type PremiumState } from "@/lib/premiumPeriod";

// Чтение и запись Премиума. Только сервер: у user_premium нет ни политик, ни
// привилегий для anon/authenticated (supabase_premium.sql), так что ходить
// сюда может лишь service_role — и только с личностью, взятой из проверенного
// JWT (getVerifiedUserId), а не из тела запроса.

export type UserPremiumRow = {
  user_id: string;
  premium_until: string | null;
  is_forever: boolean;
};

/** Текущее состояние Премиума. null — записи нет (человек никогда не покупал). */
export async function readPremiumState(userId: string): Promise<PremiumState | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("user_premium")
    .select("premium_until, is_forever")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[premium] readPremiumState failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    premiumUntil: data.premium_until ? new Date(data.premium_until) : null,
    isForever: !!data.is_forever,
  };
}

/** Состояние сразу в виде, который уходит клиенту. */
export async function readPremiumStatus(userId: string, now: Date = new Date()) {
  const state = await readPremiumState(userId);
  return {
    isPremium: isPremiumActive(state, now),
    premiumUntil: state?.premiumUntil?.toISOString() ?? null,
    isForever: !!state?.isForever,
  };
}

/**
 * Записать новое состояние. upsert по user_id: строка появляется при первой
 * покупке и дальше переписывается.
 */
export async function writePremiumState(userId: string, next: PremiumState): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("user_premium").upsert(
    {
      user_id: userId,
      premium_until: next.premiumUntil?.toISOString() ?? null,
      is_forever: next.isForever,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("[premium] writePremiumState failed:", error.message);
    return false;
  }
  return true;
}
