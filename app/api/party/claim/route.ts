import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Claim = { partyId: string; anonUserId: string };

// Привязывает к аккаунту анонимные банкеты/участия с устройства (задача E).
// Владелец (accountUserId) берётся ТОЛЬКО из проверенной сессии (JWT), а не из
// тела запроса. Переносим строго через UPDATE/DELETE (никаких INSERT), поэтому
// триггер лимита гостей (ТГ-гейт «с 3-го гостя») не срабатывает заново, и дублей
// участий не возникает.
export async function POST(req: Request) {
  const accountUserId = await getVerifiedUserId(req);
  if (!accountUserId) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { claims?: unknown } | null;
  const rawClaims = Array.isArray(body?.claims) ? body!.claims : [];

  const claims: Claim[] = rawClaims
    .filter(
      (c): c is Claim =>
        !!c && typeof (c as Claim).partyId === "string" && typeof (c as Claim).anonUserId === "string",
    )
    .map((c) => ({ partyId: c.partyId.trim(), anonUserId: c.anonUserId.trim() }))
    // anonUserId === accountUserId переносить нечего; пустые отбрасываем.
    .filter((c) => c.partyId && c.anonUserId && c.anonUserId !== accountUserId)
    .slice(0, 100);

  if (!claims.length) {
    return NextResponse.json({ claimed: 0 });
  }

  const supabase = createServiceRoleClient();
  let claimed = 0;

  for (const { partyId, anonUserId } of claims) {
    // 1) Гостевое участие: переносим строку участника с анонимного device-id
    //    на аккаунт (rename), без создания новой строки.
    const { data: existingAccountMember } = await supabase
      .from("party_members")
      .select("id")
      .eq("party_id", partyId)
      .eq("user_id", accountUserId)
      .maybeSingle();

    if (existingAccountMember?.id) {
      // Аккаунт уже участник — убираем возможный анонимный дубль.
      await supabase.from("party_members").delete().eq("party_id", partyId).eq("user_id", anonUserId);
    } else {
      const { data: renamed } = await supabase
        .from("party_members")
        .update({ user_id: accountUserId })
        .eq("party_id", partyId)
        .eq("user_id", anonUserId)
        .select("id");
      if (renamed && renamed.length) claimed += 1;
    }

    // 2) Созданный банкет: переносим host_id с анонимного device-id на аккаунт.
    const { data: rehosted } = await supabase
      .from("parties")
      .update({ host_id: accountUserId })
      .eq("id", partyId)
      .eq("host_id", anonUserId)
      .select("id");
    if (rehosted && rehosted.length) claimed += 1;
  }

  return NextResponse.json({ claimed });
}
