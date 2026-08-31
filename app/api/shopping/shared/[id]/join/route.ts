import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { checkAndConsumeSharedListJoinRateLimit, sharedListRateLimitResponse } from "@/lib/rateLimit";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  MAX_MEMBERS_PER_LIST,
  findLiveList,
  isUuid,
  sanitizeMemberName,
  sanitizeMemberRef,
  sharedSortFromRow,
} from "@/lib/sharedShoppingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Вступление в список по ссылке — без регистрации.
 *
 * memberRef генерирует клиент (crypto.randomUUID) и хранит у себя; сервер ему
 * доверяет на вставке — ровно та же модель, что у party.user_id. Сильнее без
 * регистрации каждого гостя не сделать, а регистрация противоречит принципу
 * анонимности.
 *
 * Повторный вызов с тем же memberRef не создаёт второго участника: обновляет
 * имя (человек перезашёл по ссылке и представился иначе) и отдаёт снимок.
 * Вышедший ранее участник (left_at) этим же вызовом возвращается в список.
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

  const raw = body as { memberRef?: unknown; name?: unknown };
  const memberRef = sanitizeMemberRef(raw.memberRef);
  const name = sanitizeMemberName(raw.name);
  if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Представьтесь, пожалуйста" }, { status: 400 });

  const rateLimit = await checkAndConsumeSharedListJoinRateLimit(req);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const list = await findLiveList(supabase, id);
  if (!list) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  // Ищем строку участника ВКЛЮЧАЯ вышедших: у пары (список, ref) уникальный
  // индекс, поэтому повторный insert упал бы — вернувшегося надо обновлять.
  const { data: existing, error: existingError } = await supabase
    .from("shared_list_members")
    .select("id,member_name,left_at")
    .eq("shared_list_id", id)
    .eq("member_ref", memberRef)
    .maybeSingle();
  if (existingError) {
    console.error("[sharedShopping] join lookup failed", existingError.message);
    return NextResponse.json({ error: "Не удалось вступить в список" }, { status: 500 });
  }

  let joinedNow = false;

  if (existing) {
    const returning = existing.left_at !== null;
    if (returning || existing.member_name !== name) {
      const { error: updateError } = await supabase
        .from("shared_list_members")
        .update({ member_name: name, left_at: null })
        .eq("id", existing.id);
      if (updateError) {
        console.error("[sharedShopping] join update failed", updateError.message);
        return NextResponse.json({ error: "Не удалось вступить в список" }, { status: 500 });
      }
    }
    joinedNow = returning;
  } else {
    const { count, error: countError } = await supabase
      .from("shared_list_members")
      .select("id", { count: "exact", head: true })
      .eq("shared_list_id", id)
      .is("left_at", null);
    if (countError) {
      console.error("[sharedShopping] join count failed", countError.message);
      return NextResponse.json({ error: "Не удалось вступить в список" }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_MEMBERS_PER_LIST) {
      return NextResponse.json(
        { error: "В этом списке уже максимум участников" },
        { status: 409 },
      );
    }

    const { error: insertError } = await supabase
      .from("shared_list_members")
      .insert([{ shared_list_id: id, member_ref: memberRef, member_name: name }]);
    if (insertError) {
      console.error("[sharedShopping] join insert failed", insertError.message);
      return NextResponse.json({ error: "Не удалось вступить в список" }, { status: 500 });
    }
    joinedNow = true;
  }

  const [itemsResult, membersResult] = await Promise.all([
    supabase
      .from("shared_list_items")
      .select("id,name,checked,checked_by,created_by,created_at")
      .eq("shared_list_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("shared_list_members")
      .select("member_ref,member_name,joined_at")
      .eq("shared_list_id", id)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
  ]);

  if (itemsResult.error || membersResult.error) {
    console.error(
      "[sharedShopping] join snapshot failed",
      itemsResult.error?.message,
      membersResult.error?.message,
    );
    return NextResponse.json({ error: "Не удалось загрузить список" }, { status: 500 });
  }

  if (joinedNow) await broadcastSharedListChanged(id, "members");

  return NextResponse.json({
    id: list.id,
    name: list.name,
    ownerRef: list.owner_ref,
    updatedAt: list.updated_at,
    joined: true,
    memberRef,
    sort: sharedSortFromRow(list),
    items: (itemsResult.data ?? []).map((it) => ({
      id: it.id,
      name: it.name,
      checked: it.checked,
      checkedBy: it.checked_by,
      createdBy: it.created_by,
    })),
    members: (membersResult.data ?? []).map((m) => ({
      memberRef: m.member_ref,
      name: m.member_name,
      joinedAt: m.joined_at,
    })),
  });
}
