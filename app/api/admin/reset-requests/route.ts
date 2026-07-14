import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { issueRecoveryCodeByUsername } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Обработка заявок на восстановление доступа.
//   action=issue → выдать пользователю НОВЫЙ код восстановления (пароль НЕ
//     трогаем: админ не придумывает пароль за человека и не пересылает его).
//     Код возвращается сюда, админ шлёт его пользователю в Telegram, а тот сам
//     задаёт себе пароль в форме «Забыли пароль». Старый код при этом сгорает.
//   action=done  → закрыть заявку (убрать из «новых»).
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) return NextResponse.json({ error: "Не хватает ID заявки" }, { status: 400 });

  const admin = createServiceRoleClient();

  if (action === "done") {
    const { error } = await admin.from("password_reset_requests").update({ status: "done" }).eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось закрыть заявку." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action !== "issue") {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }

  // Логин берём из самой заявки, а не из тела запроса — так админ не сможет
  // случайно выдать код не тому пользователю.
  const { data: request, error: loadError } = await admin
    .from("password_reset_requests")
    .select("username")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !request?.username) {
    return NextResponse.json({ error: "Заявка не найдена." }, { status: 404 });
  }

  const result = await issueRecoveryCodeByUsername(admin, request.username as string);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json(
        { error: `Пользователь «${request.username}» не найден — возможно, логин указан с ошибкой.` },
        { status: 404 },
      );
    }
    return NextResponse.json({ error: "Не удалось выдать код." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, username: request.username, recoveryCode: result.recoveryCode });
}
