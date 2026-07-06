import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host;
  } catch {
    return "";
  }
})();

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://mc.yandex.ru https://va.vercel-scripts.com`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://api.openai.com https://mc.yandex.ru https://vitals.vercel-insights.com https://va.vercel-scripts.com`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export function proxy(request: NextRequest) {
  // За реверс-прокси (Vercel и т.п.) сам протокол в request.nextUrl всегда http,
  // реальную схему клиента показывает x-forwarded-proto.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (process.env.NODE_ENV === "production" && forwardedProto === "http") {
    const httpsUrl = new URL(request.nextUrl.toString());
    httpsUrl.protocol = "https:";
    return withSecurityHeaders(NextResponse.redirect(httpsUrl, 308));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return withSecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\..*).*)"],
};
