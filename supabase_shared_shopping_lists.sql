-- ============================================================================
-- Общий (семейный) список покупок с синхронизацией в реальном времени — PR B.
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать. Ничего не удаляет.
--
-- Это НЕ замена локальным спискам. Локальные мультисписки живут в localStorage
-- (`smartcook_shopping_lists_v2`, lib/shoppingLists.ts) и этой миграцией никак
-- не затрагиваются — общий список является отдельной, параллельной сущностью.
-- «Сделать общим» копирует стартовый снимок позиций на сервер, локальный
-- список при этом остаётся у человека нетронутым.
--
-- ---------------------------------------------------------------------------
-- МОДЕЛЬ БЕЗОПАСНОСТИ (решение основателя от 31.08, вариант A)
-- ---------------------------------------------------------------------------
-- RLS включён на всех трёх таблицах и НЕ ИМЕЕТ НИ ОДНОЙ ПОЛИТИКИ. Это блокирует
-- для ролей anon и authenticated ВСЁ — и чтение, и запись. Единственный, кто
-- работает с этими таблицами, — серверные Route Handlers на service_role
-- (lib/supabaseAdmin.ts), которая RLS обходит.
--
-- Почему не политики вида `using (auth.uid() = ...)`: участники общего списка —
-- анонимные устройства без Supabase Auth (принцип анонимности, как в банкетах),
-- у них нет auth.uid(), и такая политика для них не проверила бы ничего.
-- Проверка «владелец или участник» живёт в коде роута: member_ref из тела
-- запроса → `select 1 from shared_list_members where shared_list_id = $1
-- and member_ref = $2 and left_at is null`; нет строки — 403 и ни байта данных.
-- Права владельца (переименовать, архивировать) — дополнительно
-- `shared_lists.owner_ref = member_ref`.
--
-- Это СТРОЖЕ, чем любая membership-политика, и заметно строже party-модели
-- (supabase_party_members_rls.sql), где SELECT открыт `using (true)`: там curl
-- с публичным anon-ключом свободно читает список гостей и меню банкета, здесь
-- такой curl не получает ни строки.
--
-- СЛЕДСТВИЕ, ЭТО НЕ БАГ: Realtime `postgres_changes` до анонимных клиентов по
-- этим таблицам не долетит никогда — Realtime фильтрует WAL-события через RLS
-- роли подписчика, а она здесь не видит ничего. Живое обновление сделано на
-- Broadcast: после каждой записи сервер шлёт лёгкий пинг `changed` в канал
-- `shared-list:<id>`, клиент в ответ дёргает GET. Поэтому этой миграции НЕ
-- нужен ни `ALTER PUBLICATION supabase_realtime ADD TABLE`, ни тумблер Realtime
-- в Dashboard. Прецедент Broadcast в коде — `paywall_alert`,
-- app/party/[id]/ClientRoom.tsx.
--
-- ---------------------------------------------------------------------------
-- ДАННЫЕ НЕ УДАЛЯЮТСЯ НИКОГДА (решение основателя от 31.08)
-- ---------------------------------------------------------------------------
-- Удаление в интерфейсе — всегда мягкое, простановка отметки времени:
--   * позицию убрали из списка   → shared_list_items.deleted_at
--   * список «удалили»           → shared_lists.archived_at
--   * участник вышел             → shared_list_members.left_at
-- Честный DELETE код не вызывает нигде. `on delete cascade` ниже оставлен
-- только как страховка ссылочной целостности на случай ручной чистки в
-- Dashboard — кодом каскад не запускается.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Таблицы
-- ----------------------------------------------------------------------------

-- Сам общий список. id — он же токен ссылки-приглашения
-- (smart-cook.pro/shopping/join/<id>): 122 бита энтропии UUIDv4 не
-- перебираются, отдельного join_token в v1 сознательно нет (решение
-- основателя — ротация ссылки не нужна, владельцу достаточно архивации).
create table if not exists public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,                            -- sanitizeListName, ≤60
  owner_ref text not null,                       -- member_ref создателя
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), -- проставляет роут при записи
  archived_at timestamptz                        -- «удалён» = скрыт, строки живут
);

