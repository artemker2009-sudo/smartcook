-- Run in Supabase SQL editor after verifying existing policies.
-- The admin panel (app/admin/page.tsx) now reads/writes parties, support_tickets,
-- site_settings and analytics_events only through /api/admin/* routes using the
-- service role key (which bypasses RLS). These policies close direct access from
-- the public anon key so a visitor can no longer read/mutate admin data by
-- calling Supabase straight from devtools with the (necessarily public) anon key.

-- parties: guests still need to SELECT (view a party page) and UPDATE room
-- settings (title/description) as the host, so we only block DELETE for
-- anon/authenticated — deletion now only happens via deletePartyAction /
-- /api/admin/parties, both of which use the service role key.
alter table public.parties enable row level security;

drop policy if exists "Allow read access to parties" on public.parties;
create policy "Allow read access to parties"
on public.parties
for select
to anon, authenticated
using (true);

drop policy if exists "Allow room host updates to parties" on public.parties;
create policy "Allow room host updates to parties"
on public.parties
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Block direct client party deletes" on public.parties;
create policy "Block direct client party deletes"
on public.parties
as restrictive
for delete
to anon, authenticated
using (false);

-- support_tickets: users can only create their own ticket; only the admin
-- routes (service role) may read or update them.
alter table public.support_tickets enable row level security;

drop policy if exists "Allow inserting support tickets" on public.support_tickets;
create policy "Allow inserting support tickets"
on public.support_tickets
for insert
to anon, authenticated
with check (true);

drop policy if exists "Block direct client support ticket reads" on public.support_tickets;
create policy "Block direct client support ticket reads"
on public.support_tickets
as restrictive
for select
to anon, authenticated
using (false);

drop policy if exists "Block direct client support ticket updates" on public.support_tickets;
create policy "Block direct client support ticket updates"
on public.support_tickets
as restrictive
for update
to anon, authenticated
using (false);

-- analytics_events: the client only ever inserts tracking events; only the
-- admin dashboard (service role) reads them back.
alter table public.analytics_events enable row level security;

drop policy if exists "Allow inserting analytics events" on public.analytics_events;
create policy "Allow inserting analytics events"
on public.analytics_events
for insert
to anon, authenticated
with check (true);

drop policy if exists "Block direct client analytics reads" on public.analytics_events;
create policy "Block direct client analytics reads"
on public.analytics_events
as restrictive
for select
to anon, authenticated
using (false);

-- site_settings: every visitor's page load checks maintenance mode with the
-- anon key (see app/layout.tsx), so SELECT must stay open. Only the admin
-- route (service role) may flip is_maintenance now.
alter table public.site_settings enable row level security;

drop policy if exists "Allow read access to site_settings" on public.site_settings;
create policy "Allow read access to site_settings"
on public.site_settings
for select
to anon, authenticated
using (true);

drop policy if exists "Block direct client site_settings updates" on public.site_settings;
create policy "Block direct client site_settings updates"
on public.site_settings
as restrictive
for update
to anon, authenticated
using (false);
