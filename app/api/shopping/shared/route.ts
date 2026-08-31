import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { checkAndConsumeSharedListCreateRateLimit, sharedListRateLimitResponse } from "@/lib/rateLimit";
import { MAX_SHOPPING_ITEMS, sameName } from "@/lib/shoppingList";
import { defaultListName } from "@/lib/shoppingLists";
import {
  sanitizeItemNameForDb,
  sanitizeMemberName,
  sanitizeMemberRef,
  sanitizeSharedListName,
} from "@/lib/sharedShoppingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Создаёт общий список. Владелец сразу становится участником — поэтому дальше
 * во всех роутах достаточно одной проверки «состоит в shared_list_members».
 *
 * Стартовые позиции приходят снимком с клиента («Сделать общим» для локального
 * списка). Локальный список при этом НЕ трогается и НЕ удаляется: дальше это
 * две независимые сущности.
 */
export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const raw = body as { name?: unknown; items?: unknown; ownerRef?: unknown; ownerName?: unknown };
  const ownerRef = sanitizeMemberRef(raw.ownerRef);
  const ownerName = sanitizeMemberName(raw.ownerName);
  if (!ownerRef || !ownerName) {
    return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });
  }

  if (raw.items !== undefined && !Array.isArray(raw.items)) {
    return NextResponse.json({ error: "Некорректный список позиций" }, { status: 400 });
  }
  const rawItems: unknown[] = Array.isArray(raw.items) ? raw.items : [];
  if (rawItems.length > MAX_SHOPPING_ITEMS) {
    return NextResponse.json(
      { error: `Слишком много позиций (максимум ${MAX_SHOPPING_ITEMS})` },
      { status: 400 },
    );
  }

  const name = sanitizeSharedListName(raw.name, defaultListName());

  // Санитайз + дедуп теми же правилами, что у локального списка. Клиент это уже
  // сделал — проверяем заново, ему не верим.
  const names: string[] = [];
  for (const candidate of rawItems) {
    const clean = sanitizeItemNameForDb(candidate);
    if (!clean) continue;
    if (names.some((n) => sameName(n, clean))) continue;
    names.push(clean);
    if (names.length >= MAX_SHOPPING_ITEMS) break;
  }

  const rateLimit = await checkAndConsumeSharedListCreateRateLimit(req);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();

  const { data: list, error: listError } = await supabase
    .from("shared_lists")
    .insert([{ name, owner_ref: ownerRef }])
    .select("id,name,owner_ref,updated_at")
    .single();
  if (listError || !list) {
    console.error("[sharedShopping] create list failed", listError?.message);
    return NextResponse.json({ error: "Не удалось создать список" }, { status: 500 });
  }

  const { data: member, error: memberError } = await supabase
    .from("shared_list_members")
    .insert([{ shared_list_id: list.id, member_ref: ownerRef, member_name: ownerName }])
    .select("member_ref,member_name,joined_at")
    .single();
  if (memberError || !member) {
    console.error("[sharedShopping] create owner membership failed", memberError?.message);
    // Список создан, но без владельца в участниках — он недостижим ни для кого.
    // Данные не удаляем (решение основателя), поэтому просто архивируем: строка
    // остаётся в базе, но в выдачу и в поиск по ссылке больше не попадает.
    await supabase
      .from("shared_lists")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", list.id);
    return NextResponse.json({ error: "Не удалось создать список" }, { status: 500 });
  }

  let items: { id: string; name: string; checked: boolean }[] = [];
  if (names.length > 0) {
    const { data: insertedItems, error: itemsError } = await supabase
      .from("shared_list_items")
      .insert(names.map((itemName) => ({ shared_list_id: list.id, name: itemName, created_by: ownerRef })))
      .select("id,name,checked");
    if (itemsError) {
      // Список уже создан и рабочий — не роняем создание из-за стартовых
      // позиций, человек добавит их руками. Но и молчать нельзя.
      console.error("[sharedShopping] create initial items failed", itemsError.message);
    } else {
      items = insertedItems ?? [];
    }
  }

  return NextResponse.json({
    id: list.id,
    name: list.name,
    ownerRef: list.owner_ref,
    updatedAt: list.updated_at,
    joined: true,
    items,
    members: [{ memberRef: member.member_ref, name: member.member_name, joinedAt: member.joined_at }],
  });
}
