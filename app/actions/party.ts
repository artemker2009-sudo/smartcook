"use server";

import { createClient } from '@supabase/supabase-js';

const FREE_GUEST_LIMIT = 2;

const createServerSupabaseClient = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for party server actions");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
};

type PartyMemberData = {
  id?: string;
  party_id?: string;
  user_id?: string | null;
  user_name?: string | null;
};

type PartyItemData = {
  id: string;
  party_id?: string;
  name: string;
  category?: string | null;
  ingredients?: unknown;
  votes?: string[] | null;
  created_at?: string | null;
};

export type JoinPartyActionResult =
  | { success: true; isPaid: boolean; userId: string; guestData: PartyMemberData }
  | { success: false; error: "PAYWALL_REACHED"; isPaid: false }
  | { success: false; error: string };

export type SendPaywallChatAlertActionResult = { success: true } | { success: false; error: string };
export type TogglePartyItemVoteActionResult =
  | { success: true; item: PartyItemData }
  | { success: false; error: string };

const getActionErrorMessage = (error: unknown) => (error instanceof Error ? error.message : "Неизвестная ошибка сервера");
const ZERO_WIDTH_CHARS = ["\u200B", "\u200C", "\u200D", "\u2060"] as const;
const makeInvisibleSuffix = (seed: string) =>
  Array.from(seed)
    .map((char) => ZERO_WIDTH_CHARS[char.charCodeAt(0) % ZERO_WIDTH_CHARS.length])
    .join("");
const toggleVotesForUser = (votes: string[] | null | undefined, userMarkers: string[], userId: string) => {
  const currentVotes = votes ?? [];
  const hasCurrentVote = currentVotes.some((vote) => userMarkers.includes(vote));
  const votesWithoutCurrentUser = currentVotes.filter((vote) => !userMarkers.includes(vote));

  return hasCurrentVote ? votesWithoutCurrentUser : [...votesWithoutCurrentUser, userId];
};

export async function createPartyAction(title: string, guestCount: number, theme: string) {
  try {
    const supabase = createServerSupabaseClient();

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
    const supabase = createServerSupabaseClient();

    const [
      { count, error: countError },
      { data: party, error: partyError },
      { data: existingBrowserMember, error: existingBrowserMemberError },
    ] = await Promise.all([
      supabase.from("party_members").select("*", { count: "exact", head: true }).eq("party_id", partyId),
      supabase.from("parties").select("is_paid").eq("id", partyId).single(),
      supabase
        .from("party_members")
        .select("id, party_id, user_id, user_name")
        .eq("party_id", partyId)
        .eq("user_id", trimmedUserId)
        .maybeSingle(),
    ]);

    if (countError) throw new Error(countError.message);
    if (partyError) throw new Error(partyError.message);
    if (existingBrowserMemberError) throw new Error(existingBrowserMemberError.message);

    const isPaid = Boolean(party?.is_paid);

    if (existingBrowserMember?.id) {
      const candidateNames = [trimmedName, `${trimmedName}${makeInvisibleSuffix(trimmedUserId)}`];

      for (const candidateName of candidateNames) {
        const { data: updatedMember, error: updateError } = await supabase
          .from("party_members")
          .update({ user_name: candidateName })
          .eq("id", existingBrowserMember.id)
          .select("id, party_id, user_id, user_name")
          .single();

        if (!updateError) {
          return {
            success: true,
            isPaid,
            userId: trimmedUserId,
            guestData: updatedMember,
          };
        }

        if (updateError.code !== "23505") {
          throw new Error(updateError.message);
        }
      }

      throw new Error("Не удалось обновить имя. Попробуйте еще раз.");
    }

    if (!isPaid && (count ?? 0) >= FREE_GUEST_LIMIT) {
      return { success: false, error: "PAYWALL_REACHED", isPaid: false };
    }

    const candidateNames = [trimmedName, `${trimmedName}${makeInvisibleSuffix(trimmedUserId)}`];

    for (const candidateName of candidateNames) {
      const { data: insertedMember, error: insertError } = await supabase
        .from("party_members")
        .insert([{ party_id: partyId, user_id: trimmedUserId, user_name: candidateName }])
        .select("id, party_id, user_id, user_name")
        .single();

      if (!insertError) {
        return { success: true, isPaid, userId: trimmedUserId, guestData: insertedMember };
      }

      if (insertError.message === "PAYWALL_REACHED") {
        return { success: false, error: "PAYWALL_REACHED", isPaid: false };
      }

      if (insertError.code !== "23505") {
        throw new Error(insertError.message);
      }
    }

    throw new Error("Не удалось войти с этим именем. Попробуйте еще раз.");
  } catch (error) {
    console.error("Join Party Action Error:", error);
    return {
      success: false,
      error: getActionErrorMessage(error),
    };
  }
}

export async function sendPaywallChatAlertAction(
  partyId: string,
  guestName: string,
): Promise<SendPaywallChatAlertActionResult> {
  const trimmedName = guestName.trim();

  if (!partyId || !trimmedName) {
    return { success: false, error: "Не хватает данных для отправки сообщения" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("party_messages").insert([
      {
        party_id: partyId,
        user_name: trimmedName,
        text:
          "Я хочу присоединиться к банкету, но бесплатный лимит гостей уже закончился. " +
          "Ребята, активируйте Party Pass, и места станут безлимитными для всех 🙏",
      },
    ]);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error("Paywall Chat Alert Action Error:", error);
    return { success: false, error: getActionErrorMessage(error) };
  }
}

export async function togglePartyItemVoteAction(
  partyId: string,
  itemId: string,
  userId: string,
  userName?: string | null,
): Promise<TogglePartyItemVoteActionResult> {
  const trimmedPartyId = partyId.trim();
  const trimmedItemId = itemId.trim();
  const trimmedUserId = userId.trim();
  const trimmedUserName = userName?.trim() ?? "";

  if (!trimmedPartyId || !trimmedItemId || !trimmedUserId) {
    return { success: false, error: "Не хватает данных для обновления лайка" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: item, error: itemError } = await supabase
      .from("party_items")
      .select("*")
      .eq("id", trimmedItemId)
      .eq("party_id", trimmedPartyId)
      .single();

    if (itemError) throw new Error(itemError.message);
    if (!item) throw new Error("Блюдо не найдено");

    const userMarkers = [trimmedUserId, trimmedUserName].filter(Boolean);
    const nextVotes = toggleVotesForUser(item.votes, userMarkers, trimmedUserId);

    const { data: updatedItem, error: updateError } = await supabase
      .from("party_items")
      .update({ votes: nextVotes })
      .eq("id", trimmedItemId)
      .eq("party_id", trimmedPartyId)
      .select("*")
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!updatedItem) throw new Error("БД не вернула обновленное блюдо");

    return { success: true, item: updatedItem as PartyItemData };
  } catch (error) {
    console.error("Toggle Party Item Vote Action Error:", error);
    return { success: false, error: getActionErrorMessage(error) };
  }
}
