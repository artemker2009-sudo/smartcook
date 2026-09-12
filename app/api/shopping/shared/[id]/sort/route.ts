import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { getVerifiedUserId } from "@/lib/auth";
import { checkAndConsumeShoppingSortRateLimit, shoppingRateLimitResponse } from "@/lib/rateLimit";
import {
  MAX_SHOPPING_ITEMS,
  MAX_SHOPPING_ITEM_LENGTH,
  signatureFromNames,
  type ShoppingDepartment,
  type ShoppingGroup,
} from "@/lib/shoppingList";
import {
  isDepartment,
  lookupDepartment,
  nameKey,
  placeNames,
  uncoveredNames,
  type Placement,
} from "@/lib/shoppingDepartments";
import { groupNamesByDepartment } from "@/lib/shoppingSort";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  findLiveList,
  findMembership,
  isUuid,
  sanitizeMemberRef,
} from "@/lib/sharedShoppingServer";

// Раскладка общего списка: модель + запись результата в БД + Broadcast всем
// участникам. Запас как у остальных AI-роутов (см. app/api/analyze/route.ts).
export const maxDuration = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Раскладка ОБЩЕГО списка по отделам.
 *
 * Отличие от /api/shopping/sort: там список приходит с устройства и результат
 * никуда не сохраняется. Здесь позиции берутся из БД, а результат ложится в
 * shared_lists (sort_sig + sort_groups) и уходит остальным участникам пингом —
 * разложил один, увидели все, как с галочками.
 *
 * Два режима:
 *   • полный (по умолчанию) — разложить весь список заново;
 *   • mode: "extend" — ДОПИСАТЬ в готовую раскладку позиции, которых в ней нет,
 *     не трогая остальных. Так новый продукт встаёт в свой отдел сам, а модель
 *     спрашивают только про то, чего нет в словаре.
 *
 * ЭКОНОМИЯ: если раскладка для текущего набора позиций уже посчитана, отдаём её
 * из БД и НЕ зовём OpenAI вовсе. Без этого каждый участник, открывший список и
 * нажавший кнопку, оплачивал бы свой отдельный вызов, а результат был бы тот же.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { id } = await context.params;
    if (!id || !isUuid(id)) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    const memberRef = sanitizeMemberRef((body as { memberRef?: unknown })?.memberRef);
    if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });

    const supabase = createServiceRoleClient();
    const list = await findLiveList(supabase, id);
    if (!list) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

    const membership = await findMembership(supabase, id, memberRef);
    if (!membership) return NextResponse.json({ error: "Вы не участник этого списка" }, { status: 403 });

    // Позиции берём из БД, а не из тела запроса: раскладывать надо ровно то, что
    // сейчас в общем списке, а не то, что успел увидеть один участник.
    const { data: rows, error: itemsError } = await supabase
      .from("shared_list_items")
      .select("name")
      .eq("shared_list_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (itemsError) {
      console.error("[sharedShopping/sort] load items failed", itemsError.message);
      return NextResponse.json({ error: "Не удалось разложить по отделам" }, { status: 500 });
    }

    // Дедуп по названию: в раскладку каждая позиция должна попасть один раз.
    const names: string[] = [];
    for (const row of rows ?? []) {
      const name = String(row.name ?? "").trim();
      if (!name) continue;
      if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
      names.push(name);
      if (names.length >= MAX_SHOPPING_ITEMS) break;
    }
    if (names.length === 0) {
      return NextResponse.json({ error: "Список пуст" }, { status: 400 });
    }

    if ((body as { mode?: unknown })?.mode === "extend") {
      return await extendSort(req, supabase, id, list.sort_groups, names, (body as { placements?: unknown }).placements);
    }

    const sig = signatureFromNames(names);

    // Уже посчитано для этого же набора — отдаём как есть. Ни вызова модели, ни
    // записи, ни пинга: у остальных участников этот результат и так уже лежит.
    if (list.sort_sig === sig && Array.isArray(list.sort_groups)) {
      return NextResponse.json({ sig, groups: list.sort_groups, cached: true });
    }

    // Лимит расходов — тот же счётчик, что у личного списка: платит OpenAI одна
    // и та же касса, и делить её на два бюджета смысла нет.
    const userId = await getVerifiedUserId(req);
    const rateLimit = await checkAndConsumeShoppingSortRateLimit(req, userId);
    if (!rateLimit.ok) return shoppingRateLimitResponse(rateLimit);

    const groups = await groupNamesByDepartment(names);

    const { error: saveError } = await supabase
      .from("shared_lists")
      .update({ sort_sig: sig, sort_groups: groups, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (saveError) {
      // Раскладка посчитана — отдадим её тому, кто нажал, даже если сохранить не
      // вышло. Остальные её не увидят, но терять оплаченный результат глупо.
      console.error("[sharedShopping/sort] save failed", saveError.message);
      return NextResponse.json({ sig, groups, saved: false });
    }

    await broadcastSharedListChanged(id, "list");

    return NextResponse.json({ sig, groups, cached: false });
  } catch (error: unknown) {
    console.error("[sharedShopping/sort] error:", error);
    return NextResponse.json({ error: "Не удалось разложить по отделам" }, { status: 500 });
  }
}

