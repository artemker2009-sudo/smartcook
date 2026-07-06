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

    const { ingredients } = await req.json();

    if (!ingredients || ingredients.length === 0) {
      return NextResponse.json({ error: "Нет ингредиентов" }, { status: 400 });
    }

    if (isStringListTooLong(ingredients)) {
      return NextResponse.json({ error: "Слишком длинный список ингредиентов" }, { status: 400 });
    }

    const rateLimit = await checkAndConsumeAiRateLimit(req, "regenerate");
    if (!rateLimit.ok) return rateLimitResponse(rateLimit);

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