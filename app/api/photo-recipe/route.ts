import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong } from "@/lib/inputLimits";
import { sanitizeProductList } from "@/lib/products";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { sanitizeRecipeForStorage } from "@/lib/recipeValidation";
import { createRequestScopedClient } from "@/lib/auth";
import { STREAM_META_SEPARATOR } from "@/lib/photoStream";

/**
 * ОДИН вызов OpenAI на весь фото-путь: продукты + три блюда + полная техкарта
 * первого блюда. Раньше то же самое стоило ДВА запроса (/api/analyze, потом
 * /api/recipe по тапу на блюдо) и две единицы лимита — здесь одна. Лимит не
 * ослаблен: та же checkAndConsumeAiRateLimit, просто списывается один раз.
 *
 * Два режима на один роут (оба — один вызов и одна единица лимита):
 *  - multipart/form-data с полем image → распознавание по фото;
 *  - application/json с ingredients   → пересчёт по уже известному списку
 *    продуктов (правка чипов, переключение на «могу докупить»). Фото второй
 *    раз в модель не уходит — это дешевле и быстрее.
 *
 * Ответ СТРИМИТСЯ: клиенту нужно показывать живые этапы («Смотрю, что есть…» →
 * «Подбираю три ужина…» → «Пишу рецепт…»), а ждать 30–40 секунд перед пустым
 * экраном люди не готовы. Формат тела:
 *
 *     <текст JSON-ответа модели, как он генерируется>\0<служебный JSON>
 *
 * Разделитель — байт \0: в валидном JSON он не встречается (управляющие
 * символы там всегда экранированы), поэтому граница однозначна. Служебный
 * JSON несёт id сохранённого рецепта и ошибку, если она случилась уже ПОСЛЕ
 * начала стрима (заголовки к тому моменту отправлены, статус не поменять).
 *
 * Порядок ключей в промпте («no_food» → «ingredients» → «dishes» → «recipe»)
 * не косметика: по появлению ключа в стриме клиент переключает этап. Меняя
 * схему, поменяй и маркеры в SearchApp.
 */

// Клиентский потолок ожидания — PHOTO_ONESHOT_TIMEOUT_MS (55с). Серверный
// ОБЯЗАН быть больше: иначе платформа рвёт соединение раньше нашего
// AbortController, и вместо честного "photo-oneshot-timeout" в телеметрию
// уходит невнятная сетевая ошибка.
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_FIELD_LENGTH = 500;

type Mode = "strict" | "extended";

function modeInstructions(mode: Mode): string {
  if (mode === "strict") {
    return `
      РЕЖИМ: "ЭКОНОМИЯ / ЧИСТКА ХОЛОДИЛЬНИКА".
      1. Исходи из того, что у пользователя дома есть ТОЛЬКО: Вода, Соль, Перец, Сахар, Растительное масло.
      2. Ингредиенты на фото — это ВСЁ, что есть.
      3. НЕ предлагай блюда, требующие докупить что-то существенное (мясо, сливки, яйца), если их нет на фото.
      4. Если на фото только макароны -> Предлагай "Жареная вермишель", "Макароны с маслом".
    `;
  }
  return `
    РЕЖИМ: "ВКУСНО / ГОТОВ СХОДИТЬ В МАГАЗИН".
    1. Ты можешь предложить блюда, для которых нужно ДОКУПИТЬ 1-2 ингредиента, чтобы было вкуснее.
    2. Например: если видишь макароны, предложи "Паста Карбонара" (надо докупить бекон/сливки) или "Макароны по-флотски" (докупить фарш).
    3. Но основа блюда (80%) всё равно должна быть из того, что на фото.
  `;
}

function dietaryInstructions(allergies: string, dislikes: string): string {
  if (!allergies && !dislikes) return "";
  return `
    === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
    ${allergies ? `- У пользователя АЛЛЕРГИЯ НА: ${allergies}. СТРОГО ИСКЛЮЧИТЬ ЛЮБЫЕ БЛЮДА И ИНГРЕДИЕНТЫ С ЭТИМ.` : ""}
    ${dislikes ? `- Пользователь НЕ ЛЮБИТ: ${dislikes}. Предлагай блюда без них.` : ""}
  `;
}

