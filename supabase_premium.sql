-- Run in Supabase SQL editor.
--
-- Премиум SmartCook. Только НОВЫЕ таблицы: ни одна существующая таблица и ни
-- одна существующая строка этой миграцией не трогается.
--
-- МОДЕЛЬ ДОСТУПА (как у ai_rate_limit_events, supabase_rate_limits.sql):
-- RLS включён, политик для anon/authenticated НЕТ ВООБЩЕ, плюс явный REVOKE
-- привилегий у обеих ролей. Читает и пишет только сервер — API-роуты под
-- service_role, с личностью пользователя из проверенного JWT (getVerifiedUserId).
-- Причина: здесь лежат деньги и срок Премиума. Любая политика для
-- authenticated — это дверь, через которую человек мог бы продлить себе срок
-- прямым REST-запросом с anon-ключом из бандла.

-- 1. Настройки Премиума: ровно одна строка (id = 1).
--    Отдельная таблица, а НЕ site_settings: у той была публичная запись.
create table if not exists public.premium_settings (
  id smallint primary key default 1,
  free_podbors_per_week int not null default 3 check (free_podbors_per_week between 0 and 50),
  updated_at timestamptz not null default now(),
  constraint premium_settings_single_row check (id = 1)
);

insert into public.premium_settings (id, free_podbors_per_week)
values (1, 3)
on conflict (id) do nothing;

-- 2. Журнал подборов. Подбор = новый ввод человека, по которому ИИ подбирает
--    рецепты (фото продуктов или текст «что есть дома»). Пишется ВСЕГДА, даже
--    когда флаг FEATURE_PREMIUM выключен — иначе не с чем будет сверяться.
create table if not exists public.podbor_usage (
  id bigint generated always as identity primary key,
  user_id uuid null,
  session_id text null,
  kind text not null check (kind in ('photo', 'text')),
  route text not null,
  created_at timestamptz not null default now()
);

-- Индексы ровно под счётный запрос «сколько подборов у этого владельца с
-- начала недели»: владелец + время, по убыванию времени.
create index if not exists podbor_usage_user_created_at_idx
  on public.podbor_usage (user_id, created_at desc)
  where user_id is not null;

create index if not exists podbor_usage_session_created_at_idx
  on public.podbor_usage (session_id, created_at desc)
  where session_id is not null;

-- Для админского «подборов на этой неделе» по всем сразу.
create index if not exists podbor_usage_created_at_idx
  on public.podbor_usage (created_at desc);

-- 3. Заказы. id — это InvId для Robokassa, поэтому identity (bigint) и никаких
--    uuid: Robokassa принимает только целое число.
create table if not exists public.premium_orders (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  plan text not null check (plan in ('month', 'year', 'forever')),
  amount_rub numeric(10, 2) not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'expired')),
  created_at timestamptz not null default now(),
  paid_at timestamptz null,
  -- Каким стал срок Премиума ПОСЛЕ зачисления этого заказа. Нужно для истории
  -- покупок и для разбора спорных случаев: по нему видно, что именно продлило
  -- срок и до какой даты.
  premium_until_after timestamptz null,
  platform text null,
  -- Только поля ответа Robokassa. Пароли и SignatureValue сюда НЕ кладём.
  robokassa_payload jsonb null
);

create index if not exists premium_orders_user_created_at_idx
  on public.premium_orders (user_id, created_at desc);

create index if not exists premium_orders_status_paid_at_idx
  on public.premium_orders (status, paid_at desc);

-- 4. Текущий Премиум пользователя. Одна строка на аккаунт.
create table if not exists public.user_premium (
  user_id uuid primary key,
  premium_until timestamptz null,
  is_forever boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 5. Лог действий админа: выдал / забрал Премиум.
create table if not exists public.premium_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  action text not null check (action in ('grant', 'revoke')),
  plan_or_months text null,
  comment text null,
  admin_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists premium_grants_user_created_at_idx
  on public.premium_grants (user_id, created_at desc);

-- RLS на всех пяти. Политик не добавляем СОЗНАТЕЛЬНО: это и есть запрет для
-- anon и authenticated. service_role RLS обходит.
alter table public.premium_settings enable row level security;
alter table public.podbor_usage     enable row level security;
alter table public.premium_orders   enable row level security;
alter table public.user_premium     enable row level security;
alter table public.premium_grants   enable row level security;

-- Привилегии. RLS без политик и так не пустит, но снимаем и GRANT: пустая
-- таблица под RLS и таблица без привилегий отвечают по-разному (403 против
-- пустого списка), и «нет привилегии» — более честный и более ранний отказ.
-- Сюда же попадает то, что RLS не покрывает в принципе (например, будущие
-- security definer функции, которым эти таблицы видны).
revoke all on public.premium_settings from anon, authenticated;
revoke all on public.podbor_usage     from anon, authenticated;
revoke all on public.premium_orders   from anon, authenticated;
revoke all on public.user_premium     from anon, authenticated;
revoke all on public.premium_grants   from anon, authenticated;

-- Последовательностей здесь НЕ трогаем. Напрашивался
-- `revoke all on all sequences in schema public` — но он бьёт по ВСЕМ
-- существующим последовательностям схемы, то есть меняет права у чужих таблиц.
-- Это ровно то, что запрещено («только новые таблицы»), и в проде так можно
-- сломать осознанно открытые вставки (analytics_events, parties,
-- party_messages). Колонкам `generated always as identity` привилегия на
-- последовательность не нужна: nextval для них вызывает сам Postgres.

-- ---------------------------------------------------------------------------
-- Аудит после прогона (CLAUDE.md, раздел 3.2 — проверять фактическим запросом,
-- а не текстом миграции).
--
-- 1) RLS включён, политик нет:
-- select c.relname, c.relrowsecurity, count(p.policyname) as policies
-- from pg_class c
-- left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
-- join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
-- where c.relname in ('premium_settings','podbor_usage','premium_orders','user_premium','premium_grants')
-- group by 1, 2;
--
-- 2) Привилегий у anon/authenticated нет:
-- select table_name, grantee, privilege_type
-- from information_schema.role_table_grants
-- where table_schema = 'public'
--   and grantee in ('anon','authenticated')
--   and table_name in ('premium_settings','podbor_usage','premium_orders','user_premium','premium_grants');
-- Ожидаемый результат обоих запросов: policies = 0 и пустая выдача привилегий.
