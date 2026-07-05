import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME, createAdminSessionToken, verifyAdminPassword } from "@/lib/adminAuth";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Ограничиваем перебор пароля тем же IP-лимитером, что и AI-роуты.
  const rateLimit = await checkAndConsumeAiRateLimit(req, "admin-login");
  if (!rateLimit.ok) return rateLimitResponse(rateLimit);

  const body = await req.json().catch(() => null);
  const password = body?.password;

  if (!verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
