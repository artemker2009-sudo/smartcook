-- Run in Supabase SQL editor.
-- Backing tables for PR B (realtime family shopping list sync). See
-- REALTIME_SHOPPING_PLAN.md for the full design and rationale.
--
-- RLS deliberately has ZERO policies for anon/authenticated on all three
-- tables (same pattern as supabase_rate_limits.sql / ai_rate_limit_events) —
-- this blocks ALL direct client access, both read and write. Every read and
-- write goes through Next.js Route Handlers using the service role key
-- (lib/supabaseAdmin.ts), which bypasses RLS entirely. Membership/ownership
-- checks live in that server code, not in Postgres policies (guests here are
-- anonymous client-generated ids, not Supabase Auth users, so classic
-- auth.uid()-based policies don't apply) — see REALTIME_SHOPPING_PLAN.md §2.1.
--
-- Consequence: Realtime postgres_changes will NEVER reach anon clients for
-- these tables (Realtime filters WAL events through the subscriber's RLS) —
-- that's intentional, not a bug to fix later. Live updates use Broadcast
-- instead: after each write the server sends a lightweight "changed" ping on
-- a channel keyed by list id, and clients refetch via GET. No
-- `ALTER PUBLICATION supabase_realtime ADD TABLE ...` is needed for this
-- migration. See REALTIME_SHOPPING_PLAN.md §2.2.

create table if not exists public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_ref text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_list_members (
  id uuid primary key default gen_random_uuid(),
  shared_list_id uuid not null references public.shared_lists(id) on delete cascade,
  member_ref text not null,
  member_name text not null,
  joined_at timestamptz not null default now(),
  unique (shared_list_id, member_ref)
);

create table if not exists public.shared_list_items (
  id uuid primary key default gen_random_uuid(),
  shared_list_id uuid not null references public.shared_lists(id) on delete cascade,
  name text not null,
  checked boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_list_members_list_id_idx
  on public.shared_list_members (shared_list_id);
create index if not exists shared_list_items_list_id_idx
  on public.shared_list_items (shared_list_id);

alter table public.shared_lists enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items enable row level security;
-- No policies added on purpose: this blocks all access from anon/authenticated
-- roles, both read and write. The Route Handlers (Stage 3) use the service
-- role key, which bypasses RLS. See header comment above.

-- ---------------------------------------------------------------------------
-- Curl acceptance — run these BY HAND after applying the migration above,
-- before writing any application code. Replace $SUPABASE_URL and $ANON_KEY
-- with the project's values (the anon key is public by design — that's the
-- whole point of this test: it must stay powerless against these tables).
-- ---------------------------------------------------------------------------

-- 1) SELECT with anon key -> expect an empty array, not an error and not
--    real rows (must stay [] even once rows exist, for anon AND authenticated).
--
--   curl -s "$SUPABASE_URL/rest/v1/shared_lists?select=id" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
--
--   expected: []

-- 2) INSERT with anon key -> expect a row-level security rejection (42501),
--    not 201.
--
--   curl -s -X POST "$SUPABASE_URL/rest/v1/shared_lists" \
--     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
--     -H "Content-Type: application/json" -H "Prefer: return=representation" \
--     -d '{"name":"test","owner_ref":"x"}'
--
--   expected: {"code":"42501", ...} / "new row violates row-level security policy"

-- 3) Repeat checks 1 and 2 against shared_list_items and shared_list_members
--    (swap the table name and, for the INSERT check, a matching payload:
--    {"shared_list_id":"00000000-0000-0000-0000-000000000000","name":"test"}
--    for shared_list_items, or
--    {"shared_list_id":"00000000-0000-0000-0000-000000000000","member_ref":"x","member_name":"test"}
--    for shared_list_members) -> same expected results ([] on SELECT, 42501
--    on INSERT).

-- 4) These tables are unreachable by any application code until the Stage 3
--    Route Handlers are written and deployed — safe to leave applied in prod
--    with zero rows for as long as needed.
