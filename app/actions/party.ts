"use server";

import { createClient } from '@supabase/supabase-js';

const FREE_GUEST_LIMIT = 2;

// Инициализируем клиент внутри серверного экшена
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type JoinPartyActionResult =
  | { success: true; isPaid: boolean }
  | { success: false; reason: "limit_reached"; isPaid: false }
  | { success: false; error: string };

const getActionErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Неизвестная ошибка сервера");

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
  } catch (error) {
    console.error("Server Action Error:", error);
    return { success: false, error: getActionErrorMessage(error) };
  }
}

export async function joinPartyAction(
  partyId: string,
  userName: string,
  userId: string,
): Promise<JoinPartyActionResult> {
  const trimmedName = userName.trim();
  const trimmedUserId = userId.trim();

  if (!partyId || !trimmedName || !trimmedUserId) {
    return { success: false, error: "Не удалось войти: не хватает данных участника" };
  }

  try {
    const [{ count, error: countError }, { data: party, error: partyError }] = await Promise.all([
      supabase.from("party_members").select("*", { count: "exact", head: true }).eq("party_id", partyId),
      supabase.from("parties").select("is_paid").eq("id", partyId).single(),
    ]);

    if (countError) throw new Error(countError.message);
    if (partyError) throw new Error(partyError.message);

    const isPaid = Boolean(party?.is_paid);

    if (!isPaid && (count ?? 0) >= FREE_GUEST_LIMIT) {
      return { success: false, reason: "limit_reached", isPaid: false };
    }

    const { error: insertError } = await supabase
      .from("party_members")
      .insert([{ party_id: partyId, user_id: trimmedUserId, user_name: trimmedName }]);

    if (insertError) throw new Error(insertError.message);

    return { success: true, isPaid };
  } catch (error) {
    console.error("Join Party Action Error:", error);
    return {
      success: false,
      error: getActionErrorMessage(error),
    };
  }
}
