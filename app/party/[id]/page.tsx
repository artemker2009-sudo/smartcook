import { createClient } from "@supabase/supabase-js";

import ClientRoom from "./ClientRoom";

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Серверная загрузка - не зависит от клиентских fetch-запросов у мобильного оператора.
  const { data: party } = await supabase.from("parties").select("*").eq("id", id).single();

  if (!party) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Банкет не найден
      </div>
    );
  }

  const { data: items } = await supabase.from("party_items").select("*").eq("party_id", id);
  const { data: members } = await supabase.from("party_members").select("*").eq("party_id", id);
  const { data: messages } = await supabase
    .from("party_messages")
    .select("*")
    .eq("party_id", id)
    .order("created_at", { ascending: true });

  return (
    <ClientRoom
      party={party}
      initialItems={items || []}
      initialMembers={members || []}
      initialMessages={messages || []}
    />
  );
}
