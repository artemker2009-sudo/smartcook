import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { generateRecoveryCode, hashRecoveryCode, usernameToEmail } from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Регистрацию делаем на сервере через сервис-роль (admin.createUser), а не
// клиентским supabase.auth.signUp. Причины:
//  1) код восстановления надо хешировать и класть в app_metadata — это умеет
//     только сервис-роль (обычный клиент app_metadata не пишет);
//  2) надёжная проверка занятости логина и единая серверная валидация;
//  3) rate-limit — иначе аккаунты можно штамповать скриптом.
// email_confirm: true — потому что почта у нас синтетическая
// (username@smartcook.app), подтверждать её некому и незачем. После успеха
// клиент делает обычный signInWithPassword и получает сессию.

const NAME_MAX = 40;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

export async function POST(req: Request) {
  const rate = await checkAndConsumeAiRateLimit(req, "auth-register");
  if (!rate.ok) return rateLimitResponse(rate);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const name = cleanName(body.name);
  const username = typeof body.username === "string" ? body.username.toLowerCase().trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 1) {
    return NextResponse.json({ error: "Введите имя — его будут видеть другие." }, { status: 400 });
  }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json(
      { error: `Логин: латиница, цифры и «_», от ${USERNAME_MIN} до ${USERNAME_MAX} символов.` },
      { status: 400 },
    );
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return NextResponse.json(
      { error: `Пароль должен быть не короче ${PASSWORD_MIN} символов.` },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  const recoveryCode = generateRecoveryCode();

  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password,
    email_confirm: true,
    user_metadata: { full_name: name, username },
    app_metadata: { username, recovery_hash: hashRecoveryCode(recoveryCode) },
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exist") || (error as { status?: number }).status === 422) {
      return NextResponse.json({ error: "Этот логин уже занят. Выберите другой." }, { status: 409 });
    }
    console.error("[auth/register] createUser failed", error.message);
    return NextResponse.json({ error: "Не удалось создать аккаунт. Попробуйте ещё раз." }, { status: 500 });
  }

  // Возвращаем код восстановления ОДИН раз — на клиенте показываем его и просим
  // сохранить. В базе лежит только хеш, повторно показать код невозможно.
  return NextResponse.json({ ok: true, recoveryCode });
}
