import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type GeneratedMenuItem = {
  name: string;
  category: string;
  ingredients: unknown[];
};

type GeneratedMenuResponse = {
  items?: GeneratedMenuItem[];
};

export async function POST(req: Request) {
  try {
    const { partyId, theme, guestCount } = await req.json();

    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('is_paid')
      .eq('id', partyId)
      .single();

    if (partyError) {
      throw new Error(partyError.message);
    }

    if (!party?.is_paid) {
      return NextResponse.json({ error: 'Необходима активация Party Pass' }, { status: 402 });
    }

    const systemPrompt = `Ты профессиональный шеф-повар. Составь меню для банкета. 
    Тематика/Сценарий: "${theme}". 
    Количество гостей: ${guestCount}.
    
    Верни СТРОГИЙ JSON в таком формате (без маркдауна и лишних слов):
    {
      "items": [
        {
          "name": "Название блюда",
          "category": "Закуски", // Строго одно из: "Закуски", "Салаты", "Горячее", "Напитки"
          "ingredients": [
            { "name": "Помидоры", "amount": 500, "unit": "г" } // amount уже умножено на количество гостей (${guestCount})
          ]
        }
      ]
    }
    
    Сгенерируй 2-3 закуски, 2 салата, 1-2 горячих блюда и 2 напитка. Количество ингредиентов должно быть реалистичным для ${guestCount} человек.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const responseContent = completion.choices[0].message.content;
    if (!responseContent) throw new Error("Пустой ответ от ИИ");

    const parsedData = JSON.parse(responseContent) as GeneratedMenuResponse;
    const items = Array.isArray(parsedData.items) ? parsedData.items : [];

    if (items.length === 0) {
      throw new Error("ИИ не вернул блюда для сохранения");
    }
    
    // Формируем массив для вставки в БД
    const itemsToInsert = items.map((item) => ({
      party_id: partyId,
      name: item.name,
      category: item.category,
      ingredients: item.ingredients
    }));

    // Сохраняем в Supabase
    const { error } = await supabase.from('party_items').insert(itemsToInsert);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    console.error("AI Generation Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
