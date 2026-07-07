import { supabase } from "@/lib/supabase";

const GUEST_PARTIES_STORAGE_KEY = "smartcook_guest_parties";

function readGuestPartyIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GUEST_PARTIES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

// Анонимная device-личность для конкретного банкета (та же, что ушла в
// party_members.user_id / parties.host_id). См. ключи в ClientRoom.
function anonIdForParty(partyId: string): string | null {
  try {
    const direct = localStorage.getItem(`party_user_id_${partyId}`);
    if (direct?.trim()) return direct.trim();
    const blob = localStorage.getItem(`party_participant_${partyId}`);
    if (blob) {
      const parsed = JSON.parse(blob) as { userId?: unknown };
      if (typeof parsed?.userId === "string" && parsed.userId.trim()) return parsed.userId.trim();
    }
  } catch {
    /* повреждённый localStorage — просто пропускаем */
  }
  return null;
}

/**
 * Привязывает к залогиненному аккаунту банкеты и гостевые участия, накопленные
 * анонимно на этом устройстве (задача E). Best-effort: любые ошибки глотаем,
 * чтобы не мешать входу/регистрации. Владельца сервер берёт из проверенной
 * сессии (JWT), не из тела запроса.
 */
export async function claimGuestPartiesToAccount(): Promise<void> {
  try {
    const ids = readGuestPartyIds();
    if (!ids.length) return;

    const claims = ids
      .map((partyId) => ({ partyId, anonUserId: anonIdForParty(partyId) }))
      .filter((c): c is { partyId: string; anonUserId: string } => Boolean(c.anonUserId));

    if (!claims.length) return;

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    await fetch("/api/party/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ claims }),
    });
  } catch {
    /* перенос — не критичный путь, вход не блокируем */
  }
}