/**
 * Дописать новые позиции в готовую раскладку.
 *
 * Отдел ищется по порядку: то, что прислал клиент (его словарь знает и
 * выученное на устройстве), → базовый словарь → модель. Клиенту верим только в
 * пределах разумного: название обязано быть в списке, отдел — из
 * SHOPPING_DEPARTMENTS. Худшее, что может сделать участник, — положить
 * позицию своего же семейного списка не в тот отдел.
 *
 * Модель — только для незнакомого и под тем же лимитером. Лимит исчерпан или
 * модель упала — сохраняем хотя бы найденное в словаре; незнакомое остаётся
 * вне раскладки, и клиент показывает его в «Прочее».
 */
async function extendSort(
  req: Request,
  supabase: SupabaseClient,
  id: string,
  storedGroups: unknown,
  names: string[],
  rawPlacements: unknown,
) {
  if (!Array.isArray(storedGroups)) {
    return NextResponse.json({ error: "Список ещё не раскладывали" }, { status: 409 });
  }

  const stored = placeNames(storedGroups as ShoppingGroup[], [], names);
  const missing = uncoveredNames(stored, names);
  if (missing.length === 0) {
    return NextResponse.json({ sig: signatureFromNames(names), groups: stored, cached: true });
  }

  const fromClient = new Map<string, ShoppingDepartment>();
  if (Array.isArray(rawPlacements)) {
    for (const raw of rawPlacements.slice(0, MAX_SHOPPING_ITEMS)) {
      const name = (raw as { name?: unknown })?.name;
      const department = (raw as { department?: unknown })?.department;
      if (typeof name !== "string" || name.length > MAX_SHOPPING_ITEM_LENGTH) continue;
      if (!isDepartment(department)) continue;
      fromClient.set(nameKey(name), department);
    }
  }

  const placements: Placement[] = [];
  const unknown: string[] = [];
  for (const name of missing) {
    const department = fromClient.get(nameKey(name)) ?? lookupDepartment(name);
    if (department) placements.push({ name, department });
    else unknown.push(name);
  }

  let rateLimited: Awaited<ReturnType<typeof checkAndConsumeShoppingSortRateLimit>> | null = null;
  if (unknown.length > 0) {
    const userId = await getVerifiedUserId(req);
    const rateLimit = await checkAndConsumeShoppingSortRateLimit(req, userId);
    if (!rateLimit.ok) {
      rateLimited = rateLimit;
    } else {
      try {
        // Группы собираются из ОРИГИНАЛЬНЫХ названий входа — модель не может
        // подменить или добавить позицию (см. lib/shoppingSort).
        for (const group of await groupNamesByDepartment(unknown)) {
          for (const name of group.items) placements.push({ name, department: group.department });
        }
      } catch (error) {
        console.error("[sharedShopping/sort] extend model failed", error);
      }
    }
  }

  if (placements.length === 0) {
    if (rateLimited) return shoppingRateLimitResponse(rateLimited);
    return NextResponse.json({ error: "Не удалось разложить по отделам" }, { status: 500 });
  }

  const groups = placeNames(stored, placements, names);
  // Подпись — только того, что реально разложено. Иначе полная раскладка
  // приняла бы неполные группы за готовые («cached») и не досчитала бы остаток.
  const stillMissing = new Set(uncoveredNames(groups, names).map(nameKey));
  const sig = signatureFromNames(names.filter((name) => !stillMissing.has(nameKey(name))));

  // updated_at не двигаем: раскладка — производная от позиций, а не правка
  // списка, и само добавление позиции его уже обновило.
  const { error: saveError } = await supabase
    .from("shared_lists")
    .update({ sort_sig: sig, sort_groups: groups })
    .eq("id", id);
  if (saveError) {
    console.error("[sharedShopping/sort] extend save failed", saveError.message);
    return NextResponse.json({ sig, groups, saved: false });
  }

  await broadcastSharedListChanged(id, "list");

  return NextResponse.json({ sig, groups, cached: false });
}
