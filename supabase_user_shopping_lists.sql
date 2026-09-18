-- ============================================================================
-- Личные списки покупок залогиненных — серверное зеркало localStorage.
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать. Ничего не удаляет.
--
-- ЧТО ЭТО. Сегодня личные мультисписки живут ТОЛЬКО в localStorage устройства
-- (`smartcook_shopping_lists_v2`, lib/shoppingLists.ts): сменил телефон —
-- списков нет. Этот файл заводит таблицу, куда залогиненный человек зеркалит
-- свои списки, по тому же принципу, что профиль вкуса и банкеты: залогинен —
-- на сервере, гость — на устройстве, при регистрации переносится.
--
-- ИСТОЧНИК ПРАВДЫ ОСТАЁТСЯ НА УСТРОЙСТВЕ. Сервер — зеркало, а не хозяин.
-- Ни одна ветка клиентского кода не имеет права стереть локальный список по
-- ответу сервера (lib/shoppingSync.ts). Красная линия задачи: ни один список
-- ни у кого не теряется — ни при обновлении, ни при первом входе, ни при
-- конфликте; дубль лучше потери.
--
-- ---------------------------------------------------------------------------
-- ПОЧЕМУ НЕ ПЕРЕИСПОЛЬЗУЕМ shared_lists (общие семейные списки)
-- ---------------------------------------------------------------------------
-- 1. Личность там — `member_ref`, случайный UUID устройства без Supabase Auth.
--    Здесь владелец — настоящий `auth.uid()`, и это ровно тот случай, где
--    RLS-политики работают как задумано (в shared_lists они бы проверяли
--    пустоту, поэтому там политик ноль и всё идёт через service_role).
-- 2. `shared_lists.id` — ЭТО И ЕСТЬ токен приглашения: кто знает id, вступает
--    через /shopping/join/<id>. Личный список в той таблице стал бы
--    присоединяемым по ссылке.
-- 3. Позиции там — строки с checked_by/created_by. Клиент личных списков
--    работает снимками «весь массив целиком», построчная модель заставила бы
--    переписать все точки записи ради слияния, которого в v1 нет.
--
-- ---------------------------------------------------------------------------
-- МОДЕЛЬ БЕЗОПАСНОСТИ
-- ---------------------------------------------------------------------------
-- RLS включён, политик ТРИ, все — строго `auth.uid() = user_id`:
--   select / insert / update.
-- Роли `anon` не дано ничего: политики выданы только роли `authenticated`.
-- DELETE-политики НЕТ ВООБЩЕ — удаление в интерфейсе мягкое (archived_at),
-- как в общих списках и банкетах. Честный DELETE клиент вызвать не может
-- физически; строки уходят только каскадом при удалении аккаунта.
--
-- ДАННЫЕ НЕ УДАЛЯЮТСЯ: «удалил список» = `archived_at`, строка живёт.
-- Исключение ровно одно — `on delete cascade` от `auth.users`: при удалении
-- аккаунта (app/api/account/delete/route.ts → admin.auth.admin.deleteUser)
-- личные списки уходят вместе с пользователем. Это требование App Store R1,
-- отдельной строки в роуте не нужно — каскад закрывает.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Таблица
-- ----------------------------------------------------------------------------

create table if not exists public.user_shopping_lists (
  -- id ТОТ ЖЕ, что в localStorage. Он стоит в адресе /shopping/<id>, в
  -- закреплениях (smartcook_shopping_pinned_v1), в карте импортированных
  -- ссылок и в указателе общего списка (fromLocalId) — выдать свой id на
  -- сервере значило бы порвать все эти связи.
  --
  -- text, а не uuid: newId() в lib/shoppingLists.ts падает на запасной путь
  -- `${Date.now()}-${random}` там, где нет crypto.randomUUID (старые WebView),
  -- и такие id уже лежат у людей в хранилище. uuid их бы просто не принял.
  id                text not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  -- Позиции снимком, ровно как в localStorage: [{id, name, checked, source?}].
  items             jsonb not null default '[]'::jsonb,
  -- Кэш раскладки по отделам — та же пара, что у общих списков.
  sort_sig          text,
  sort_groups       jsonb,
  created_at        timestamptz not null default now(),
  -- Порядок «кто новее» решает ТОЛЬКО это поле, и ставит его триггер серверным
  -- временем. Часы устройств врут (особенно после долгого офлайна), а от
  -- сравнения зависит, чья версия останется под этим id.
  updated_at        timestamptz not null default now(),
  -- То же самое глазами клиента: хаб подписывает карточку «обновлён вчера
  -- 09:30» именно по нему, и подпись не должна поехать после синхронизации.
  client_updated_at timestamptz,
  archived_at       timestamptz,
  -- Пара, а не одинокий id: id генерирует клиент, и присланный чужой id не
  -- должен ни конфликтовать с моей строкой, ни выдавать факт её существования.
  primary key (user_id, id)
);

