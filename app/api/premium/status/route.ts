import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { readPremiumStatus } from "@/lib/premiumServer";
import { getFreePodborsPerWeek } from "@/lib/premiumSettings";

// Состояние Премиума текущего пользователя. Кто спрашивает — определяется
// ТОЛЬКО по проверенному JWT: никаких userId из query или тела (CLAUDE.md,
// правило 2). Чужой Премиум этим роутом не посмотреть в принципе — параметра,
// которым можно было бы назвать другого человека, здесь просто нет.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const [status, freePodborsPerWeek] = await Promise.all([
    readPremiumStatus(userId),
    getFreePodborsPerWeek(),
  ]);

  // Отдаём ровно то, что нужно экрану: срок, признак «навсегда» и настройку.
  // Ни user_id, ни строк заказов здесь нет (CLAUDE.md: лишних полей не отдаём).
  return NextResponse.json({ ...status, freePodborsPerWeek });
}
