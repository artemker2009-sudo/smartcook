-- Run in Supabase SQL editor after verifying existing policies.
-- The app now inserts banquet guests through joinPartyAction with the service role key.
alter table public.party_members enable row level security;

drop policy if exists "Block direct client party member inserts" on public.party_members;

create policy "Block direct client party member inserts"
on public.party_members
as restrictive
for insert
to anon, authenticated
with check (false);

-- Optional hard guard against concurrent joins. It serializes inserts per party row
-- and blocks the 3rd guest while the banquet is still free.
create or replace function public.enforce_party_member_free_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_party_paid boolean;
  current_member_count integer;
begin
  select coalesce(is_paid, false)
  into is_party_paid
  from public.parties
  where id = new.party_id
  for update;

  if not found then
    raise foreign_key_violation using message = 'PARTY_NOT_FOUND';
  end if;

  if is_party_paid then
    return new;
  end if;

  select count(*)
  into current_member_count
  from public.party_members
  where party_id = new.party_id;

  if current_member_count >= 2 then
    raise exception 'PAYWALL_REACHED' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_party_member_free_limit on public.party_members;

create trigger enforce_party_member_free_limit
before insert on public.party_members
for each row
execute function public.enforce_party_member_free_limit();
