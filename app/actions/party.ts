"use server";

import { createClient } from '@supabase/supabase-js';

// Инициализируем клиент внутри серверного экшена
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function createPartyAction(title: string, guestCount: number, theme: string) {
  try {
    const { data, error } = await supabase
      .from('parties')
      .insert([{ 
        title, 
        guest_count: guestCount, 
        theme 
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("БД не вернула данные");

    return { success: true, partyId: data.id };
  } catch (error: any) {
    console.error("Server Action Error:", error);
    return { success: false, error: error.message || "Неизвестная ошибка сервера" };
  }
}
