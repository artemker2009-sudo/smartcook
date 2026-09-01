import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong } from "@/lib/inputLimits";
import { sanitizeProductList } from "@/lib/products";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

// Подбор других блюд по тем же продуктам — тот же запас, что у остальных
// AI-роутов (см. пояснение в app/api/analyze/route.ts).
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { ingredients: rawIngredients, allergies, dislikes } = await req.json();

    // Список продуктов теперь правит пользователь (удаляет/дописывает чипы), так
    // что клиенту не доверяем: чистим управляющие символы, режем длину и размер
    // списка ДО промпта (правило 5 CLAUDE.md — защита от раздувания расходов).
    const ingredients = sanitizeProductList(rawIngredients);

    if (ingredients.length === 0) {
      return NextResponse.json({ error: "Нет ингредиентов" }, { status: 400 });
    }

    if (
      isStringListTooLong(allergies) ||
      isStringListTooLong(dislikes)
    ) {
      return NextResponse.json({ error: "Слишком длинный список ингредиентов" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "regenerate");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    // ФИКС ДЫРЫ (этап 2): профиль вкуса раньше НЕ прокидывался в этот роут, и
    // «подобрать другой рецепт» мог предложить блюда с аллергенами/нелюбимым.
    // Тот же блок «ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ», что и в остальных роутах.
    let dietaryInstructions = "";
    if ((allergies && allergies.length > 0) || (dislikes && dislikes.length > 0)) {
      dietaryInstructions = `
            === ОГРАНИЧЕНИЯ И ПРЕДПОЧТЕНИЯ (КРИТИЧЕСКИ ВАЖНО) ===
            ${allergies && allergies.length > 0 ? `- АЛЛЕРГИЯ НА: ${allergies.join(", ")}. СТРОГО ИСКЛЮЧИ ЭТИ ПРОДУКТЫ ИЗ ПОДБОРКИ.` : ""}
            ${dislikes && dislikes.length > 0 ? `- НЕ ЛЮБИТ: ${dislikes.join(", ")}. НЕ ПРЕДЛАГАЙ блюда с этим, найди альтернативу.` : ""}
          `;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `
            У меня есть продукты: ${ingredients.join(", ")}.

            Пользователю не понравились предыдущие варианты.
            Предложи 3 НОВЫХ, КРЕАТИВНЫХ блюда, которые можно приготовить из этого.
            Старайся предлагать полноценные блюда, а не просто "нарезка".
            ${dietaryInstructions}
            Верни ответ строго в формате JSON:
            { "dishes": ["блюдо1", "блюдо2", "блюдо3"] }
          `
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (!content) return NextResponse.json({ error: "Пустой ответ" }, { status: 500 });

    const result = JSON.parse(content);
    return NextResponse.json({ ok: true, dishes: result.dishes });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}