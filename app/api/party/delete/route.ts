import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { canDeleteParty, deletePartyWithChildren } from "@/lib/partyDelete";
import { FEATURE_BANQUETS } from "@/lib/features";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Удаление банкета организатором из хаба «Мои банкеты».
// Кто вызывает — берём ТОЛЬКО из проверенного access token (Authorization:
// Bearer), не из тела запроса. Удаляем, только если этот пользователь —
// организатор: parties.host_id === user.id. Гость-организатор без аккаунта
// (host_id = device-id из localStorage) доказать владение не может — такой
// банкет удаляет только админ; хаб у гостя просто убирает его из списка.
export async function POST(req: Request) {
  // Банкеты скрыты флагом.
  if (!FEATURE_BANQUETS) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Войдите в аккаунт, чтобы удалить банкет." }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { partyId?: unknown } | null;
  const partyId = typeof body?.partyId === "string" ? body.partyId.trim() : "";
  if (!UUID_RE.test(partyId)) {
    return NextResponse.json({ error: "Некорректный банкет." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: party, error: readError } = await admin
    .from("parties")
    .select("id, host_id")
    .eq("id", partyId)
    .maybeSingle();

  if (readError) {
    console.error("[party/delete] read failed", readError.message);
    return NextResponse.json({ error: "Не удалось удалить банкет. Попробуйте позже." }, { status: 500 });
  }
  if (!party) {
    return NextResponse.json({ error: "Банкет не найден." }, { status: 404 });
  }
  if (!canDeleteParty(party.host_id, userId)) {
    return NextResponse.json({ error: "Удалить банкет может только его организатор." }, { status: 403 });
  }

  const result = await deletePartyWithChildren(admin, partyId);
  if (!result.ok) {
    console.error("[party/delete] delete failed", result.error);
    return NextResponse.json({ error: "Не удалось удалить банкет. Попробуйте позже." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
