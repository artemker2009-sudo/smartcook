import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import {
  checkAndConsumeShoppingPhotoRateLimit,
  shoppingPhotoRateLimitResponse,
} from "@/lib/rateLimit";
import { parseRecognizedList } from "@/lib/shoppingPhoto";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Распознавание списка покупок по фото (лист бумаги, блокнот, записка на
// холодильнике). Фото приходит на НАШ роут и уходит в OpenAI только отсюда —
// ключ живёт в env на сервере и в браузер не попадает (правило 4 CLAUDE.md).
//
// Роут НИЧЕГО не хранит: ни фото, ни распознанный текст в БД не пишутся.
//
// Защита расходов (правило 5 CLAUDE.md):
//  - потолок размера файла (клиент шлёт ~1 МБ после сжатия preparePhoto,
//    остальное — защита от абьюза),
//  - rate-limit по IP и пользователю со СВОИМ бюджетом (vision дороже текста),
//  - не больше MAX_SHOPPING_ITEMS позиций из ответа (режется в parseRecognizedList).
const MAX_BYTES = 8 * 1024 * 1024;

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
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Можно загружать только изображения" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Фото слишком большое. Максимум 8 МБ" }, { status: 413 });
    }

    // Лимит — после валидации (кривой/раздутый запрос отсекаем до расхода
    // бюджета), но строго до вызова OpenAI.
    const userId = await getVerifiedUserId(req);
    const rateLimit = await checkAndConsumeShoppingPhotoRateLimit(req, userId);
    if (!rateLimit.ok) return shoppingPhotoRateLimitResponse(rateLimit);

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

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
