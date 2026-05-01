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

export type HubParty = {
  id: string;
  title: string | null;
  theme: string | null;
  created_at: string | null;
  guest_count: number | null;
};

export type JoinPartyActionResult =
  | { success: true; isPaid: boolean; userId: string; guestData: PartyMemberData }
  | { success: false; error: "PAYWALL_REACHED"; isPaid: false }
  | { success: false; error: string };

export type SendPaywallChatAlertActionResult = { success: true } | { success: false; error: string };
export type ActivatePartyPassActionResult = { success: true } | { success: false; error: string };
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

export async function createPartyAction(title: string, guestCount: number, theme: string, hostId?: string | null) {
  try {
    const supabase = createServerSupabaseClient();
    const trimmedHostId = hostId?.trim();

    const { data, error } = await supabase
      .from('parties')
      .insert([{ 
        title, 
        guest_count: guestCount, 
        theme,
        ...(trimmedHostId ? { host_id: trimmedHostId } : {}),
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

export async function getHubParties(userId?: string | null, localIds?: string[]): Promise<HubParty[]> {
  const trimmedUserId = userId?.trim();
  const uniqueLocalIds = Array.from(
    new Set((localIds ?? []).map((id) => id.trim()).filter(Boolean)),
  );

  if (!trimmedUserId && uniqueLocalIds.length === 0) {
    return [];
  }

  const supabase = createServerSupabaseClient();
  const selectColumns = "id, title, theme, created_at, guest_count";
  const queries: PromiseLike<{ data: HubParty[] | null; error: { message: string } | null }>[] = [];

  if (trimmedUserId) {
    queries.push(
      supabase
        .from("parties")
        .select(selectColumns)
        .eq("host_id", trimmedUserId)
        .order("created_at", { ascending: false }),
    );
  }

  if (uniqueLocalIds.length > 0) {
    queries.push(
      supabase
        .from("parties")
        .select(selectColumns)
        .in("id", uniqueLocalIds)
        .order("created_at", { ascending: false }),
    );
  }

  const results = await Promise.all(queries);
  const partiesById = new Map<string, HubParty>();

  for (const result of results) {
    if (result.error) {
      throw new Error(result.error.message);
    }

    for (const party of result.data ?? []) {
      partiesById.set(party.id, party);
    }
  }

  return Array.from(partiesById.values()).sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

    return bTime - aTime;
  });
}

export async function deletePartyAction(id: string) {
  const trimmedId = id.trim();

  if (!trimmedId) {
    return { success: false, error: "Не хватает ID банкета для удаления" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const childTables = ["party_messages", "party_members", "party_items"] as const;

    for (const table of childTables) {
      const { error } = await supabase.from(table).delete().eq("party_id", trimmedId);
      if (error) throw new Error(error.message);
    }

    const { error } = await supabase.from("parties").delete().eq("id", trimmedId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error("Delete Party Action Error:", error);
    return { success: false, error: getActionErrorMessage(error) };
  }
}

export async function bindPartyHostAction(partyId: string, hostId: string) {
  const trimmedPartyId = partyId.trim();
  const trimmedHostId = hostId.trim();

  if (!trimmedPartyId || !trimmedHostId) {
    return { success: false, error: "Не хватает данных для сохранения организатора" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("parties").update({ host_id: trimmedHostId }).eq("id", trimmedPartyId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error("Bind Party Host Action Error:", error);
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

export async function activatePartyPassAction(partyId: string): Promise<ActivatePartyPassActionResult> {
  const trimmedPartyId = partyId.trim();

  if (!trimmedPartyId) {
    return { success: false, error: "Не хватает данных для активации Party Pass" };
  }

  try {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.from("parties").update({ is_paid: true }).eq("id", trimmedPartyId);

    if (error) throw new Error(error.message);
    return { success: true };
  } catch (error) {
    console.error("Activate Party Pass Action Error:", error);
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
