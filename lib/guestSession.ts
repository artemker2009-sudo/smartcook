import type { NextResponse } from "next/server";

// Гостевая сессия для действий без регистрации (сейчас — лайки в ленте).
//
// Принципиально: идентичность гостя живёт в httpOnly-cookie, которую выдаёт
// СЕРВЕР. Ни localStorage (`cook_user_id`), ни поле в теле запроса для этого не
// годятся — и то и другое клиент подменяет одной строкой в консоли, а значит
// счётчик лайков накручивается перебором идентификаторов. httpOnly к тому же
// закрывает cookie от чтения любым скриптом на странице.
//
// Cookie ставится ЛЕНИВО — только когда гость впервые совершает действие
// (лайк). Простой просмотр сайта новых cookie не создаёт.

export const GUEST_COOKIE = "sc_guest";
const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // год

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Читает guest_ref из входящего запроса. Возвращает null, если cookie нет или
// её значение не похоже на UUID (мусор/подделку не принимаем — выдадим новую).
export function readGuestRef(req: Request): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== GUEST_COOKIE) continue;
    const value = decodeURIComponent(part.slice(eq + 1).trim());
    return UUID_RE.test(value) ? value.toLowerCase() : null;
  }
  return null;
}

export function newGuestRef(): string {
  return crypto.randomUUID();
}

// Ставит cookie на ответ. Вызывать только когда гость реально что-то сделал.
// secure — в проде (на localhost по http Secure-cookie браузер отбросит).
export function setGuestCookie(res: NextResponse, guestRef: string): void {
  res.cookies.set({
    name: GUEST_COOKIE,
    value: guestRef,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
}
