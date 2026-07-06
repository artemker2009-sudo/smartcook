import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong, isTextTooLong } from "@/lib/inputLimits";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { sanitizeRecipeForStorage } from "@/lib/recipeValidation";
import { createRequestScopedClient } from "@/lib/auth";

const openai = new OpenAI({
  apiKey: (process.env.OPENAI_API_KEY || "").trim()
});

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { query, sessionId, allergies, dislikes } = await req.json();

    if (!query || query.trim().length < 2) {
       return NextResponse.json({ error: "Введите название блюда" }, { status: 400 });
    }

    if (isTextTooLong(query) || isStringListTooLong(allergies) || isStringListTooLong(dislikes)) {
      return NextResponse.json({ error: "Слишком длинный запрос" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "search-recipe");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    let dietaryInstructions = "";
    if ((allergies && allergies.length > 0) || (dislikes && dislikes.length > 0)) {
      dietaryInstructions = `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${allergies && allergies.length > 0 ? `- АЛЛЕРГИЯ НА: ${allergies.join(", ")}. СТРОГО ИСКЛЮЧИТЬ ИЗ РЕЦЕПТА И ЗАМЕНИТЬ.` : ""}
      ${dislikes && dislikes.length > 0 ? `- НЕ ЛЮБИТ: ${dislikes.join(", ")}. НЕ ИСПОЛЬЗУЙ ИХ, найди альтернативу.` : ""}
      `;
    }

    const systemPrompt = `
      Ты — строгий профессиональный шеф-повар и технолог.
      Пользователь просит рецепт: "${query}".

      === ЭТАП 1: ПРОВЕРКА НА АДЕКВАТНОСТЬ (ФИЛЬТР) ===
      Проанализируй запрос.
      ЕСЛИ ЭТО:
      - Бессмысленный набор букв (пример: "ываыва", "gjhkjkl").
      - Несуществующее слово или выдуманное название.
      - Несъедобный предмет (пример: "жареные гвозди", "бетон").
      - Оскорбление или спам.
      
      ТОГДА ВЕРНИ СТРОГО JSON С ОШИБКОЙ:
      {
        "error": "Такого блюда не существует. Проверьте название."
      }

      === ЭТАП 2: ЕСЛИ ЭТО РЕАЛЬНАЯ ЕДА — ПИШИ ТЕХКАРТУ ===
      Составь идеальный рецепт, соблюдая правила:
      
      ${dietaryInstructions}

      1. ПОРЦИЯ:
         - Расчет СТРОГО НА 1 (одну) ПЕРСОНУ. Пользователь сам умножит граммовки на сайте.
      
      2. ГРАММОВКИ: 
         - Все ингредиенты указывай СТРОГО с весом (г) или объемом (мл).
         - Не пиши "по вкусу" (кроме соли/перца) или "на глаз".
         - Пример: "Лук репчатый (1 шт., 80 г)".
      
      3. ТАЙМИНГИ И ТЕМПЕРАТУРА: 
         - В шагах ОБЯЗАТЕЛЬНО указывай время готовки в минутах.
         - Если запекание — указывай температуру (градусы).
      
      4. ОФОРМЛЕНИЕ ШАГОВ (ЧИСТОТА И ПОДРОБНОСТЬ): 
         - НЕ пиши "Шаг 1", "1.". Пиши только чистый текст действия.
         - Пиши шаги приготовления максимально подробно и сочно.
      
      5. ОПЦИИ: 
         - Ингредиенты для подачи (сметана, хлеб, зелень) помечай: "(по желанию)".

      6. БЮДЖЕТ (ОБЯЗАТЕЛЬНО):
         - estimated_cost: Оцени ПРИМЕРНУЮ стоимость ВСЕХ ингредиентов на 1 порцию по средним ценам продуктовых магазинов РФ (2026 год). Верни число в рублях (только число, без "руб").
         - delivery_cost: Оцени СРЕДНЮЮ стоимость 1 порции этого блюда в сервисах доставки еды в РФ (Яндекс Еда, Delivery Club, СберМаркет и т.п.) в 2026 году. Верни число в рублях (только число). Учитывай реальные цены для данного типа блюда.
         - Определи budget_tier: 1 = "Почти бесплатно" (до 200 руб), 2 = "Экономно" (200-450 руб), 3 = "Ресторан дома" (более 450 руб).

      Верни JSON (если блюдо реальное):
      {
        "title": "Правильное название блюда",
        "description": "Краткое описание",
        "time": "Общее время (например: 30 мин)",
        "calories": "Ккал на порцию",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес (г/мл)" }
        ],
        "missing_ingredients": ["Полный список покупок"],
        "steps": ["Текст первого действия...", "Текст второго действия..."],
        "estimated_cost": 250,
        "delivery_cost": 650,
        "budget_tier": 2
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const result = JSON.parse(content);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const recipe = result;

    if (sessionId) {
      const sanitized = sanitizeRecipeForStorage(recipe);
      if (sanitized) {
        const supabase = createRequestScopedClient(req);
        const { data: savedRow, error } = await supabase.from('recipes').insert({
          session_id: sessionId,
          ...sanitized,
          is_favorite: false,
        }).select('id').single();
        if (error) console.error("History save error:", error);
        if (savedRow) recipe.id = savedRow.id;
      } else {
        console.error("Рецепт без названия после санитизации — не сохраняем в историю");
      }
    }

    return NextResponse.json({ recipe });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}