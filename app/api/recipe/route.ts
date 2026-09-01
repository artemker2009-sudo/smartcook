import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong, isTextTooLong } from "@/lib/inputLimits";
import { sanitizeProductList } from "@/lib/products";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { sanitizeRecipeForStorage } from "@/lib/recipeValidation";
import { createRequestScopedClient } from "@/lib/auth";

// Генерация рецепта — длинный ответ модели (шаги + ингредиенты). Запас на
// уровне остальных AI-роутов; без него платформа обрывает функцию по короткому
// дефолту, и клиент видит сетевую ошибку вместо результата.
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { dish, ingredients: rawIngredients, sessionId, allergies, dislikes } = await req.json();

    if (!dish) {
      return NextResponse.json({ error: "No dish provided" }, { status: 400 });
    }

    // Продукты приходят из редактируемого списка на клиенте — санитизируем на
    // сервере теми же правилами (правило 5 CLAUDE.md), клиенту не доверяем.
    const ingredients = sanitizeProductList(rawIngredients);

    if (
      isTextTooLong(dish) ||
      isStringListTooLong(allergies) ||
      isStringListTooLong(dislikes)
    ) {
      return NextResponse.json({ error: "Слишком длинный запрос" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "recipe");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    const productsList = ingredients && ingredients.length > 0 
      ? ingredients.join(", ") 
      : "продукты не указаны";

    let dietaryInstructions = "";
    if ((allergies && allergies.length > 0) || (dislikes && dislikes.length > 0)) {
      dietaryInstructions = `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${allergies && allergies.length > 0 ? `- АЛЛЕРГИЯ НА: ${allergies.join(", ")}. СТРОГО ИСКЛЮЧИТЬ ИЗ РЕЦЕПТА И ЗАМЕНИТЬ АЛЬТЕРНАТИВОЙ.` : ""}
      ${dislikes && dislikes.length > 0 ? `- НЕ ЛЮБИТ: ${dislikes.join(", ")}. НЕ ИСПОЛЬЗУЙ ИХ, найди альтернативу.` : ""}
      `;
    }

    const systemPrompt = `
      Ты — строгий шеф-повар и профессиональный технолог общепита. 
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".

      У пользователя есть: ${productsList}.
      
      ${dietaryInstructions}

      === ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА ===
      
      1. ПОРЦИЯ:
         - Расчет СТРОГО НА 1 (одну) ПЕРСОНУ. Пользователь сам умножит граммовки на сайте.

      2. ГРАММОВКИ (ТОЧНОСТЬ ДО ГРАММА):
         - Все основные ингредиенты должны иметь точный вес (г) или объем (мл).
         - ЗАПРЕЩЕНО писать "1 шт", "по вкусу" (кроме соли).
         - ПИШИ ТАК: "Морковь (1 шт, 120 г)", "Масло растительное (30 мл)".
      
      3. ВРЕМЯ И ТЕМПЕРАТУРА:
         - В шагах ВСЕГДА указывай точное время в минутах. 
         - НЕЛЬЗЯ писать: "Варите до готовности".
         - НУЖНО писать: "Варите ровно 20 минут", "Запекайте 25 минут при 180°C".
         - cooking_time_minutes: ОБЯЗАТЕЛЬНОЕ поле — целое число минут, общая оценка
           всего рецепта (подготовка + готовка). Только число, без текста.

      4. ОФОРМЛЕНИЕ ШАГОВ (ЧИСТОТА И ПОДРОБНОСТЬ):
         - ЗАПРЕЩЕНО писать слова "Шаг 1", "Step 1", "1.", "2." в начале строки.
         - Возвращай просто текст действия.
         - Пиши шаги приготовления максимально подробно и сочно. Объясняй, до какого цвета жарить, как правильно нарезать, добавляй секреты от шефа.

      5. ОБЯЗАТЕЛЬНОЕ vs ПО ЖЕЛАНИЮ:
         - Основные продукты — пиши строго.
         - Дополнительные (хлеб, подача) — помечай "(по желанию)".
      
      6. ПОКУПКИ:
         - В 'missing_ingredients' добавь ВСЁ, чего нет в списке, но нужно для рецепта.
         - Каждый продукт — ОТДЕЛЬНЫЙ элемент массива. НЕ склеивай в одну строку через запятую.

      7. БЮДЖЕТ (ОБЯЗАТЕЛЬНО):
         - estimated_cost: Оцени ПРИМЕРНУЮ стоимость ВСЕХ ингредиентов на 1 порцию по средним ценам продуктовых магазинов РФ (2026 год). Верни число в рублях (только число, без "руб").
         - delivery_cost: Оцени СРЕДНЮЮ стоимость 1 порции этого блюда в сервисах доставки еды в РФ (Яндекс Еда, Delivery Club, СберМаркет и т.п.) в 2026 году. Верни число в рублях (только число). Учитывай реальные цены для данного типа блюда.
         - Определи budget_tier: 1 = "Почти бесплатно" (до 200 руб), 2 = "Экономно" (200-450 руб), 3 = "Ресторан дома" (более 450 руб).

      Верни JSON:
      {
        "title": "Название",
        "description": "Описание",
        "time": "Время (мин)",
        "cooking_time_minutes": 35,
        "calories": "Ккал",
        "detailed_ingredients": [
          { "name": "Продукт", "amount": "Вес" }
        ],
        "missing_ingredients": ["Продукт 1", "Продукт 2", "Продукт 3"],
        "steps": ["Текст шага 1", "Текст шага 2"],
        "estimated_cost": 250,
        "delivery_cost": 650,
        "budget_tier": 2
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Составь полную техкарту для "${dish}".` },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response from OpenAI");

    const recipe = JSON.parse(content);

    if (sessionId) {
      const sanitized = sanitizeRecipeForStorage(recipe);
      if (sanitized) {
        const dbPayload = { session_id: sessionId, ...sanitized, is_favorite: false };

        const supabase = createRequestScopedClient(req);
        const { data: savedRow, error: dbError } = await supabase.from('recipes').insert(dbPayload).select('id').single();
        if (dbError) console.error("❌ ОШИБКА СОХРАНЕНИЯ В SUPABASE:", dbError);
        if (savedRow) recipe.id = savedRow.id;
      } else {
        console.error("❌ Рецепт без названия после санитизации — не сохраняем в историю");
      }
    }

    return NextResponse.json({ recipe });
  } catch (error: any) {
    console.error("Recipe generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}