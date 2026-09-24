import "server-only";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { getVerifiedUserId } from "@/lib/auth";
import { FEATURE_PREMIUM } from "@/lib/features";
import { isPremiumActive } from "@/lib/premiumPeriod";
import { moscowWeekStart, moscowNextWeekStart } from "@/lib/premiumPeriod";
import { readPremiumState } from "@/lib/premiumServer";
import { getFreePodborsPerWeek } from "@/lib/premiumSettings";

/**
 * НЕДЕЛЬНЫЙ ЛИМИТ ПОДБОРОВ.
 *
 * Подбор — это когда человек даёт НОВЫЙ ввод, а ИИ подбирает по нему рецепты:
 * фото продуктов или текст «что есть дома». Всё остальное подбором не
 * считается и лимит не тратит — в том числе открыть другое блюдо из уже
 * подобранной тройки, «другие блюда по тем же продуктам», рецепты из «Идей»,
 * список покупок, вопрос по открытому рецепту и рецепт дня.
 *
 * ЭТО НЕ ЗАМЕНА ОБЩЕГО ЛИМИТА. checkAndConsumeAiRateLimit (10 в час, 30 в
 * сутки на IP и на аккаунт) остаётся для всех, включая Премиум, и НЕ
 * ослабляется: он защищает расходы на OpenAI, а этот — продаёт Премиум. Это
 * два разных предохранителя, и оба проверяются до вызова модели.
 */

export const PODBOR_LIMIT_CODE = "PODBOR_LIMIT";

/** Фото продуктов или текстовый запрос — влияет только на статистику. */
export type PodborKind = "photo" | "text";

export type PodborOwner =
  | { userId: string; sessionId: null }
  | { userId: null; sessionId: string }
  | { userId: null; sessionId: null };

export type PodborCheck =
  | { allowed: true; owner: PodborOwner; used: number; limit: number }
  | { allowed: false; owner: PodborOwner; used: number; limit: number; resetsAt: string };

/**
 * Кто делает подбор. Залогиненный — по user_id из ПРОВЕРЕННОГО JWT. Гость — по
 * session_id, который прислал клиент.
 *
 * Про session_id честно: клиент может его сменить и обнулить себе счётчик. Это
 * осознанный размен, зафиксированный в задании: у гостя нет другой устойчивой
 * идентичности, а закрывать подборы совсем незарегистрированным — потерять
 * главный сценарий продукта. От настоящего перебора защищает общий лимит по IP
 * (lib/rateLimit.ts), который никакой строкой из тела запроса не обходится.
 * Для владения ДАННЫМИ session_id по-прежнему доказательством не считается
 * (CLAUDE.md, правило 2) — здесь он только ключ счётчика.
 */
export async function resolvePodborOwner(req: Request, sessionId: unknown): Promise<PodborOwner> {
  const userId = await getVerifiedUserId(req);
  if (userId) return { userId, sessionId: null };

  if (typeof sessionId === "string") {
    const trimmed = sessionId.trim().slice(0, 100);
    if (trimmed) return { userId: null, sessionId: trimmed };
  }
  return { userId: null, sessionId: null };
}

