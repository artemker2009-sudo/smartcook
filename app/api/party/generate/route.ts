export const maxDuration = 60; // Позволит функции работать до 60 секунд.
export const runtime = 'edge';

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

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

type PartyItemBackup = {
  name: string;
  category?: string | null;
  ingredients?: unknown;
  votes?: string[] | null;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown };
    if (typeof candidate.message === "string" && candidate.message) return candidate.message;
    if (typeof candidate.error_description === "string" && candidate.error_description) {
      return candidate.error_description;
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const parseGeneratedMenu = (responseContent: string | null): GeneratedMenuItem[] => {
  if (!responseContent?.trim()) {
    throw new Error("AI_INVALID_RESPONSE");
  }

  try {
    const parsedData = JSON.parse(responseContent) as GeneratedMenuResponse;
    const items = Array.isArray(parsedData.items) ? parsedData.items : [];
    const validItems = items.filter(
      (item) =>
        item &&
        typeof item.name === "string" &&
        item.name.trim() &&
        typeof item.category === "string" &&
        item.category.trim() &&
        Array.isArray(item.ingredients),
    );

    if (validItems.length === 0) {
      throw new Error("AI_INVALID_RESPONSE");
    }

    return validItems;
  } catch (error) {
    if (error instanceof Error && error.message === "AI_INVALID_RESPONSE") {
      throw error;
    }

    throw new Error("AI_INVALID_RESPONSE");
  }
};

export async function POST(req: Request) {
  let partyId: string | undefined;
  let lockAcquired = false;
  let menuCleared = false;
  let previousItems: PartyItemBackup[] = [];

  try {
    console.log("0. Генерация меню запущена");
    const body = await req.json();
    partyId = body.partyId;
    const { theme, guestCount } = body;

    const { data: party, error: partyError } = await supabase
      .from('parties')
      .select('is_paid,is_generating')
      .eq('id', partyId)
      .single();

    if (partyError) {
      throw new Error(partyError.message);
    }

    if (!party?.is_paid) {
      return NextResponse.json({ error: 'Необходима активация Party Pass' }, { status: 402 });
    }

    if (party.is_generating) {
      return NextResponse.json({ error: 'Уже генерируем' }, { status: 409 });
    }

    const { data: lockedParty, error: lockError } = await supabase
      .from('parties')
      .update({ is_generating: true })
      .eq('id', partyId)
      .eq('is_generating', false)
      .select('id')
      .single();

    if (lockError || !lockedParty) {
      return NextResponse.json({ error: 'Уже генерируем' }, { status: 409 });
    }

    lockAcquired = true;
    console.log("1. Замок захвачен", { partyId });

    const { data: existingItems, error: backupError } = await supabase
      .from('party_items')
      .select('name,category,ingredients,votes')
      .eq('party_id', partyId);

    if (backupError) {
      throw new Error(backupError.message);
    }

    previousItems = ((existingItems as PartyItemBackup[] | null) ?? []).map((item) => ({
      name: item.name,
      category: item.category,
      ingredients: item.ingredients ?? [],
      votes: item.votes ?? null,
    }));
    console.log("1.1. Бекап старого меню создан", { count: previousItems.length });

    const { error: clearMenuError } = await supabase
      .from('party_items')
      .delete()
      .eq('party_id', partyId);

    if (clearMenuError) {
      throw new Error(clearMenuError.message);
    }

    menuCleared = true;
    console.log("2. Старое меню удалено", { partyId });

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

    console.log("3. Запрос к ИИ отправлен", { partyId });
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        response_format: { type: "json_object" },
        temperature: 0.7,
      },
      { timeout: 55000 },
    );
    console.log("4. Ответ ИИ получен", { partyId });

    const responseContent = completion.choices[0].message.content;
    const items = parseGeneratedMenu(responseContent);
    console.log("5. Ответ ИИ распарсен", { count: items.length });
    
    // Формируем массив для вставки в БД
    const itemsToInsert = items.map((item) => ({
      party_id: partyId,
      name: item.name.trim(),
      category: item.category.trim(),
      ingredients: item.ingredients
    }));

    // Сохраняем в Supabase
    console.log("6. Сохраняем новое меню", { count: itemsToInsert.length });
    const { error } = await supabase.from('party_items').insert(itemsToInsert);
    if (error) throw new Error(error.message);
    console.log("7. Новое меню сохранено", { partyId });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    console.error("AI GENERATION FAILED:", error);

    if (partyId && lockAcquired && menuCleared && previousItems.length > 0) {
      const itemsToRestore = previousItems.map((item) => ({
        party_id: partyId,
        name: item.name,
        category: item.category,
        ingredients: item.ingredients ?? [],
        votes: item.votes ?? null,
      }));

      console.log("ERR. Восстанавливаем старое меню", { count: itemsToRestore.length });
      const { error: restoreError } = await supabase.from('party_items').insert(itemsToRestore);

      if (restoreError) {
        console.error("AI Generation Restore Error:", restoreError);
      } else {
        console.log("ERR. Старое меню восстановлено", { partyId });
      }
    }

    const errorMessage = getErrorMessage(error) || "Неизвестная ошибка ИИ";

    return NextResponse.json(
      { success: false, error: errorMessage, details: String(error) },
      { status: 500 },
    );
  } finally {
    if (partyId && lockAcquired) {
      console.log("FIN. Сбрасываем замок генерации", { partyId });
      const { error: unlockError } = await supabase
        .from('parties')
        .update({ is_generating: false })
        .eq('id', partyId);

      if (unlockError) {
        console.error("AI Generation Unlock Error:", unlockError);
      }
    }
  }
}
