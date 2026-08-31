import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { checkAndConsumeSharedListWriteRateLimit, sharedListRateLimitResponse } from "@/lib/rateLimit";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  findMembership,
  isUuid,
  sanitizeMemberRef,
  touchSharedList,
} from "@/lib/sharedShoppingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

/**
 * Изменение одной позиции: чиркнуть, вернуть или убрать из списка.
 *
 * Убрать — это ВСЕГДА мягкое удаление (`deleted_at`), а не DELETE из таблицы:
 * решение основателя — данные не удаляем никогда. Отсюда и один PATCH на все
 * три действия вместо PATCH + DELETE: физически это всё UPDATE одной строки.
 */
export async function PATCH(req: Request, context: RouteParams) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  const { id, itemId } = await context.params;
  if (!id || !isUuid(id) || !itemId || !isUuid(itemId)) {
    return NextResponse.json({ error: "Позиция не найдена" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const raw = body as { memberRef?: unknown; checked?: unknown; deleted?: unknown };
  const memberRef = sanitizeMemberRef(raw.memberRef);
  if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });

  const wantsDelete = raw.deleted === true;
  const wantsCheck = typeof raw.checked === "boolean";
  if (!wantsDelete && !wantsCheck) {
    return NextResponse.json({ error: "Нечего менять" }, { status: 400 });
  }

  const rateLimit = await checkAndConsumeSharedListWriteRateLimit(req, memberRef);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const membership = await findMembership(supabase, id, memberRef);
  if (!membership) return NextResponse.json({ error: "Вы не участник этого списка" }, { status: 403 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (wantsDelete) {
    patch.deleted_at = now;
  } else if (wantsCheck) {
    patch.checked = raw.checked;
    // Кто отметил купленным — чтобы в семье было видно, что уже взяли.
    // Снятие галочки авторство обнуляет.
    patch.checked_by = raw.checked ? memberRef : null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("shared_list_items")
    .update(patch)
    .eq("id", itemId)
    .eq("shared_list_id", id)
    // Уже убранную позицию второй раз не трогаем: повтор из офлайн-очереди не
    // должен переписывать отметку времени удаления.
    .is("deleted_at", null)
    .select("id,name,checked,checked_by")
    .maybeSingle();

  if (updateError) {
    console.error("[sharedShopping] patch item failed", updateError.message);
    return NextResponse.json({ error: "Не удалось обновить позицию" }, { status: 500 });
  }
  if (!updated) {
    // Позиции нет или её уже убрал другой участник — для клиента это не ошибка,
    // а гонка: он всё равно перечитает снимок.
    return NextResponse.json({ error: "Позиция не найдена", stale: true }, { status: 404 });
  }

  // Независимы друг от друга — не выстраиваем в цепочку: каждый лишний
  // последовательный round-trip до Supabase человек чувствует пальцем.
  await Promise.all([touchSharedList(supabase, id), broadcastSharedListChanged(id, "items")]);

  return NextResponse.json({
    item: {
      id: updated.id,
      name: updated.name,
      checked: updated.checked,
      checkedBy: updated.checked_by,
      deleted: wantsDelete,
    },
  });
}
