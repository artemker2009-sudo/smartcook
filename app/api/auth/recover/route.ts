import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeAuthRateLimit, authRateLimitResponse } from "@/lib/rateLimit";
import {
  findAuthUserByEmail,
  resetUserPasswordByUsername,
  usernameToEmail,
  verifyRecoveryCode,
} from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

// Самостоятельное восстановление пароля: логин + код восстановления → новый
// пароль. Проверяем HMAC-хеш кода из app_metadata. Успех возвращает новый код
// восстановления (старый сгорает). Строго rate-limited — это защита от
// перебора кодов.
export async function POST(req: Request) {
  const rate = await checkAndConsumeAuthRateLimit(req, "auth-recover");
  if (!rate.ok) return authRateLimitResponse(rate);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const username = typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const code = typeof body.code === "string" ? body.code : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!/^[a-z0-9_]{3,20}$/.test(username) || !code.trim()) {
    return NextResponse.json({ error: "Введите логин и код восстановления." }, { status: 400 });
  }
  if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
    return NextResponse.json(
      { error: `Новый пароль должен быть не короче ${PASSWORD_MIN} символов.` },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const authUser = await findAuthUserByEmail(admin, usernameToEmail(username));

  // Один и тот же ответ для «нет такого логина» и «неверный код», чтобы нельзя
  // было по ответу узнать, какие логины существуют.
  const invalid = () =>
    NextResponse.json({ error: "Неверный логин или код восстановления." }, { status: 401 });

  if (!authUser) return invalid();
  const expectedHash = (authUser.app_metadata as { recovery_hash?: string } | undefined)?.recovery_hash;
  if (!verifyRecoveryCode(code, expectedHash)) return invalid();

  const result = await resetUserPasswordByUsername(admin, username, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: "Не удалось сменить пароль. Попробуйте позже." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recoveryCode: result.recoveryCode });
}
