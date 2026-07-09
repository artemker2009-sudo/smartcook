import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong } from "@/lib/inputLimits";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { ingredients, allergies, dislikes } = await req.json();

    if (!ingredients || ingredients.length === 0) {
      return NextResponse.json({ error: "Нет ингредиентов" }, { status: 400 });
    }

    if (
      isStringListTooLong(ingredients) ||
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