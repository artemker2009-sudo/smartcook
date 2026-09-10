import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { readGuestRef, newGuestRef, setGuestCookie } from "@/lib/guestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Выдача гостевой сессии перед отправкой предложения.
//
// Зачем отдельный роут. Cookie sc_guest ставится ЛЕНИВО — только когда гость
// реально что-то делает (см. lib/guestSession.ts), поэтому у человека, который
// впервые открыл сайт, её ещё нет. Если бы её ставил сам POST /api/suggestions,
// то «отправка без сессии» стала бы невозможным состоянием, и роут никогда не
// отвечал бы 401 — то есть отправить предложение мог бы любой скрипт с нуля,
// а суточный лимит обнулялся бы выбрасыванием cookie.
//
// Поэтому личность выдаётся здесь, в момент ОТКРЫТИЯ шторки (реальное действие
// живого человека), а POST остаётся строгим: нет личности — 401.
export async function GET(req: Request) {
  // Залогиненному гостевая cookie не нужна: его личность — проверенный JWT.
  const userId = await getVerifiedUserId(req);
  if (userId) return NextResponse.json({ ready: true });

  const existing = readGuestRef(req);
  if (existing) return NextResponse.json({ ready: true });

  // Наружу отдаём только факт готовности — сам ref живёт в httpOnly-cookie и
  // скриптам на странице не виден.
  const res = NextResponse.json({ ready: true });
  setGuestCookie(res, newGuestRef());
  return res;
}
