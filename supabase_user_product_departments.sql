-- ============================================================================
-- Исправленные человеком отделы продуктов — серверное зеркало localStorage.
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать. Ничего не удаляет.
--
-- ЧТО ЭТО. В «Покупках» появился перенос продукта в другой отдел: долгое
-- нажатие на строку → «Переместить в отдел…». Такое исправление должно
-- запоминаться — перенёс «хумус» в Бакалею, и при следующей раскладке хумус
-- сразу там, без вызова модели и без повторного переноса руками.
--
-- Где это уже живёт локально:
--   smartcook_shopping_department_pins_v1  — исправления человека (этот файл);
--   smartcook_shopping_departments_v1      — «выученное» из раскладок модели
--                                            (остаётся ТОЛЬКО на устройстве).
--
-- Две разные вещи, и смешивать их нельзя. «Выученное» пишется из любой
-- раскладки, включая модельную, поэтому ближайшее «обновить отделы» его
-- переписывает мнением модели — для догадки это правильно, для решения
-- человека недопустимо. Отсюда отдельное хранилище и отдельная таблица:
-- исправление человека применяется ПОВЕРХ любого результата раскладки и
-- сильнее и словаря, и модели.
--
-- ИСТОЧНИК ПРАВДЫ ОСТАЁТСЯ НА УСТРОЙСТВЕ, как у списков покупок
-- (supabase_user_shopping_lists.sql). Сервер — зеркало: он догоняет
-- устройство, а не наоборот. Гость работает целиком локально и в эту таблицу
-- не ходит вовсе.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ ПОЛЕ В user_shopping_lists
-- ---------------------------------------------------------------------------
-- Исправление относится к ПРОДУКТУ, а не к списку: «хумус — это Бакалея» верно
-- во всех списках человека и переживает удаление того списка, в котором его
-- поправили. Поле в строке списка пришлось бы дублировать в каждую строку и
-- терять вместе с ней.
--
-- ПОЧЕМУ НЕ user_metadata (как профиль вкуса)
-- ---------------------------------------------------------------------------
-- Метаданные аккаунта едут в JWT, то есть в каждый запрос. Пара сотен пар
-- «название → отдел» там ни к чему, а вычищать их потом сложнее, чем завести
-- таблицу сразу. Решение основателя 24.09.2026.
--
-- МОДЕЛЬ БЕЗОПАСНОСТИ
-- ---------------------------------------------------------------------------
-- RLS включён, политик ТРИ, все — строго `auth.uid() = user_id`:
--   select / insert / update, и только роли `authenticated`.
-- Роли `anon` не дано ничего.
-- DELETE-политики НЕТ ВООБЩЕ: снять исправление в интерфейсе нельзя, его можно
-- только заменить другим отделом (update). Строки уходят лишь каскадом при
-- удалении аккаунта — требование App Store R1 закрывается тем же каскадом, что
-- у личных списков, отдельной строки в роуте удаления аккаунта не нужно.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Таблица
-- ----------------------------------------------------------------------------

create table if not exists public.user_product_departments (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Ключ продукта — нормализованное название БЕЗ количества, в нижнем
  -- регистре: «сметана», а не «Сметана 20% 300 г». Нормализацию делает клиент
  -- (nameKey + splitQuantity в lib/shoppingDepartmentPins.ts) — ровно та же
  -- функция, которой раскладка ищет отдел. Второй нормализатор на сервере
  -- неминуемо разъехался бы с первым.
  name       text not null,
  -- Отдел из SHOPPING_DEPARTMENTS (lib/shoppingList.ts). CHECK'а на ПЕРЕЧЕНЬ
  -- отделов здесь намеренно нет: он потребовал бы ALTER в проде при добавлении
  -- десятого отдела, а защищал бы от нечего. Клиент пишет только под своим
  -- JWT, то есть подсунуть мусор может исключительно в СВОЮ строку, и при
  -- чтении такая строка отсеивается проверкой isDepartment. Ограничена длина —
  -- этого достаточно, чтобы в колонку нельзя было залить мегабайт.
  department text not null,
  created_at timestamptz not null default now(),
  -- Кто новее, решает ТОЛЬКО это поле, и ставит его триггер серверным
  -- временем. Часы устройств врут, а от сравнения зависит, какое из двух
  -- исправлений останется.
  updated_at timestamptz not null default now(),
  -- Пара, а не одинокое имя: ключ генерирует клиент, и присланное чужое имя не
  -- должно ни конфликтовать с моей строкой, ни выдавать факт её существования.
  primary key (user_id, name)
);