-- ----------------------------------------------------------------------------
-- 2. Ограничения — вторая линия обороны
-- ----------------------------------------------------------------------------
-- У общих списков лимиты проверяет серверный роут. Здесь роута-привратника
-- нет: клиент пишет в таблицу напрямую под своим JWT, и единственное место,
-- где можно проверить его ещё раз, — сама база. Пределы совпадают с
-- MAX_SHOPPING_ITEMS (60) и MAX_LIST_NAME_LENGTH (60) из lib/.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usl_id_len') then
    alter table public.user_shopping_lists
      add constraint usl_id_len check (char_length(id) between 1 and 64);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usl_name_len') then
    alter table public.user_shopping_lists
      add constraint usl_name_len check (char_length(name) between 1 and 60);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usl_items_shape') then
    alter table public.user_shopping_lists
      add constraint usl_items_shape
      check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 60);
  end if;

  -- 60 позиций по 50 символов плюс подписи-источники дают заметно меньше 32 КБ.
  -- Потолок отсекает попытку залить мегабайт в jsonb мимо клиентских лимитов.
  if not exists (select 1 from pg_constraint where conname = 'usl_items_size') then
    alter table public.user_shopping_lists
      add constraint usl_items_size check (pg_column_size(items) <= 32768);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'usl_sort_groups_is_array') then
    alter table public.user_shopping_lists
      add constraint usl_sort_groups_is_array
      check (sort_groups is null or jsonb_typeof(sort_groups) = 'array');
  end if;

  -- Тот же потолок подписи, что у общих списков (supabase_shared_list_sort.sql).
  if not exists (select 1 from pg_constraint where conname = 'usl_sort_sig_len') then
    alter table public.user_shopping_lists
      add constraint usl_sort_sig_len
      check (sort_sig is null or char_length(sort_sig) <= 4000);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Индекс
-- ----------------------------------------------------------------------------
-- Единственный запрос клиента — «все мои списки». Живые отдельно: архивные
-- копятся навсегда (мы их не удаляем), и раздувать ими основной индекс незачем.

create index if not exists user_shopping_lists_alive_idx
  on public.user_shopping_lists (user_id, updated_at desc)
  where archived_at is null;

-- ----------------------------------------------------------------------------
-- 4. Триггер updated_at
-- ----------------------------------------------------------------------------
-- У общих списков отметку времени ставит роут (touchSharedList) и триггера там
-- нет намеренно. Здесь роута нет, а доверять присланному клиентом времени
-- нельзя — иначе устройство с убежавшими часами навсегда выигрывало бы все
-- сравнения «кто новее» и затирало правки с других телефонов.

create or replace function public.touch_user_shopping_list()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_shopping_lists_touch on public.user_shopping_lists;
create trigger user_shopping_lists_touch
  before insert or update on public.user_shopping_lists
  for each row execute function public.touch_user_shopping_list();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.user_shopping_lists enable row level security;

-- Приводим набор политик к заявленному явно: повторный Run снимает всё, что
-- могли добавить руками в Dashboard, и возвращает ровно эти три.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_shopping_lists'
  loop
    execute format('drop policy %I on public.user_shopping_lists', pol.policyname);
  end loop;
end $$;

-- Читаю только свои списки.
create policy user_shopping_lists_select on public.user_shopping_lists
  for select to authenticated
  using (auth.uid() = user_id);

-- Создаю только от своего имени: with check не даёт подставить чужой user_id.
create policy user_shopping_lists_insert on public.user_shopping_lists
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Правлю только свои строки, и результат правки обязан остаться моим: без
-- второго условия можно было бы «переписать» свою строку на чужого владельца.
create policy user_shopping_lists_update on public.user_shopping_lists
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Политики DELETE нет сознательно: удаление мягкое, archived_at.

-- ----------------------------------------------------------------------------
-- 6. Самопроверка прямо в SQL Editor
-- ----------------------------------------------------------------------------
-- Выполнится вместе с файлом. Ожидаем rls_enabled = true и policies = 3.

select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'user_shopping_lists') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_shopping_lists';

-- И перечень политик поимённо: команда, роль, условие.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'user_shopping_lists'
order by policyname;

-- ============================================================================
-- Curl-приёмка (выполнить руками ПОСЛЕ Run). Подставить свои значения:
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"      # публичный ключ
--   USER_JWT="<access_token>"  # из localStorage браузера, ключ sb-*-auth-token
--
-- 1) Аноним не читает ничего.
--   curl -s "$SB_URL/rest/v1/user_shopping_lists?select=id,name" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--
-- 2) Аноним не пишет.
--   curl -s -X POST "$SB_URL/rest/v1/user_shopping_lists" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"id":"x","user_id":"00000000-0000-0000-0000-000000000000","name":"проверка"}'
--   # ожидаем: {"code":"42501", ... "row-level security policy" ...}
--
-- 3) Залогиненный видит только свои строки.
--   curl -s "$SB_URL/rest/v1/user_shopping_lists?select=id,name,user_id" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: только строки с user_id = его собственный
--
-- 4) Залогиненный не может подсунуть строку чужому владельцу.
--   curl -s -X POST "$SB_URL/rest/v1/user_shopping_lists" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"id":"hack","user_id":"<id ДРУГОГО пользователя>","name":"чужое"}'
--   # ожидаем: 42501
--
-- 5) ВАЖНО, иначе приёмка соврёт. Заблокированный PATCH отдаёт 204 ровно так
--    же, как успешный: RLS просто не показал ни одной строки, менять было
--    нечего. 204 — это НЕ доказательство записи и НЕ доказательство отказа.
--    Проверять ЧТЕНИЕМ ОБРАТНО сервис-ролью:
--   curl -s -X PATCH "$SB_URL/rest/v1/user_shopping_lists?id=eq.<чужой id>" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" -d '{"name":"взломано"}'
--   curl -s "$SB_URL/rest/v1/user_shopping_lists?select=id,name&id=eq.<чужой id>" \
--     -H "apikey: $SB_SERVICE_KEY" -H "Authorization: Bearer $SB_SERVICE_KEY"
--   # ожидаем: name остался прежним
--
-- 6) Честный DELETE недоступен даже владельцу — политики нет.
--   curl -s -X DELETE "$SB_URL/rest/v1/user_shopping_lists?id=eq.<свой id>" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: 0 удалённых строк; сверить чтением сервис-ролью — строка на месте
--
-- Пока FEATURE_SHOPPING_SYNC = false, приложение в эту таблицу не ходит вовсе —
-- миграцию безопасно держать в проде с нулём строк сколько угодно долго.
-- ============================================================================
