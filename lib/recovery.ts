import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Аккаунты у нас анонимные — ни почты, ни телефона. Поэтому обычный
// «сброс по ссылке на email» невозможен. Вместо этого при регистрации
// выдаём одноразовый КОД ВОССТАНОВЛЕНИЯ (recovery code): пользователь
// сохраняет его сам, а при потере пароля вводит логин + код + новый пароль.
// В базе пароль-код не храним в открытом виде — только HMAC-хеш в
// app_metadata (его нельзя перезаписать обычным клиентом, правит только
// сервис-роль). Плюс есть запасной путь «через админа» (Telegram-заявка).

// Логин детерминированно маппится в псевдо-email, чтобы Supabase-auth,
// который требует email, работал без реальной почты.
export const USERNAME_EMAIL_DOMAIN = "smartcook.app";

export function usernameToEmail(username: string): string {
  return `${username}@${USERNAME_EMAIL_DOMAIN}`;
}

// Алфавит без визуально похожих символов (нет O/0/I/1/L), чтобы код было
// легко переписать с экрана и продиктовать.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomChars(n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// Формат: CHEF-XXXX-XXXX (8 значимых символов из 31-символьного алфавита →
// ~31^8 ≈ 8.5e11 вариантов; вместе с серверным HMAC-секретом офлайн-подбор
// по хешу невозможен без секрета).
export function generateRecoveryCode(): string {
  return `CHEF-${randomChars(4)}-${randomChars(4)}`;
}

// Нормализуем то, что ввёл пользователь: убираем пробелы/дефисы, приводим к
// верхнему регистру — чтобы «chef aaaa bbbb», «CHEF-AAAA-BBBB» и т.п. совпали.
export function normalizeRecoveryCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function recoverySecret(): string {
  // Отдельный секрет не обязателен: переиспользуем уже заведённый в проде
  // ADMIN_SESSION_SECRET, чтобы не требовать новой переменной окружения.
  const secret = process.env.RECOVERY_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("RECOVERY_SECRET or ADMIN_SESSION_SECRET is required");
  return secret;
}

export function hashRecoveryCode(code: string): string {
  return createHmac("sha256", recoverySecret())
    .update(normalizeRecoveryCode(code))
    .digest("hex");
}

export function verifyRecoveryCode(code: string, expectedHash: string | null | undefined): boolean {
  if (!expectedHash) return false;
  const actual = Buffer.from(hashRecoveryCode(code));
  const expected = Buffer.from(expectedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

type AdminUser = { id: string; email?: string | null; app_metadata?: Record<string, unknown> };

// В supabase-js нет «получить пользователя по email», поэтому листаем страницы
// admin.listUsers и ищем точное совпадение. Псевдо-email уникален, поэтому
// первое совпадение — то самое. Кап на страницы, чтобы не крутить бесконечно.
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<AdminUser | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error || !data) return null;
    const found = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (found) return found as AdminUser;
    if (data.users.length < perPage) break; // последняя страница
  }
  return null;
}

// Ставит пользователю новый пароль и выдаёт новый код восстановления
// (старый после сброса больше не действует). Используется и при
// самостоятельном восстановлении по коду, и при сбросе «через админа».
export async function resetUserPasswordByUsername(
  admin: SupabaseClient,
  username: string,
  newPassword: string,
): Promise<{ ok: true; recoveryCode: string } | { ok: false; reason: "not_found" | "update_failed" }> {
  const authUser = await findAuthUserByEmail(admin, usernameToEmail(username));
  if (!authUser) return { ok: false, reason: "not_found" };

  const recoveryCode = generateRecoveryCode();
  const { error } = await admin.auth.admin.updateUserById(authUser.id, {
    password: newPassword,
    app_metadata: { ...(authUser.app_metadata || {}), recovery_hash: hashRecoveryCode(recoveryCode) },
  });
  if (error) return { ok: false, reason: "update_failed" };
  return { ok: true, recoveryCode };
}
