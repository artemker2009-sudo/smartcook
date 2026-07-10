import { NextResponse } from "next/server";

// Digital Asset Links для TWA (RuStore / Google Play). Отдаётся по каноническому
// пути /.well-known/assetlinks.json (rewrite в next.config). Содержимое —
// из env ASSETLINKS_JSON: отпечаток подписи (sha256_cert_fingerprints) и имя
// пакета известны только после сборки TWA-пакета, поэтому в код их не зашиваем.
//
// Пока env не задан — 404: пусть Play/RuStore видят «ещё не настроено», а не
// пустой/битый JSON. Как только пакет создан — кладём готовый массив в
// ASSETLINKS_JSON, и проверка ассоциации домена проходит без деплоя кода.
//
// Формат ASSETLINKS_JSON (строка с JSON-массивом), например:
// [{"relation":["delegate_permission/common.handle_all_urls"],
//   "target":{"namespace":"android_app","package_name":"pro.smartcook.twa",
//   "sha256_cert_fingerprints":["AA:BB:..."]}}]

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = process.env.ASSETLINKS_JSON;
  if (!raw || !raw.trim()) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Валидируем, что env — корректный JSON. Мусор в assetlinks ломает проверку
  // ассоциации домена молча, поэтому лучше явный 500 в логах, чем битый ответ.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse("Misconfigured ASSETLINKS_JSON", { status: 500 });
  }

  return NextResponse.json(parsed, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
