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
       return NextResponse.json({ error: "Введите продукты или название блюда" }, { status: 400 });
    }

    // Лимиты длины запроса и списков — как в CLAUDE.md п.5 (защита расходов OpenAI).
    if (isTextTooLong(query) || isStringListTooLong(allergies) || isStringListTooLong(dislikes)) {
      return NextResponse.json({ error: "Слишком длинный запрос" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "search-recipe");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    let dietaryInstructions = "";
    if ((allergies && allergies.length > 0) || (dislikes && dislikes.length > 0)) {
      dietaryInstructions = `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${allergies && allergies.length > 0 ? `- АЛЛЕРГИЯ НА: ${allergies.join(", ")}. СТРОГО ИСКЛЮЧИТЬ ИЗ РЕЦЕПТА/ПОДБОРКИ И ЗАМЕНИТЬ.` : ""}
      ${dislikes && dislikes.length > 0 ? `- НЕ ЛЮБИТ: ${dislikes.join(", ")}. НЕ ИСПОЛЬЗУЙ ИХ, найди альтернативу.` : ""}
      `;
    }

    // Различение «список продуктов» vs «название блюда» делаем на стороне модели
    // (дёшево и надёжно), без хрупких клиентских эвристик по запятым.
    const systemPrompt = `
      Ты — строгий профессиональный шеф-повар и технолог.
      Пользователь ввёл в одно текстовое поле запрос: "${query}".

      === ЭТАП 1: ОПРЕДЕЛИ ТИП ЗАПРОСА ===
      Запрос может быть одним из трёх:
      A. СПИСОК ПРОДУКТОВ — перечисление ингредиентов, которые есть дома
         (примеры: "яйца, хлеб, яблоко", "курица картошка лук", "молоко и мука").
         Признак: это набор продуктов, а НЕ название готового блюда.
      B. НАЗВАНИЕ БЛЮДА — конкретное готовое блюдо
         (примеры: "борщ", "паста карбонара", "сырники", "плов").
      C. НЕВАЛИДНЫЙ ЗАПРОС:
         - бессмысленный набор букв (примеры: "ываыва", "ыыыы", "gjhkjkl");
         - несъедобные предметы (примеры: "жареные гвозди", "бетон");
         - оскорбления или спам;
         - пустой/непонятный ввод.

      ВАЖНО: различай A и B по смыслу, а не по запятым. "оливье" — это блюдо (B),
      хотя внутри много продуктов. "помидоры, огурцы" — это продукты (A).

      === ЭТАП 2: ОТВЕТЬ СООТВЕТСТВЕННО ТИПУ ===

      --- ЕСЛИ ТИП C (невалидный) ---
      Верни СТРОГО JSON:
      {
        "type": "invalid",
        "message": "<мягкая подсказка>"
      }
      Правила для message:
      - Если это похоже на попытку назвать несуществующее блюдо —
        "Не нашёл такого блюда. Проверьте название или перечислите продукты через запятую (например: яйца, хлеб, сыр)."
      - Если это просто бессмыслица/несъедобное/спам —
        "Не понял запрос. Введите продукты через запятую (например: яйца, хлеб, сыр) или название блюда (например: сырники)."
      НЕ пиши сухое "Такого блюда не существует" без подсказки, что делать дальше.

      --- ЕСЛИ ТИП A (список продуктов) ---
      Предложи 2-3 блюда, которые реально можно приготовить ПРЕИМУЩЕСТВЕННО из
      перечисленных продуктов (допустимо докупить 1-2 базовых ингредиента).
      ${dietaryInstructions}
      Верни СТРОГО JSON:
      {
        "type": "ingredients",
        "ingredients": ["нормализованный список продуктов из запроса"],
        "dishes": ["Блюдо 1", "Блюдо 2", "Блюдо 3"]
      }

      --- ЕСЛИ ТИП B (название блюда) ---
      Составь идеальную техкарту этого блюда, соблюдая правила:
      ${dietaryInstructions}

      1. ПОРЦИЯ: расчёт СТРОГО на 1 (одну) персону.
      2. ГРАММОВКИ: все ингредиенты СТРОГО с весом (г) или объёмом (мл). Не "по вкусу"
         (кроме соли/перца). Пример: "Лук репчатый (1 шт., 80 г)".
      3. ТАЙМИНГИ: в шагах ОБЯЗАТЕЛЬНО время в минутах; при запекании — температура.
      3.1 ВРЕМЯ ПРИГОТОВЛЕНИЯ (cooking_time_minutes): ОБЯЗАТЕЛЬНОЕ поле — целое
          число минут, общая оценка (подготовка + готовка). Только число, без текста.
      4. ШАГИ: не пиши "Шаг 1"/"1.", только чистый подробный текст действия.
      5. ОПЦИИ: ингредиенты для подачи помечай "(по желанию)".
      5.1 СПИСКИ ПРОДУКТОВ (missing_ingredients): каждый продукт — ОТДЕЛЬНЫЙ
          элемент массива. НЕ склеивай список в одну строку через запятую.
      6. БЮДЖЕТ:
         - estimated_cost: примерная стоимость всех ингредиентов на 1 порцию по средним
           ценам магазинов РФ (2026), число в рублях.
         - delivery_cost: средняя стоимость 1 порции в доставке еды РФ (2026), число в рублях.
         - budget_tier: 1 = до 200 руб, 2 = 200-450 руб, 3 = более 450 руб.
      Верни СТРОГО JSON:
      {
        "type": "dish",
        "recipe": {
          "title": "Правильное название блюда",
          "description": "Краткое описание",
          "time": "Общее время (например: 30 мин)",
          "cooking_time_minutes": 35,
          "calories": "Ккал на порцию",
          "detailed_ingredients": [ { "name": "Продукт", "amount": "Вес (г/мл)" } ],
          "missing_ingredients": ["Продукт 1", "Продукт 2", "Продукт 3"],
          "steps": ["Текст первого действия...", "Текст второго действия..."],
          "estimated_cost": 250,
          "delivery_cost": 650,
          "budget_tier": 2
        }
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.4,
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    const result = JSON.parse(content);

    // --- Невалидный запрос: мягкая подсказка (200, не техническая ошибка) ---
    if (result.type === "invalid" || result.error) {
      const message =
        (typeof result.message === "string" && result.message.trim()) ||
        (typeof result.error === "string" && result.error.trim()) ||
        "Не понял запрос. Введите продукты через запятую или название блюда.";
      return NextResponse.json({ type: "invalid", message });
    }

    // --- Список продуктов: возвращаем подборку блюд (рецепт генерится на след. шаге) ---
    if (result.type === "ingredients") {
      const ingredients = Array.isArray(result.ingredients) ? result.ingredients : [];
      const dishes = Array.isArray(result.dishes) ? result.dishes : [];
      if (dishes.length === 0) {
        return NextResponse.json({
          type: "invalid",
          message: "Не понял запрос. Введите продукты через запятую или название блюда.",
        });
      }
      return NextResponse.json({ type: "ingredients", data: { ingredients, dishes } });
    }

    // --- Название блюда: полная техкарта (как раньше) ---
    const recipe = result.recipe && typeof result.recipe === "object" ? result.recipe : result;

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

    return NextResponse.json({ type: "dish", recipe });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