// Кусок промпта про техкарту — дословно те же «железные правила технолога»,
// что и в /api/recipe: рецепт из одного вызова не должен отличаться по
// качеству от рецепта, полученного по тапу на другое блюдо.
const RECIPE_RULES = `
  === ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА (для поля "recipe") ===

  1. ПОРЦИЯ: расчёт СТРОГО НА 1 (одну) персону.

  2. ГРАММОВКИ (ТОЧНОСТЬ ДО ГРАММА):
     - Все основные ингредиенты — точный вес (г) или объём (мл).
     - ЗАПРЕЩЕНО писать "1 шт", "по вкусу" (кроме соли).
     - ПИШИ ТАК: "Морковь (1 шт, 120 г)", "Масло растительное (30 мл)".

  3. ВРЕМЯ И ТЕМПЕРАТУРА:
     - В шагах ВСЕГДА точное время в минутах. НЕЛЬЗЯ "до готовности".
     - НУЖНО: "Варите ровно 20 минут", "Запекайте 25 минут при 180°C".
     - cooking_time_minutes: ОБЯЗАТЕЛЬНОЕ поле, целое число минут на весь рецепт.

  4. ОФОРМЛЕНИЕ ШАГОВ:
     - ЗАПРЕЩЕНО писать "Шаг 1", "Step 1", "1.", "2." в начале строки.
     - Пиши подробно и сочно: до какого цвета жарить, как нарезать, секреты шефа.

  5. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ: основные продукты — строго; хлеб, подача — "(по желанию)".

  6. ПОКУПКИ: в 'missing_ingredients' — ВСЁ, чего нет в списке продуктов, но нужно для рецепта.
     Каждый продукт — ОТДЕЛЬНЫЙ элемент массива, НЕ склеивай через запятую.

  7. БЮДЖЕТ (ОБЯЗАТЕЛЬНО):
     - estimated_cost: примерная стоимость ВСЕХ ингредиентов на 1 порцию по средним ценам магазинов РФ (2026), число в рублях.
     - delivery_cost: средняя цена 1 порции этого блюда в сервисах доставки еды в РФ (2026), число в рублях.
     - budget_tier: 1 = до 200 руб, 2 = 200-450 руб, 3 = более 450 руб.
`;

// Схема ответа. Порядок ключей = порядок этапов у клиента, не переставлять.
const RESPONSE_SCHEMA = `
  === ФОРМАТ ОТВЕТА ===
  Верни ТОЛЬКО JSON (без пояснений и текста вне JSON), ключи строго в этом порядке:
  {
    "no_food": false,
    "ingredients": ["список продуктов"],
    "uncertain": ["продукты, в которых не уверен — подмножество ingredients"],
    "dishes": ["Блюдо 1", "Блюдо 2", "Блюдо 3"],
    "recipe": {
      "title": "Название (ровно первое блюдо из dishes)",
      "description": "Описание",
      "time": "Время (мин)",
      "cooking_time_minutes": 35,
      "calories": "Ккал",
      "detailed_ingredients": [{ "name": "Продукт", "amount": "Вес" }],
      "missing_ingredients": ["Продукт 1", "Продукт 2"],
      "steps": ["Текст шага 1", "Текст шага 2"],
      "estimated_cost": 250,
      "delivery_cost": 650,
      "budget_tier": 2
    }
  }
  "recipe" — ВСЕГДА полная техкарта ПЕРВОГО блюда из "dishes".
`;

function buildPhotoPrompt(mode: Mode, allergies: string, dislikes: string): string {
  return `
    Ты — профессиональный шеф-повар и внимательный ассистент по распознаванию
    продуктов на фото. Сделай три вещи за один ответ: перечисли продукты с фото,
    предложи 3 блюда и сразу напиши полную техкарту первого из них.

    === ШАГ 1. ЕСТЬ ЛИ ЕДА НА ФОТО (ВАЖНО) ===
    Сначала реши, есть ли на изображении продукты питания.
    - Если продуктов НЕТ (человек, селфи, животное, пейзаж, техника, мебель,
      документ, пустой стол) — верни СТРОГО
      {"no_food": true, "ingredients": [], "uncertain": [], "dishes": [], "recipe": null}.
    - Упаковки продуктов, готовые блюда и напитки СЧИТАЮТСЯ едой (no_food: false).

    === ШАГ 2. РАСПОЗНАВАНИЕ ПРОДУКТОВ ===
    Типичные сцены: открытый холодильник (осмотри полки, дверцу и нижние ящики),
    стол с продуктами, полка с припасами. Пройди взглядом по всей картинке.
    - Перечисли ВСЕ различимые продукты, включая частично видимые и в упаковке —
      определяй по этикеткам, форме и цвету.
    - НИЧЕГО НЕ ВЫДУМЫВАЙ: только то, что реально видно на этом фото.
    - Сомневаешься — добавь в "ingredients" и продублируй в "uncertain".
    - Нормализуй названия: по-русски, именительный падеж, единственное число,
      без брендов и веса («Простоквашино молоко 3.2% 900 г» → «молоко»).
    - Не дублируй один продукт разными словами.

    === ШАГ 3. БЛЮДА И ТЕХКАРТА ===
    ${modeInstructions(mode)}
    ${dietaryInstructions(allergies, dislikes)}
    ${RECIPE_RULES}
    ${RESPONSE_SCHEMA}
  `;
}