-- ----------------------------------------------------------------------------
-- 2. Ограничения — вторая линия обороны
-- ----------------------------------------------------------------------------
-- Роута-привратника здесь нет: клиент пишет в таблицу напрямую под своим JWT,
-- и единственное место, где лимиты можно проверить ещё раз, — сама база.
-- Пределы совпадают с MAX_SHOPPING_ITEM_LENGTH (50) из lib/shoppingList.ts.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'upd_name_len') then
    alter table public.user_product_departments
      add constraint upd_name_len check (char_length(name) between 1 and 50);
  end if;

  -- 40 с запасом покрывает самый длинный отдел («Овощи-фрукты» — 12 символов)
  -- и отсекает попытку положить в колонку что-то, кроме названия отдела.
  if not exists (select 1 from pg_constraint where conname = 'upd_department_len') then
    alter table public.user_product_departments
      add constraint upd_department_len check (char_length(department) between 1 and 40);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Индекс
-- ----------------------------------------------------------------------------
-- Единственный запрос клиента — «мои исправления, самые свежие сверху»:
-- на устройство забирается не больше двухсот записей (кап в
-- lib/shoppingDepartmentPins.ts), поэтому порядок по свежести нужен базе, а не
-- клиенту. Первичный ключ (user_id, name) этот запрос не обслуживает.

create index if not exists user_product_departments_recent_idx
  on public.user_product_departments (user_id, updated_at desc);

-- ----------------------------------------------------------------------------
-- 4. Триггер updated_at
-- ----------------------------------------------------------------------------
-- Доверять присланному клиентом времени нельзя: устройство с убежавшими часами
-- навсегда выигрывало бы все сравнения «кто новее». Отдельная функция, а не
-- общая с user_shopping_lists: у той в имени зашита своя таблица, и связывать
-- две сущности одним триггером ради трёх строк незачем.

create or replace function public.touch_user_product_department()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_product_departments_touch on public.user_product_departments;
create trigger user_product_departments_touch
  before insert or update on public.user_product_departments
  for each row execute function public.touch_user_product_department();

-- ----------------------------------------------------------------------------
-- 5. RLS
-- ----------------------------------------------------------------------------

alter table public.user_product_departments enable row level security;

-- Приводим набор политик к заявленному ЯВНО: сначала дропаем всё, что есть в
-- каталоге (перечислением, а не по именам — имя политики, созданной кликом в
-- Dashboard, заранее неизвестно, и `drop policy if exists "<ожидаемое имя>"`
-- её не тронет; см. раздел 3.1 CLAUDE.md), потом создаём ровно три.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_product_departments'
  loop
    execute format('drop policy %I on public.user_product_departments', pol.policyname);
  end loop;
end $$;

-- Читаю только свои исправления.
create policy user_product_departments_select on public.user_product_departments
  for select to authenticated
  using (auth.uid() = user_id);

-- Создаю только от своего имени: with check не даёт подставить чужой user_id.
create policy user_product_departments_insert on public.user_product_departments
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Правлю только свои строки, и результат правки обязан остаться моим: без
-- второго условия можно было бы «переписать» свою строку на чужого владельца.
create policy user_product_departments_update on public.user_product_departments
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Политики DELETE нет сознательно: исправление заменяется, а не удаляется.

-- ----------------------------------------------------------------------------
-- 6. Самопроверка прямо в SQL Editor
-- ----------------------------------------------------------------------------
-- Выполнится вместе с файлом. Ожидаем rls_enabled = true и policies = 3.

select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'user_product_departments') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'user_product_departments';

