import type { SupabaseClient } from "@supabase/supabase-js";

// Право организатора на удаление. verifiedUserId — ТОЛЬКО id из проверенного
// сервером access token (getVerifiedUserId), не из тела запроса. Банкет без
// host_id или с host_id гостя (device-id) удалить через этот путь нельзя.
export function canDeleteParty(
  hostId: string | null | undefined,
  verifiedUserId: string | null | undefined,
): boolean {
  const host = typeof hostId === "string" ? hostId.trim() : "";
  const user = typeof verifiedUserId === "string" ? verifiedUserId.trim() : "";
  return host.length > 0 && user.length > 0 && host === user;
}

// Удаление банкета целиком: сообщения, участники, меню, затем сама комната.
// НЕ server action и не экспортируется из "use server"-файла — вызывать только
// из серверных роутов, которые УЖЕ проверили право на удаление:
//  - /api/party/delete — организатор по проверенному JWT (host_id === user.id);
//  - /api/admin/parties — админ по сессии админки.
// Раньше это был публичный deletePartyAction без проверки вызывающего: любой,
// у кого есть id экшена и uuid банкета, мог стереть чужую комнату.
// Клиент — service_role: RLS на банкетных таблицах запрещает прямые удаления
// anon/authenticated (см. supabase_admin_tables_rls.sql,
// supabase_party_members_rls.sql, supabase_party_messages_rls.sql).
export async function deletePartyWithChildren(
  admin: SupabaseClient,
  partyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const childTables = ["party_messages", "party_members", "party_items"] as const;

  for (const table of childTables) {
    const { error } = await admin.from(table).delete().eq("party_id", partyId);
    if (error) return { ok: false, error: error.message };
  }

  const { error } = await admin.from("parties").delete().eq("id", partyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