/** Сколько подборов у этого владельца с понедельника 00:00 МСК. null — сбой. */
export async function countPodborsThisWeek(
  owner: PodborOwner,
  now: Date = new Date(),
): Promise<number | null> {
  if (!owner.userId && !owner.sessionId) return 0;

  const since = moscowWeekStart(now).toISOString();
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("podbor_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  query = owner.userId
    ? query.eq("user_id", owner.userId)
    : query.eq("session_id", owner.sessionId!);

  const { count, error } = await query;

  // Тот же случай, что в lib/rateLimit.ts: на HEAD-запросах шлюз иногда
  // отдаёт 204 без тела и без error, и count приходит null. Это сбой, а не
  // «ноль подборов».
  if (error || count === null) {
    console.error("[podbor] count failed:", error?.message ?? "count came back null");
    return null;
  }
  return count;
}

/** Освобождён ли аккаунт от недельного лимита (демо-аккаунт App Review). */
function isExemptUser(userId: string | null): boolean {
  if (!userId) return false;
  const list = (process.env.AI_RATE_LIMIT_EXEMPT_USER_IDS || "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(userId.toLowerCase());
}

/**
 * Проверка ДО вызова OpenAI. Ничего не записывает: запись — отдельным шагом
 * recordPodbor(), уже после успешного старта генерации.
 *
 * Сбой подсчёта ПРОПУСКАЕТ подбор. Это сознательно и отличается от
 * lib/rateLimit.ts, где сбой блокирует: там на кону расходы на OpenAI и
 * блокировка дешевле, здесь — сломанная главная функция продукта у человека,
 * который ни в чём не виноват. Расходы всё равно прикрыты общим лимитом,
 * который проверяется рядом и при сбое как раз блокирует.
 */
export async function checkPodborLimit(
  req: Request,
  sessionId: unknown,
  now: Date = new Date(),
): Promise<PodborCheck> {
  const owner = await resolvePodborOwner(req, sessionId);
  const limit = await getFreePodborsPerWeek();

  const pass = (used: number): PodborCheck => ({ allowed: true, owner, used, limit });

  // Флаг выключен — лимита нет, но подборы всё равно считаем и пишем: без
  // накопленных данных включать лимит пришлось бы вслепую (SPEC 3.2).
  if (!FEATURE_PREMIUM) return pass(0);

  // Демо-аккаунт App Review: проверяющий Apple обязан пройти сценарий целиком,
  // упереться в платный лимит он не должен (та же причина, что в rateLimit.ts).
  if (isExemptUser(owner.userId)) return pass(0);

  if (owner.userId) {
    const state = await readPremiumState(owner.userId);
    if (isPremiumActive(state, now)) return pass(0);
  }

  const used = await countPodborsThisWeek(owner, now);
  if (used === null) return pass(0);
  if (used < limit) return pass(used);

  return {
    allowed: false,
    owner,
    used,
    limit,
    resetsAt: moscowNextWeekStart(now).toISOString(),
  };
}

/** Ответ 402 с тем, что нужно шторке: сколько потрачено, сколько дают, когда сброс. */
export function podborLimitResponse(check: Extract<PodborCheck, { allowed: false }>) {
  return NextResponse.json(
    {
      code: PODBOR_LIMIT_CODE,
      error: "Подборы на этой неделе закончились",
      used: check.used,
      limit: check.limit,
      resetsAt: check.resetsAt,
    },
    { status: 402 },
  );
}

/**
 * Запись подбора. Вызывать ПОСЛЕ успешного старта генерации.
 *
 * Сбой записи генерацию НЕ ломает — только лог (SPEC 3.2): функция ничего не
 * бросает.
 *
 * ПОЧЕМУ await, А НЕ void. Сначала запись была fire-and-forget: ответ уходил
 * человеку, а insert летел следом. На превью это поймалось сразу — из трёх
 * подборов записались два: платформа замораживает функцию, как только ответ
 * отправлен, и незавершённая работа просто пропадает. Потерянная запись — это
 * лишний бесплатный подбор, то есть дырка в лимите. Ждём: один маленький
 * insert на фоне запроса к модели в 3–10 секунд не заметен, а recordPodbor
 * ничего не бросает — сбой записи по-прежнему не ломает генерацию.
 */
export async function recordPodbor(
  owner: PodborOwner,
  kind: PodborKind,
  route: string,
): Promise<void> {
  if (!owner.userId && !owner.sessionId) return;
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("podbor_usage").insert({
      user_id: owner.userId,
      session_id: owner.sessionId,
      kind,
      route,
    });
    if (error) console.error("[podbor] insert failed:", error.message);
  } catch (e) {
    console.error("[podbor] insert threw:", e instanceof Error ? e.message : e);
  }
}
