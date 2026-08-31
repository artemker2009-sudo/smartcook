import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeReadRateLimit, readRateLimitResponse } from "@/lib/rateLimit";
import { findLiveList, findMembership, isUuid, sanitizeMemberRef } from "@/lib/sharedShoppingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Снимок списка.
 *
 * Без memberRef (или с ref, который в списке не состоит) отдаём ТОЛЬКО превью:
 * имя и число позиций. Сами позиции — нет. Ссылка даёт право вступить, а не
 * право молча читать чужой список (решение основателя, REALTIME_SHOPPING_PLAN.md §0).
 *
 * С валидным memberRef — полный снимок: позиции, участники, кто владелец.
 */
export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id || !isUuid(id)) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  const rateLimit = await checkAndConsumeReadRateLimit(req, "shared-shopping-get");
  if (!rateLimit.ok) return readRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const list = await findLiveList(supabase, id);
  if (!list) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  const url = new URL(req.url);
  const memberRef = sanitizeMemberRef(url.searchParams.get("memberRef"));
  const membership = memberRef ? await findMembership(supabase, id, memberRef) : null;

  if (!membership) {
    // Превью до вступления: имя и сколько позиций. Мягко удалённые не считаем.
    const { count, error } = await supabase
      .from("shared_list_items")
      .select("id", { count: "exact", head: true })
      .eq("shared_list_id", id)
      .is("deleted_at", null);
    if (error) console.error("[sharedShopping] preview count failed", error.message);
    return NextResponse.json({
      id: list.id,
      name: list.name,
      itemCount: count ?? 0,
      joined: false,
    });
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
      "[sharedShopping] snapshot failed",
      itemsResult.error?.message,
      membersResult.error?.message,
    );
    return NextResponse.json({ error: "Не удалось загрузить список" }, { status: 500 });
  }

  return NextResponse.json({
    id: list.id,
    name: list.name,
    ownerRef: list.owner_ref,
    updatedAt: list.updated_at,
    joined: true,
    memberRef: membership.member_ref,
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
