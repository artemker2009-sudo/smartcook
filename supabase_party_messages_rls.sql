-- Run in Supabase SQL editor.
--
-- ШАГ 1 (только чтение). Проверить, что RLS на банкетных таблицах действительно
-- включён и прямые UPDATE/DELETE для anon/authenticated запрещены. Миграции
-- supabase_admin_tables_rls.sql (parties) и supabase_party_members_rls.sql
-- (party_members, party_items) это делают; для party_messages миграции в
-- репозитории не было вовсе.
--
--   select c.relname as table_name, c.relrowsecurity as rls_enabled
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in ('parties', 'party_items', 'party_members', 'party_messages');
--
--   select tablename, policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('parties', 'party_items', 'party_members', 'party_messages')
--   order by tablename, cmd;
--
-- Ожидание: rls_enabled = true у всех четырёх; у parties, party_items,
-- party_members есть RESTRICTIVE-политики на UPDATE и DELETE с qual = false.
--
-- ШАГ 2. party_messages. Модель та же, что у остальных банкетных таблиц:
-- комната открыта по ссылке, поэтому SELECT открыт (серверная загрузка в
-- app/party/[id]/page.tsx и realtime-подписка в ClientRoom), а INSERT пока
-- ОСТАЁТСЯ открытым — чат отправляет сообщения прямо с клиента anon-ключом
-- (ClientRoom.sendMessage). Закрываем только UPDATE и DELETE: правка и удаление
-- чужих сообщений напрямую через anon-ключ. Удаление банкета целиком идёт через
-- service_role (lib/partyDelete.ts), RLS его не касается.

alter table public.party_messages enable row level security;

drop policy if exists "Allow read access to party_messages" on public.party_messages;
create policy "Allow read access to party_messages"
on public.party_messages
for select
to anon, authenticated
using (true);

drop policy if exists "Allow sending party messages" on public.party_messages;
create policy "Allow sending party messages"
on public.party_messages
for insert
to anon, authenticated
with check (true);

drop policy if exists "Block direct client party message updates" on public.party_messages;
create policy "Block direct client party message updates"
on public.party_messages
as restrictive
for update
to anon, authenticated
using (false);

drop policy if exists "Block direct client party message deletes" on public.party_messages;
create policy "Block direct client party message deletes"
on public.party_messages
as restrictive
for delete
to anon, authenticated
using (false);