function buildRecalcPrompt(
  products: string[],
  mode: Mode,
  allergies: string,
  dislikes: string,
): string {
  return `
    Ты — профессиональный шеф-повар. У пользователя дома есть РОВНО эти продукты:
    ${products.join(", ")}.

    Предложи 3 блюда из них и сразу напиши полную техкарту первого блюда.

    В поле "ingredients" верни ТОТ ЖЕ список продуктов пользователя без изменений,
    "uncertain" — пустой массив, "no_food" — false.

    ${modeInstructions(mode)}
    ${dietaryInstructions(allergies, dislikes)}
    ${RECIPE_RULES}
    ${RESPONSE_SCHEMA}
  `;
}

type ParsedRequest =
  | { ok: true; content: OpenAI.Chat.Completions.ChatCompletionContentPart[]; sessionId: string | null }
  | { ok: false; response: NextResponse };

// Разбор обоих режимов запроса в единый вход для модели.
async function parseRequest(req: Request): Promise<ParsedRequest> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const products = sanitizeProductList(body?.ingredients);
    if (products.length === 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Не указаны продукты" }, { status: 400 }),
      };
    }
    if (isStringListTooLong(body?.allergies) || isStringListTooLong(body?.dislikes)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Слишком длинный запрос" }, { status: 400 }),
      };
    }
    const mode: Mode = body?.mode === "extended" ? "extended" : "strict";
    const allergies = (Array.isArray(body?.allergies) ? body.allergies.join(", ") : "").slice(
      0,
      MAX_TEXT_FIELD_LENGTH,
    );
    const dislikes = (Array.isArray(body?.dislikes) ? body.dislikes.join(", ") : "").slice(
      0,
      MAX_TEXT_FIELD_LENGTH,
    );
    return {
      ok: true,
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : null,
      content: [{ type: "text", text: buildRecalcPrompt(products, mode, allergies, dislikes) }],
    };
  }

  const formData = await req.formData();
  const file = formData.get("image") as File | null;
  if (!file) {
    return { ok: false, response: NextResponse.json({ error: "No file uploaded" }, { status: 400 }) };
  }
  if (!file.type.startsWith("image/")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Можно загружать только изображения" }, { status: 400 }),
    };
  }
  if (file.size > PHOTO_MAX_BYTES) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Файл слишком большой. Максимум 10 МБ" }, { status: 413 }),
    };
  }

  const mode: Mode = (formData.get("mode") as string) === "extended" ? "extended" : "strict";
  const allergies = ((formData.get("allergies") as string) || "").slice(0, MAX_TEXT_FIELD_LENGTH);
  const dislikes = ((formData.get("dislikes") as string) || "").slice(0, MAX_TEXT_FIELD_LENGTH);
  const sessionIdRaw = formData.get("sessionId");
  const base64Image = Buffer.from(await file.arrayBuffer()).toString("base64");

  return {
    ok: true,
    sessionId: typeof sessionIdRaw === "string" ? sessionIdRaw : null,
    content: [
      { type: "text", text: buildPhotoPrompt(mode, allergies, dislikes) },
      { type: "image_url", image_url: { url: `data:${file.type};base64,${base64Image}` } },
    ],
  };
}

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const parsed = await parseRequest(req);
    if (!parsed.ok) return parsed.response;

    // Одна единица лимита на весь путь «фото → рецепт». Списываем ДО вызова
    // модели, как и на остальных AI-роутах.
    const rateLimit = await checkAndConsumeAiRateLimit(req, "photo-recipe");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: parsed.content }],
      response_format: { type: "json_object" },
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let raw = "";
        const meta: { recipeId: number | null; error: string | null } = {
          recipeId: null,
          error: null,
        };
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (!delta) continue;
            raw += delta;
            controller.enqueue(encoder.encode(delta));
          }

          // Сохранение рецепта в историю — теми же правилами, что и /api/recipe:
          // санитизация перед записью, клиент пишет под своей сессией.
          const parsedJson = JSON.parse(raw);
          if (parsed.sessionId && parsedJson?.recipe) {
            const sanitized = sanitizeRecipeForStorage(parsedJson.recipe);
            if (sanitized) {
              const supabase = createRequestScopedClient(req);
              const { data: savedRow, error: dbError } = await supabase
                .from("recipes")
                .insert({ session_id: parsed.sessionId, ...sanitized, is_favorite: false })
                .select("id")
                .single();
              if (dbError) console.error("❌ ОШИБКА СОХРАНЕНИЯ В SUPABASE:", dbError.message);
              if (savedRow) meta.recipeId = savedRow.id;
            }
          }
        } catch (err) {
          // Заголовки уже ушли — статус не поменять. Ошибку отдаём в метаданных,
          // клиент покажет её так же, как обычный сбой запроса.
          const reason = err instanceof Error ? err.message : String(err);
          console.error("Photo-recipe stream error:", reason);
          meta.error = reason || "Не удалось получить рецепт";
        } finally {
          controller.enqueue(encoder.encode(STREAM_META_SEPARATOR + JSON.stringify(meta)));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        // Промежуточные прокси не должны копить ответ: без этого этапы
        // приезжают одним куском в самом конце, и весь смысл стрима теряется.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("Photo-recipe error:", reason);
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
