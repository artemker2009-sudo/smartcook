import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { checkAndConsumeSharedListWriteRateLimit, sharedListRateLimitResponse } from "@/lib/rateLimit";
import { MAX_SHOPPING_ITEMS, sameName } from "@/lib/shoppingList";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  findLiveList,
  findMembership,
  isUuid,
  sanitizeItemNameForDb,
  sanitizeMemberRef,
  touchSharedList,
} from "@/lib/sharedShoppingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Добавляет позиции в общий список.
 *
 * Санитайз, дедуп и лимит — те же правила и те же константы, что у локального
 * списка (lib/shoppingList.ts), проверенные заново на сервере (как в
 * /api/shopping/sort). Лимит считается по ЖИВЫМ позициям: мягко удалённые
 * место в списке не занимают.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const raw = body as { memberRef?: unknown; names?: unknown };
  const memberRef = sanitizeMemberRef(raw.memberRef);
  if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });

  if (!Array.isArray(raw.names) || raw.names.length === 0) {
    return NextResponse.json({ error: "Пустой список позиций" }, { status: 400 });
  }
  if (raw.names.length > MAX_SHOPPING_ITEMS) {
    return NextResponse.json(
      { error: `Слишком много позиций (максимум ${MAX_SHOPPING_ITEMS})` },
      { status: 400 },
    );
  }

  const rateLimit = await checkAndConsumeSharedListWriteRateLimit(req, memberRef);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const list = await findLiveList(supabase, id);
  if (!list) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  const membership = await findMembership(supabase, id, memberRef);
  if (!membership) return NextResponse.json({ error: "Вы не участник этого списка" }, { status: 403 });

  const { data: currentItems, error: currentError } = await supabase
    .from("shared_list_items")
    .select("name")
    .eq("shared_list_id", id)
    .is("deleted_at", null);
  if (currentError) {
    console.error("[sharedShopping] add items: load current failed", currentError.message);
    return NextResponse.json({ error: "Не удалось добавить позиции" }, { status: 500 });
  }

  const existingNames = (currentItems ?? []).map((it) => it.name as string);
  const toInsert: string[] = [];
  let duplicate = 0;
  let limited = false;

  for (const candidate of raw.names) {
    const name = sanitizeItemNameForDb(candidate);
    if (!name) continue;
    if (existingNames.some((n) => sameName(n, name)) || toInsert.some((n) => sameName(n, name))) {
      duplicate++;
      continue;
    }
    if (existingNames.length + toInsert.length >= MAX_SHOPPING_ITEMS) {
      limited = true;
      break;
    }
    toInsert.push(name);
  }

  let inserted: { id: string; name: string; checked: boolean }[] = [];
  if (toInsert.length > 0) {
    const { data, error: insertError } = await supabase
      .from("shared_list_items")
      .insert(toInsert.map((name) => ({ shared_list_id: id, name, created_by: memberRef })))
      .select("id,name,checked");
    if (insertError) {
      console.error("[sharedShopping] add items failed", insertError.message);
      return NextResponse.json({ error: "Не удалось добавить позиции" }, { status: 500 });
    }
    inserted = data ?? [];
    await Promise.all([touchSharedList(supabase, id), broadcastSharedListChanged(id, "items")]);
  }

  return NextResponse.json({ added: inserted.length, duplicate, limited, items: inserted });
}

/**
 * «Очистить купленное» — мягко убирает все отмеченные позиции разом.
 *
 * Отдельный роут, а не N вызовов PATCH: при двадцати купленных позициях это
 * съело бы треть часового лимита записи и устроило бы двадцать broadcast-пингов
 * подряд. Здесь — один UPDATE и один пинг.
 */
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  const url = new URL(req.url);
  const memberRef = sanitizeMemberRef(url.searchParams.get("memberRef"));
  if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });

  const rateLimit = await checkAndConsumeSharedListWriteRateLimit(req, memberRef);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const membership = await findMembership(supabase, id, memberRef);
  if (!membership) return NextResponse.json({ error: "Вы не участник этого списка" }, { status: 403 });

  const now = new Date().toISOString();
  const { data: cleared, error: clearError } = await supabase
    .from("shared_list_items")
    .update({ deleted_at: now, updated_at: now })
    .eq("shared_list_id", id)
    .eq("checked", true)
    .is("deleted_at", null)
    .select("id");

  if (clearError) {
    console.error("[sharedShopping] clear checked failed", clearError.message);
    return NextResponse.json({ error: "Не удалось очистить купленное" }, { status: 500 });
  }

  const removed = cleared?.length ?? 0;
  if (removed > 0) {
    await Promise.all([touchSharedList(supabase, id), broadcastSharedListChanged(id, "items")]);
  }

  return NextResponse.json({ removed });
}
