import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { sendPlainAlert } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Перенос гостевых рецептов устройства в аккаунт (PR 2), по образцу
// /api/party/claim.
//
// Владелец (accountUserId) берётся ТОЛЬКО из проверенной сессии (JWT), никогда
// из тела запроса. Переносим строго через UPDATE — ни одного INSERT и ни одного
// DELETE, поэтому потерять рецепт эта операция не может физически: она меняет
// владельца строки, а не создаёт и не удаляет строки.
//
// Красная линия: ни один рецепт не теряется, дубль лучше потери. Поэтому
// дедупликации здесь нет намеренно. Если гость сохранил «Борщ» и в аккаунте уже
// есть свой «Борщ» — станет два, и это правильный исход.

// UUID = идентификатор аккаунта. Гостевой — "user_xxxxxxxxx".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Потолки — защита в глубину. Устройство физически не накапливает много
// гостевых идентификаторов (в проде максимум 13 рецептов на один id), поэтому
// любой запрос с сотней id — это не пользователь.
const MAX_IDS_PER_REQUEST = 20;
// Сколько строк за один запрос считаем нормальным. Выше — уведомление в
// Telegram основателю. Не блокировка: оборвать законный перенос на полпути
// хуже, чем узнать о нём постфактум.
const ALERT_ROWS_THRESHOLD = 50;

export async function POST(req: Request) {
  const accountUserId = await getVerifiedUserId(req);
  if (!accountUserId) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { guestIds?: unknown } | null;
  const raw = Array.isArray(body?.guestIds) ? body!.guestIds : [];

  const guestIds = raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    // Забирать разрешено ТОЛЬКО гостевые идентификаторы. UUID отбрасываем
    // специально: это идентификатор чужого аккаунта, и «перенос» такого id был
    // бы кражей чужой истории, а не переносом своей.
    .filter((v) => v.length >= 6 && v.length <= 64 && !UUID_RE.test(v) && v !== accountUserId)
    .slice(0, MAX_IDS_PER_REQUEST);

  if (!guestIds.length) {
    return NextResponse.json({ claimed: 0, claimedIds: [] });
  }

  const supabase = createServiceRoleClient();
  const claimedIds: string[] = [];
  let rows = 0;

  for (const guestId of guestIds) {
    // claimed_from is null — строка переносится РОВНО ОДИН РАЗ. Уже перенесённую
    // (кем угодно и когда угодно) увести повторно нельзя.
    const { data, error } = await supabase
      .from("recipes")
      .update({ session_id: accountUserId, claimed_from: guestId })
      .eq("session_id", guestId)
      .is("claimed_from", null)
      .select("id");

    if (error) {
      console.error("[recipes/claim] update failed:", error.message);
      continue;
    }

    // Идентификатор считаем отработанным, даже если строк не нашлось: это
    // устройство, где гость ничего не сохранил. Иначе клиент будет слать его
    // при каждом входе вечно.
    claimedIds.push(guestId);
    rows += data?.length ?? 0;
  }

  if (rows >= ALERT_ROWS_THRESHOLD) {
    // Без идентификаторов и содержимого рецептов — только факт и числа.
    void sendPlainAlert(
      `⚠️ Необычно крупный перенос рецептов\n\n` +
        `Строк: ${rows}\nГостевых идентификаторов: ${claimedIds.length}\n\n` +
        `Порог — ${ALERT_ROWS_THRESHOLD}. Откат: см. supabase_recipes_claimed_from.sql.`,
    );
  }

  return NextResponse.json({ claimed: rows, claimedIds });
}
