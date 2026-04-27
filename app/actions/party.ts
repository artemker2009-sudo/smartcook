"use server";

import { createClient } from "@supabase/supabase-js";

type CreatePartyActionResult = { success: true; partyId: string } | { error: string };

export async function createPartyAction(
  title: string,
  guestCount: number,
  theme?: string | null,
): Promise<CreatePartyActionResult> {
  const safeTitle = title.trim();
  const parsedGuestCount = Number.parseInt(String(guestCount), 10);
  const safeGuestCount = Number.isFinite(parsedGuestCount) && parsedGuestCount > 0 ? parsedGuestCount : 4;

  if (!safeTitle) {
    return { error: "Не указан сценарий банкета" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return { error: "Не настроено подключение к базе данных" };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const safeTheme = theme?.trim();
  const payload: { title: string; guest_count: number; theme?: string } = {
    title: safeTitle,
    guest_count: safeGuestCount,
  };

  if (safeTheme) {
    payload.theme = safeTheme;
  }

  const { data, error } = await supabase
    .from("parties")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Ошибка при создании банкета:", error);
    return { error: error.message || "Не удалось создать банкет" };
  }

  if (!data?.id) {
    return { error: "Не удалось получить ID созданного банкета" };
  }

  return { success: true, partyId: data.id };
}
