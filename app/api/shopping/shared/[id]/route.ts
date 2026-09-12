import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import {
  checkAndConsumeReadRateLimit,
  checkAndConsumeSharedListWriteRateLimit,
  readRateLimitResponse,
  sharedListRateLimitResponse,
} from "@/lib/rateLimit";
import { broadcastSharedListChanged } from "@/lib/sharedShoppingBroadcast";
import {
  findLiveList,
  findMembership,
  isUuid,
  sanitizeMemberRef,
  sanitizeSharedListName,
  sharedSortFromRow,
} from "@/lib/sharedShoppingServer";

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

/**
 * Переименование общего списка.
 *
 * Имя живёт в БД и видно ВСЕМ участникам — поэтому это единственная правка
 * списка, которой до сих пор не было (локальный список переименовывался прямо
 * в localStorage). Переименовать может любой участник, а не только владелец:
 * список семейный, и спрашивать разрешения у того, кто его создал, чтобы
 * поправить опечатку, — лишний барьер.
 *
 * Миграции не нужно: колонка name в shared_lists есть с самого начала, вместе
 * с CHECK на длину 1..60 (supabase_shared_shopping_lists.sql).
 */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
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
  if (!memberRef) return NextResponse.json({ error: "Не хватает данных участника" }, { status: 400 });

  const rateLimit = await checkAndConsumeSharedListWriteRateLimit(req, memberRef);
  if (!rateLimit.ok) return sharedListRateLimitResponse(rateLimit);

  const supabase = createServiceRoleClient();
  const list = await findLiveList(supabase, id);
  if (!list) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  // Членство проверяет СЕРВЕР по своей выборке, а не клиент своим словом.
  // Чужой memberRef получает то же «Список не найден», что и несуществующий
  // список: по ответу нельзя узнать, существует ли список вообще.
  const membership = await findMembership(supabase, id, memberRef);
  if (!membership) return NextResponse.json({ error: "Список не найден" }, { status: 404 });

  // Пустое имя не принимаем совсем, а не подставляем старое молча: человек
  // стёр всё и нажал «Сохранить» — он должен увидеть, что так нельзя.
  const name = sanitizeSharedListName(raw.name, "");
  if (!name) return NextResponse.json({ error: "Впишите название списка" }, { status: 400 });

  const { data, error } = await supabase
    .from("shared_lists")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null)
    .select("id,name,updated_at")
    .single();

  if (error || !data) {
    console.error("[sharedShopping] rename failed", error?.message);
    return NextResponse.json({ error: "Не удалось переименовать список" }, { status: 500 });
  }

  // Пинг в тот же канал, что у позиций: остальные участники перечитают снимок
  // и увидят новое имя. Best-effort — запись в БД уже прошла.
  await broadcastSharedListChanged(id, "list");

  return NextResponse.json({ id: data.id, name: data.name, updatedAt: data.updated_at });
}
