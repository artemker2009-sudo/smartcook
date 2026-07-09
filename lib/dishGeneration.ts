import "server-only";
import OpenAI from "openai";

// Генерация техкарты для КОНКРЕТНОГО блюда (тип B). Вынесено в общий модуль,
// чтобы переиспользовать в:
//   • /api/search-recipe — «подобрать другой рецепт» (вариант 2, 3, ...);
//   • /api/admin/warmup — прогрев кэша (вариант 1).
// Первый показ (детекция A/B/C) остаётся в /api/search-recipe с прежним промтом —
// здесь мы уже ЗНАЕМ, что это блюдо, и просто пишем техкарту.
//
// Промт совпадает по правилам с /api/recipe (граммовки, тайминги, бюджет),
// чтобы рецепты из кэша не отличались по качеству от обычной генерации.

const openai = new OpenAI({ apiKey: (process.env.OPENAI_API_KEY || "").trim() });

export interface DishGenerationOptions {
  allergies?: string[];
  dislikes?: string[];
  // Для «подобрать другой рецепт»: >1 → просим АЛЬТЕРНАТИВНЫЙ вариант.
  variantIndex?: number;
}

function dietaryBlock(allergies?: string[], dislikes?: string[]): string {
  const hasA = Array.isArray(allergies) && allergies.length > 0;
  const hasD = Array.isArray(dislikes) && dislikes.length > 0;
  if (!hasA && !hasD) return "";
  return `
      === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
      ${hasA ? `- АЛЛЕРГИЯ НА: ${allergies!.join(", ")}. СТРОГО ИСКЛЮЧИТЬ ИЗ РЕЦЕПТА И ЗАМЕНИТЬ АЛЬТЕРНАТИВОЙ.` : ""}
      ${hasD ? `- НЕ ЛЮБИТ: ${dislikes!.join(", ")}. НЕ ИСПОЛЬЗУЙ ИХ, найди альтернативу.` : ""}
      `;
}

// Возвращает СЫРОЙ объект рецепта (как из /api/recipe): { title, description,
// time, cooking_time_minutes, calories, detailed_ingredients, missing_ingredients,
// steps, estimated_cost, delivery_cost, budget_tier }. Санитизацию/раскладку
// делает вызывающий (sanitizeRecipeForStorage / запись в кэш).
export async function generateDishRecipe(
  dish: string,
  opts: DishGenerationOptions = {},
): Promise<any> {
  const variantIndex = opts.variantIndex && opts.variantIndex > 1 ? opts.variantIndex : 1;

  const variantBlock =
    variantIndex > 1
      ? `
      === АЛЬТЕРНАТИВНЫЙ ВАРИАНТ ===
      Это ${variantIndex}-й вариант приготовления блюда "${dish}". Предложи ДРУГОЙ
      способ/набор ингредиентов, заметно отличающийся от классического (иная
      техника, начинка, соус, регион кухни и т.п.), но это должно оставаться тем
      же блюдом "${dish}". Не повторяй банальный базовый рецепт.
      `
      : "";

  const systemPrompt = `
      Ты — строгий шеф-повар и профессиональный технолог общепита.
      Твоя задача — написать ИДЕАЛЬНУЮ ТЕХНОЛОГИЧЕСКУЮ КАРТУ для блюда "${dish}".
      ${variantBlock}
      ${dietaryBlock(opts.allergies, opts.dislikes)}

      === ЖЕЛЕЗНЫЕ ПРАВИЛА ТЕХНОЛОГА ===

      1. ПОРЦИЯ: расчёт СТРОГО на 1 (одну) персону.
      2. ГРАММОВКИ: все основные ингредиенты с точным весом (г) или объёмом (мл).
         ЗАПРЕЩЕНО "по вкусу" (кроме соли/перца). Пример: "Морковь (1 шт, 120 г)".
      3. ВРЕМЯ И ТЕМПЕРАТУРА: в шагах ВСЕГДА точное время в минутах; при запекании —
         температура. cooking_time_minutes — ОБЯЗАТЕЛЬНОЕ поле, целое число минут
         (подготовка + готовка), только число.
      4. ШАГИ: без "Шаг 1"/"1.", только чистый подробный текст действия.
      5. ПОКУПКИ (missing_ingredients): каждый продукт — ОТДЕЛЬНЫЙ элемент массива,
         не склеивай в одну строку через запятую.
      6. БЮДЖЕТ:
         - estimated_cost: примерная стоимость ингредиентов на 1 порцию по средним
           ценам магазинов РФ (2026), число в рублях.
         - delivery_cost: средняя стоимость 1 порции в доставке РФ (2026), число.
         - budget_tier: 1 = до 200 руб, 2 = 200-450 руб, 3 = более 450 руб.

      Верни СТРОГО JSON:
      {
        "title": "Название",
        "description": "Описание",
        "time": "Время (мин)",
        "cooking_time_minutes": 35,
        "calories": "Ккал",
        "detailed_ingredients": [ { "name": "Продукт", "amount": "Вес" } ],
        "missing_ingredients": ["Продукт 1", "Продукт 2"],
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
    // Для вариантов повышаем температуру — чтобы «другой рецепт» реально отличался.
    temperature: variantIndex > 1 ? 0.8 : 0.4,
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error("Empty response from OpenAI");
  return JSON.parse(content);
}
