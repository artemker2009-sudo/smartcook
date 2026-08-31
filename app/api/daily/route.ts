import { NextResponse } from "next/server";
import OpenAI from "openai";
import { unstable_cache } from "next/cache";

import { isTrustedOriginForRead, originBlockedResponse } from "@/lib/originGuard";
import { checkAndConsumeReadRateLimit, readRateLimitResponse } from "@/lib/rateLimit";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Заставляем маршрут быть динамическим, чтобы проверять дату
export const dynamic = 'force-dynamic';

const getDailyRecipe = unstable_cache(
  async (dateStr: string) => {
    console.log(`Generating Seasonal & Strict Daily Recipe for ${dateStr}...`); 

    const systemPrompt = `
      Ты — элитный шеф-повар и педантичный технолог ресторана.
      Твоя задача — создать "Блюдо дня" на сегодня: ${dateStr}.

      === ЭТАП 1: ТВОРЧЕСТВО (СЕЗОН И ПРАЗДНИКИ) ===
      1. Проанализируй дату (${dateStr}).
      2. ЕСТЬ ЛИ ПРАЗДНИК? 
         - Если сегодня (или скоро) праздник (14 февраля, 23 февраля, 8 марта, Масленица, Пасха, Новый год) — предложи ТЕМАТИЧЕСКОЕ блюдо.
         - Например: 14 февраля — что-то изысканное/романтичное; Масленица — блины.
      3. ЕСЛИ ПРАЗДНИКА НЕТ:
         - Предложи СЕЗОННОЕ блюдо.
         - Лето: легкое, свежее, ягодное.
         - Зима: сытное, горячее, согревающее.
         - Осень: тыква, грибы, корнеплоды.

      === ЭТАП 2: ТЕХНОЛОГИЯ (СТРОГОСТЬ) ===
      Когда блюдо выбрано, напиши техкарту по жестким правилам:
      
      1. ПОРЦИЯ:
         - Строго на 1 (одну) персону. Пользователь сам умножит граммовки на сайте.
      
      2. ГРАММОВКИ (ТОЧНОСТЬ):
         - Ингредиенты ТОЛЬКО в граммах (г) или мл. 
         - Никаких "по вкусу" (кроме соли) или "на глаз".
         - Пример: "Рис (80 г)", "Вода (150 мл)".

      3. ОПЦИОНАЛЬНЫЕ ПРОДУКТЫ:
         - Разделяй базу и декор.
         - То, что нужно для украшения или подачи (хлеб, сметана, веточка мяты), помечай в названии: "(по желанию)" или "(для подачи)".
      
      4. ШАГИ (ЧИСТОТА И ПОДРОБНОСТЬ):
         - НЕ пиши нумерацию ("Шаг 1", "1."). Пиши только текст действия.
         - ОБЯЗАТЕЛЬНО указывай время (мин) и температуру в каждом шаге готовки.
         - cooking_time_minutes: ОБЯЗАТЕЛЬНОЕ отдельное поле — целое число минут,
           общая оценка всего рецепта (подготовка + готовка). Только число.
         - Пиши шаги приготовления максимально подробно и сочно. Объясняй, до какого цвета жарить, как правильно нарезать, добавляй секреты от шефа, чтобы даже новичок приготовил ресторанное блюдо.

      5. ПОКУПКИ:
         - В missing_ingredients добавь ПОЛНЫЙ список всего, что нужно (считаем, что кухня пустая).
         - Каждый продукт (в ingredients и missing_ingredients) — ОТДЕЛЬНЫЙ элемент массива. НЕ склеивай в одну строку через запятую.

      6. БЮДЖЕТ (ОБЯЗАТЕЛЬНО):
         - estimated_cost: Оцени ПРИМЕРНУЮ стоимость ВСЕХ ингредиентов на 1 порцию по средним ценам продуктовых магазинов РФ (2026 год). Верни число в рублях (только число, без "руб").
         - delivery_cost: Оцени СРЕДНЮЮ стоимость 1 порции этого блюда в сервисах доставки еды в РФ (Яндекс Еда, Delivery Club, СберМаркет и т.п.) в 2026 году. Верни число в рублях (только число). Учитывай реальные цены для данного типа блюда.
         - Определи budget_tier: 1 = "Почти бесплатно" (до 200 руб), 2 = "Экономно" (200-450 руб), 3 = "Ресторан дома" (более 450 руб).

      Верни JSON:
      {
        "title": "Название (Например: Романтическое ризотто)",
        "description": "Почему это блюдо идеально именно сегодня (праздник/сезон)...",
        "time": "Время (мин)",
        "cooking_time_minutes": 35,
        "calories": "Ккал",
        "ingredients": ["Продукт 1", "Продукт 2"],
        "missing_ingredients": ["Продукт 1", "Продукт 2", "Продукт 3"],
        "detailed_ingredients": [
           { "name": "Продукт", "amount": "Вес" }
        ],
        "steps": ["Текст шага 1...", "Текст шага 2..."],
        "estimated_cost": 350,
        "delivery_cost": 750,
        "budget_tier": 2
      }
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Придумай рецепт дня на ${dateStr} с учетом праздников.` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7, // Чуть выше креативность для праздников
    });

    const content = completion.choices[0].message.content;
    if (!content) throw new Error("Empty response");

    return JSON.parse(content);
  },
  ['daily-seasonal-v2'], // Изменен ключ кэша, чтобы сгенерировать новый подробный рецепт прямо сегодня
  { 
    revalidate: 3600 * 24 
  }
);

// Единственный OpenAI-роут, который до аудита стоял без лимита и без гарда.
// Расход прикрыт суточным unstable_cache (ключ включает дату, модель зовётся
// ~раз в сутки), поэтому задача защиты тут не «сэкономить токены», а не быть
// открытым бесплатным прокси и не отдавать наружу внутренние ошибки.
//
// Гард — READ-версия (см. lib/originGuard.isTrustedOriginForRead): строгая
// POST-версия отсекает запросы без Origin/Referer, а именно так выглядит
// нормальный same-origin GET из браузера — рецепт дня пропал бы с Главной.
// Лимит — общий read-лимитер по IP (120/час, 1500/сутки): обычной загрузке
// Главной этого хватает с большим запасом, скрейпинг отсекается.
export async function GET(req: Request) {
  if (!isTrustedOriginForRead(req)) return originBlockedResponse();

  const rate = await checkAndConsumeReadRateLimit(req, "daily");
  if (!rate.ok) return readRateLimitResponse(rate);

  try {
    const date = new Date().toLocaleDateString("ru-RU", {
      timeZone: "Europe/Moscow",
    });

    const recipeData = await getDailyRecipe(date);

    return NextResponse.json({ ...recipeData, date });
  } catch (error: unknown) {
    // Наружу — только общий текст. Раньше сюда уходил error.message от OpenAI
    // (модель, лимиты аккаунта, детали запроса) — это внутренняя информация,
    // клиенту она не нужна и в чужих руках лишняя. Подробности остаются в логе.
    console.error("[daily] error:", error);
    return NextResponse.json(
      { error: "Не удалось приготовить рецепт дня. Попробуйте позже." },
      { status: 500 },
    );
  }
}