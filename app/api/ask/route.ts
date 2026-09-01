import { NextResponse } from "next/server";
import OpenAI from "openai";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isStringListTooLong, isTextTooLong } from "@/lib/inputLimits";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";

// «Спросить шефа» — тот же запас, что у остальных AI-роутов
// (см. пояснение в app/api/analyze/route.ts).
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    const { question, recipeContext } = await req.json();

    if (!question || !recipeContext) {
      return NextResponse.json({ error: "Нет вопроса или контекста" }, { status: 400 });
    }

    if (
      isTextTooLong(question) ||
      isTextTooLong(recipeContext.title) ||
      isStringListTooLong(recipeContext.ingredients, 50, 200) ||
      isStringListTooLong(recipeContext.steps, 30, 1000)
    ) {
      return NextResponse.json({ error: "Слишком длинный вопрос или контекст рецепта" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "ask");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
            Ты — опытный Су-шеф. Пользователь готовит конкретное блюдо.
            
            КОНТЕКСТ РЕЦЕПТА:
            Название: ${recipeContext.title}
            Ингредиенты: ${recipeContext.ingredients ? recipeContext.ingredients.join(", ") : "не указаны"}
            Шаги: ${recipeContext.steps.join("; ")}

            ТВОЯ ЗАДАЧА:
            Ответь на вопрос пользователя.
            
            ВАЖНЫЕ ПРАВИЛА:
            1. Ты ОБЯЗАН отвечать на вопросы о:
               - Самом рецепте и шагах приготовления.
               - Ингредиентах и их заменах.
               - Сервировке и подаче блюда.
               - НАПИТКАХ (с чем это есть, чем запить, какое вино, сок или чай подходит).
            2. Если вопрос совсем не относится к еде (например, "кто президент?", "курс доллара"), вежливо ответь, что говоришь только о вкусном.
            3. Будь краток, полезен и дружелюбен.
          `
        },
        {
          role: "user",
          content: question
        }
      ],
    });

    const answer = response.choices[0].message.content;
    return NextResponse.json({ answer });

  } catch (error: any) {
    console.error("Ошибка чата:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}