-- Участники. member_ref — идентификатор, сгенерированный на клиенте
-- (crypto.randomUUID()) и сохранённый в localStorage устройства. Сервер ему
-- доверяет на вставке — ровно та же модель доверия, что у party.user_id
-- (app/actions/party.ts). Сильнее без регистрации каждого гостя не сделать, а
-- регистрация противоречит принципу анонимности.
create table if not exists public.shared_list_members (
  id uuid primary key default gen_random_uuid(),
  shared_list_id uuid not null references public.shared_lists(id) on delete cascade,
  member_ref text not null,
  member_name text not null,                     -- как зовут в списке, ≤50
  joined_at timestamptz not null default now(),
  left_at timestamptz,                           -- вышел — строка остаётся
  unique (shared_list_id, member_ref)
);

-- Позиции списка. Именно их правки участники видят в реальном времени.
create table if not exists public.shared_list_items (
  id uuid primary key default gen_random_uuid(),
  shared_list_id uuid not null references public.shared_lists(id) on delete cascade,
  name text not null,                            -- sanitizeShoppingName, ≤50
  checked boolean not null default false,
  checked_by text,                               -- member_ref: кто отметил купленным
  created_by text,                               -- member_ref: кто добавил
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                         -- мягкое удаление
);

-- ----------------------------------------------------------------------------
-- 2. Добивка колонок, если ранняя версия миграции уже прогонялась
-- ----------------------------------------------------------------------------
-- Черновик этого файла от 06.08 создавал те же три таблицы, но БЕЗ колонок
-- мягкого удаления и без checked_by. Если он был прогнан — эти alter'ы
-- дополнят таблицы, не тронув данные. Если нет — просто ничего не сделают.

alter table public.shared_lists
  add column if not exists archived_at timestamptz;

alter table public.shared_list_members
  add column if not exists left_at timestamptz;

alter table public.shared_list_items
  add column if not exists deleted_at timestamptz,
  add column if not exists checked_by text;

-- ----------------------------------------------------------------------------
-- 3. Ограничения длины — вторая линия обороны
-- ----------------------------------------------------------------------------
-- Санитизация и обрезка уже сделаны в роуте (sanitizeShoppingName /
-- sanitizeListName из lib/shoppingList.ts и lib/shoppingLists.ts). Эти CHECK'и
-- — страховка на случай, если новый роут когда-нибудь забудут через них
-- пропустить: мегабайтную строку в общий список положить не выйдет физически.
-- Пределы совпадают с константами MAX_SHOPPING_ITEM_LENGTH (50) и
-- MAX_LIST_NAME_LENGTH (60). Идемпотентно: add constraint if not exists в
-- Postgres нет, поэтому через каталог.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shared_lists_name_len') then
    alter table public.shared_lists
      add constraint shared_lists_name_len check (char_length(name) between 1 and 60);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shared_lists_owner_ref_len') then
    alter table public.shared_lists
      add constraint shared_lists_owner_ref_len check (char_length(owner_ref) between 1 and 64);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shared_list_members_name_len') then
    alter table public.shared_list_members
      add constraint shared_list_members_name_len check (char_length(member_name) between 1 and 50);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shared_list_members_ref_len') then
    alter table public.shared_list_members
      add constraint shared_list_members_ref_len check (char_length(member_ref) between 1 and 64);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shared_list_items_name_len') then
    alter table public.shared_list_items
      add constraint shared_list_items_name_len check (char_length(name) between 1 and 50);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Индексы
