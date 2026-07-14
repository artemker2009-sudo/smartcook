import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { resetUserPasswordByUsername } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

// Ручной сброс пароля «через админа» — по заявке пользователя (пришла в
// Telegram). Ставим новый пароль и выдаём новый код восстановления, который ты
// сообщаешь пользователю. Доступ только по admin-сессии.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof body?.username === "string" ? body.username.toLowerCase().trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json({ error: "Некорректный логин" }, { status: 400 });
  }
  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${PASSWORD_MIN} символов.` },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const result = await resetUserPasswordByUsername(admin, username, newPassword);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Пользователь с таким логином не найден." }, { status: 404 });
    }
    return NextResponse.json({ error: "Не удалось сбросить пароль." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recoveryCode: result.recoveryCode });
}
