import { NextResponse } from "next/server";
import convert from "heic-convert";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Серверная конвертация HEIC/HEIF → JPEG. Нужна, потому что клиентский декодер
// (heic2any) использует WASM/new Function и блокируется строгим CSP в проде на
// Android — там HEIC не декодировался вообще (фикс I «не сработал на устройстве»).
// В Node ограничений CSP нет, libheif (heic-convert) отрабатывает штатно.
//
// Лимит размера — защита от раздувания (CLAUDE.md п.5). EXIF/гео не переносим:
// heic-convert кодирует JPEG заново из декодированных пикселей (без метаданных),
// плюс клиент ещё раз перерисовывает кадр через canvas при сжатии.
const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Файл слишком большой" }, { status: 413 });
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const output = await convert({ buffer: inputBuffer, format: "JPEG", quality: 0.9 });
    return new NextResponse(Buffer.from(output), {
      status: 200,
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    // Не HEIC/битый файл или декодер не справился.
    return NextResponse.json({ error: "Не удалось конвертировать HEIC" }, { status: 422 });
  }
}