-- ----------------------------------------------------------------------------
-- Главный запрос экрана — «живые позиции этого списка», поэтому индекс
-- частичный: удалённые строки в него не попадают и не раздувают его со
-- временем (а удаляем мы только мягко, значит они копятся навсегда).
create index if not exists shared_list_items_list_alive_idx
  on public.shared_list_items (shared_list_id, created_at)
  where deleted_at is null;

create index if not exists shared_list_members_list_id_idx
  on public.shared_list_members (shared_list_id);

-- «Списки, где я владелец» — для восстановления хаба, если localStorage
-- устройства потерялся.
create index if not exists shared_lists_owner_ref_idx
  on public.shared_lists (owner_ref);

-- ----------------------------------------------------------------------------
-- 5. RLS: включён, политик ноль
-- ----------------------------------------------------------------------------

alter table public.shared_lists enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items enable row level security;

-- Приводим к состоянию «ни одной политики» явно, а не по умолчанию: если на
-- этих таблицах когда-то экспериментировали с политиками в Dashboard, повторный
-- прогон файла вернёт заявленную гарантию безопасности, а не оставит щель.
-- ВНИМАНИЕ: если вы СОЗНАТЕЛЬНО добавите сюда политику руками, повторный Run
-- этого файла её снимет.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('shared_lists', 'shared_list_members', 'shared_list_items')
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Политик сознательно нет — см. блок «МОДЕЛЬ БЕЗОПАСНОСТИ» в шапке файла.
-- Тот же приём, что у ai_rate_limit_events (supabase_rate_limits.sql).

-- ----------------------------------------------------------------------------
-- 6. Самопроверка прямо в SQL Editor
-- ----------------------------------------------------------------------------
-- Выполнится вместе с файлом. Должно вернуть три строки, у всех
-- rls_enabled = true и policies = 0.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('shared_lists', 'shared_list_members', 'shared_list_items')
order by c.relname;

-- ============================================================================
-- Curl-приёмка (выполнить руками ПОСЛЕ Run). Подставить свои значения:
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"   # публичный ключ — в этом и смысл проверки:
--                         # против этих таблиц он должен быть бессилен
--
-- 1) Аноним НЕ читает списки. Ожидаем пустой массив [] — и он должен остаться
--    пустым даже когда в таблице появятся реальные строки.
--   curl -s "$SB_URL/rest/v1/shared_lists?select=id,name,owner_ref" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--
-- 2) Аноним НЕ создаёт список. Ожидаем 401/403 с "row-level security", НЕ 201.
--   curl -s -X POST "$SB_URL/rest/v1/shared_lists" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"name":"проверка","owner_ref":"x"}'
--   # ожидаем: {"code":"42501", ... "row-level security policy" ...}
--
-- 3) То же самое для позиций — содержимое чужого списка не вычитывается и не
--    засоряется напрямую, мимо роута и мимо лимитов.
--   curl -s "$SB_URL/rest/v1/shared_list_items?select=id,name,checked" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--   curl -s -X POST "$SB_URL/rest/v1/shared_list_items" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"shared_list_id":"00000000-0000-0000-0000-000000000000","name":"проверка"}'
--   # ожидаем: 42501
--
-- 4) И для участников — список членов семьи наружу не утекает.
--   curl -s "$SB_URL/rest/v1/shared_list_members?select=id,member_ref,member_name" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--   curl -s -X POST "$SB_URL/rest/v1/shared_list_members" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"shared_list_id":"00000000-0000-0000-0000-000000000000","member_ref":"x","member_name":"проверка"}'
--   # ожидаем: 42501
--
-- 5) Залогиненный пользователь тоже бессилен напрямую — политик нет ни для
--    anon, ни для authenticated. С реальным пользовательским JWT:
--   curl -s "$SB_URL/rest/v1/shared_lists?select=id" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: []
--
-- Пока роуты Этапа 3 не написаны и не задеплоены, эти таблицы недостижимы для
-- приложения вообще — миграцию безопасно держать в проде с нулём строк сколько
-- угодно долго.
-- ============================================================================
