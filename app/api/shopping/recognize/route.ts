import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import {
  checkAndConsumeShoppingPhotoRateLimit,
  shoppingPhotoRateLimitResponse,
} from "@/lib/rateLimit";
import { parseRecognizedList } from "@/lib/shoppingPhoto";
import { UnsupportedImageError, normalizeToJpeg } from "@/lib/imageNormalize";

export const runtime = "nodejs";
// Второй vision-роут (фото рукописного списка). Причина та же, что у
// /api/analyze: без явного лимита платформа рвёт долгий запрос раньше, чем
// сработает клиентский таймаут, и сбой приходит без внятного шага.
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Распознавание списка покупок по фото (лист бумаги, блокнот, записка на
// холодильнике). Фото приходит на НАШ роут и уходит в OpenAI только отсюда —
// ключ живёт в env на сервере и в браузер не попадает (правило 4 CLAUDE.md).
//
// Роут НИЧЕГО не хранит: ни фото, ни распознанный текст в БД не пишутся.
//
// Формат фото не ограничиваем: телефон и «Файлы» отдают что угодно — HEIC с
// айфона, WebP из мессенджера, AVIF, TIFF со сканера, BMP. Клиент старается
// привести кадр к JPEG сам, но браузер умеет не всё (canvas не знает TIFF и
// HEIC), поэтому он вправе прислать оригинал — сервер приведёт его к JPEG через
// normalizeToJpeg (sharp + libheif). В OpenAI в любом случае уходит JPEG:
// vision принимает только jpeg/png/webp/gif.
//
// Защита расходов (правило 5 CLAUDE.md):
//  - потолок размера ЗАГРУЖАЕМОГО файла,
//  - rate-limit по IP и пользователю со СВОИМ бюджетом (vision дороже текста),
//  - нормализация ужимает кадр до 1800px ДО отправки в модель — в модель теперь
//    уходит меньше, чем раньше уходило исходником,
//  - не больше MAX_SHOPPING_ITEMS позиций из ответа (режется в parseRecognizedList).
//
// Потолок тот же, что у /api/convert-heic: туда тоже льют необработанные
// оригиналы с телефона, а они заметно тяжелее сжатых клиентом.
const MAX_BYTES = 15 * 1024 * 1024;

// Явно НЕ изображения: отсекаем бесплатно, до лимита и до работы sharp.
const NON_IMAGE_TYPE = /^(video|audio|text)\//i;

const PROMPT = `Ты разбираешь ФОТО списка покупок: лист бумаги, страница блокнота,
записка на холодильнике, заметка на экране телефона. Почерк может быть неразборчивым.

=== ШАГ 1. ЕСТЬ ЛИ НА ФОТО СПИСОК ПОКУПОК ===
Сначала реши, есть ли на изображении написанный или напечатанный список покупок.
- Если списка НЕТ (продукты и готовая еда, селфи, человек, животное, пейзаж,
  техника, чек из магазина, пустой лист бумаги, документ не про покупки) — верни
  СТРОГО {"no_list": true, "items": []}.
- Список из одной позиции — это тоже список.
- Не пытайся составить список по продуктам, которые видишь на фото: нас
  интересует только то, что ЗАПИСАНО.

=== ШАГ 2. ЕСЛИ СПИСОК ЕСТЬ ===
Выпиши позиции списка покупок, по одной на строку, с количеством если указано.
- НИЧЕГО НЕ ВЫДУМЫВАЙ: только то, что реально написано на фото.
- Не дописывай продукты «по смыслу» и не разворачивай сокращения в то, чего нет.
- Нечитаемую строку просто пропусти.
- Количество и единицу оставляй рядом с продуктом: «молоко 2 л», «яйца 10 шт».
- Не нумеруй строки и не добавляй маркеры списка.
- Зачёркнутые позиции пропускай — они уже куплены.

=== ФОРМАТ ОТВЕТА ===
Только JSON, без пояснений и текста вне JSON:
{"no_list": false, "items": ["молоко 2 л", "яйца 10 шт", "хлеб"]}`;

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    let file: File | null = null;
    try {
      const form = await req.formData();
      const raw = form.get("image");
      if (raw instanceof File) file = raw;
    } catch {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "Фото не передано" }, { status: 400 });
    }
    // Тип НЕ проверяем на «image/*»: Android часто отдаёт фото с пустым mime
    // или application/octet-stream, и такие снимки надо принимать. Отсекаем
    // только заведомо не картинки; всё остальное проверит сам декодер.
    if (NON_IMAGE_TYPE.test(file.type || "")) {
      return NextResponse.json({ error: "Можно загружать только изображения" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Фото слишком большое. Максимум 15 МБ" }, { status: 413 });
    }

    // Лимит — после валидации (кривой/раздутый запрос отсекаем до расхода
    // бюджета), но строго до вызова OpenAI.
    const userId = await getVerifiedUserId(req);
    const rateLimit = await checkAndConsumeShoppingPhotoRateLimit(req, userId);
    if (!rateLimit.ok) return shoppingPhotoRateLimitResponse(rateLimit);

    // Любой формат → JPEG (+ поворот по EXIF, ресайз, срез метаданных). Если
    // это вообще не изображение — честный 400, а не падение в 500.
    let jpeg: Buffer;
    try {
      jpeg = await normalizeToJpeg(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      if (err instanceof UnsupportedImageError) {
        return NextResponse.json({ error: "Не удалось прочитать это фото" }, { status: 400 });
      }
      throw err;
    }
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    // Разбор и обрезка — в parseRecognizedList: он же прогоняет строки через
    // общий parseNames, поэтому дальше фото ничем не отличается от вставленного
    // текста, и он же возвращает noList вместо пустого списка позиций.
    const result = parseRecognizedList(completion.choices[0]?.message?.content);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[shopping/recognize] error:", error);
    return NextResponse.json({ error: "Не удалось распознать фото" }, { status: 500 });
  }
}