-- И перечень политик поимённо: команда, роль, условие.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'user_product_departments'
order by policyname;

-- ----------------------------------------------------------------------------
-- 7. Аудит из чек-листа CLAUDE.md
-- ----------------------------------------------------------------------------
-- Тот же запрос, что в supabase_recipe_likes_policy_fix.sql: показывает
-- таблицы и команды, открытые на запись кому угодно. ОЖИДАЕМЫЙ РЕЗУЛЬТАТ —
-- только осознанно открытое: INSERT в analytics_events, parties,
-- party_messages. Новой таблицы в выдаче быть НЕ должно.

with cmds as (select unnest(array['INSERT','UPDATE','DELETE']) as c),
     t as (select distinct schemaname, tablename from pg_policies where schemaname = 'public')
select t.tablename, c.c as command
from t
cross join cmds c
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename and p.cmd in (c.c, 'ALL')
group by 1, 2
having bool_or(
         p.permissive = 'PERMISSIVE'
         and (p.roles && array['public','anon','authenticated']::name[])
         and coalesce(p.qual, 'true') = 'true'
         and coalesce(p.with_check, 'true') = 'true'
       )
   and not coalesce(bool_or(
         p.permissive = 'RESTRICTIVE'
         and (p.roles && array['public','authenticated']::name[])
       ), false)
order by 1, 2;

-- ============================================================================
-- Curl-приёмка (выполнить руками ПОСЛЕ Run). Подставить свои значения:
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"        # публичный ключ
--   USER_JWT="<access_token>"  # из localStorage браузера, ключ sb-*-auth-token
--
-- 1) Аноним не читает ничего.
--   curl -s "$SB_URL/rest/v1/user_product_departments?select=name,department" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--
-- 2) Аноним не пишет.
--   curl -s -X POST "$SB_URL/rest/v1/user_product_departments" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"user_id":"00000000-0000-0000-0000-000000000000","name":"хумус","department":"Бакалея"}'
--   # ожидаем: {"code":"42501", ... "row-level security policy" ...}
--
-- 3) Залогиненный видит только свои строки.
--   curl -s "$SB_URL/rest/v1/user_product_departments?select=name,department,user_id" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: только строки со своим user_id
--
-- 4) Залогиненный не может записать строку чужому владельцу.
--   curl -s -X POST "$SB_URL/rest/v1/user_product_departments" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"user_id":"<id ДРУГОГО пользователя>","name":"хумус","department":"Бакалея"}'
--   # ожидаем: 42501
--
-- 5) ВАЖНО, иначе приёмка соврёт. Заблокированный PATCH отдаёт 204 ровно так
--    же, как успешный: RLS просто не показал ни одной строки, менять было
--    нечего. 204 — это НЕ доказательство записи и НЕ доказательство отказа.
--    Проверять ЧТЕНИЕМ ОБРАТНО сервис-ролью:
--   curl -s -X PATCH "$SB_URL/rest/v1/user_product_departments?user_id=eq.<чужой id>&name=eq.хумус" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" -d '{"department":"Взлом"}'
--   curl -s "$SB_URL/rest/v1/user_product_departments?select=name,department&user_id=eq.<чужой id>" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_SERVICE_KEY"
--   # ожидаем: department остался прежним
--
-- 6) Честный DELETE недоступен даже владельцу — политики нет.
--   curl -s -X DELETE "$SB_URL/rest/v1/user_product_departments?name=eq.хумус" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: 0 удалённых строк; сверить чтением сервис-ролью — строка на месте
--
-- 7) На ПУСТОЙ таблице закрытая и открытая политика неотличимы. Чтобы пункты 1
--    и 3 что-то значили, заведите одну строку сервис-ролью (и уберите её ею же
--    после проверки):
--   curl -s -X POST "$SB_URL/rest/v1/user_product_departments" \
--     -H "apikey: $SB_SERVICE_KEY" -H "Authorization: Bearer $SB_SERVICE_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"user_id":"<свой id>","name":"проверка","department":"Бакалея"}'
-- ============================================================================
