-- Run in Supabase SQL editor.
-- Backing table for AI generation rate limiting (see lib/rateLimit.ts).
-- Only the server (service role key) ever reads/writes this table, so RLS
-- is enabled with zero policies to block direct access from anon/authenticated clients.

create table if not exists public.ai_rate_limit_events (
  id bigint generated always as identity primary key,
  identifier text not null, -- "ip:1.2.3.4" or "user:<uuid>"
  route text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_rate_limit_events_identifier_created_at_idx
  on public.ai_rate_limit_events (identifier, created_at desc);

alter table public.ai_rate_limit_events enable row level security;
-- No policies added on purpose: this blocks all access from anon/authenticated
-- roles. The API routes use the service role key, which bypasses RLS.
