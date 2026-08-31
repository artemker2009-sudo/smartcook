import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { getVerifiedUserId } from "@/lib/auth";
import { checkAndConsumeShoppingSortRateLimit, shoppingRateLimitResponse } from "@/lib/rateLimit";
import { MAX_SHOPPING_ITEMS, signatureFromNames } from "@/lib/shoppingList";
import { groupNamesByDepartment } from "@/lib/shoppingSort";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  findLiveList,
  findMembership,
  isUuid,
  sanitizeMemberRef,
} from "@/lib/sharedShoppingServer";

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
