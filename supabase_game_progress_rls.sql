-- Run in Supabase SQL editor NOW — this closes the leaderboard/profile data leak
-- (anon key could `select *` from game_progress and get every user's user_id,
-- name, cooks, restaurant_level, energy, click_power, passive_income).
--
-- All app writes to game_progress already go through supabase.from('game_progress')
-- gated by `if (user)` and always use `user.id` as user_id (see app/page.tsx), so
-- restricting reads/writes to "own row only" matches existing behavior exactly.

alter table public.game_progress enable row level security;

drop policy if exists "Users can view their own game progress" on public.game_progress;
create policy "Users can view their own game progress"
on public.game_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own game progress" on public.game_progress;
create policy "Users can insert their own game progress"
on public.game_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own game progress" on public.game_progress;
create policy "Users can update their own game progress"
on public.game_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Anonymous (logged-out) visitors get zero direct access to game_progress —
-- matches the app, which never touches this table unless `user` is set.

-- Public leaderboard: ONLY display name, avatar, score, level and a computed
-- "is developer" flag. No user_id, no energy/click_power/passive_income/updated_at.
-- Views are created by the table owner, so they bypass the RLS above by design
-- and can safely expose this curated subset to anon/authenticated.
create or replace view public.game_leaderboard
with (security_invoker = false) as
select
  user_name,
  user_avatar,
  cooks,
  restaurant_level,
  (user_id = '68ff3d0a-2a09-4e22-b39b-3fea14de3f96'::uuid) as is_dev
from public.game_progress
order by cooks desc
limit 100;

grant select on public.game_leaderboard to anon, authenticated;

-- Narrow public lookup used to show a restaurant-level badge next to feed
-- photos/comments (app/page.tsx). user_id here is already public — it's the
-- author id of a public feed_posts/photo_comments row — so exposing it next
-- to just the level (no cooks/energy/name) is not a new leak.
create or replace view public.game_public_levels
with (security_invoker = false) as
select user_id, restaurant_level
from public.game_progress;

grant select on public.game_public_levels to anon, authenticated;
