-- КЭШ РЕЦЕПТОВ И КАРТИНОК ДЛЯ ТЕКСТОВОГО ПОИСКА, ЭТАП 2 (аддитивно, за флагом).
--
-- ВАЖНО (урок #25): сначала прогнать эту миграцию в проде, ПОТОМ мержить код и
-- включать флаг RECIPE_CACHE. Пока таблиц нет — код с флагом off работает как
-- раньше; с флагом on без таблиц кэш деградирует мягко (см. lib/dishCache.ts:
-- любая ошибка чтения/записи кэша логируется и не ломает генерацию).
--
-- Что делает миграция:
--   1) dish_cache — одна строка на нормализованный запрос (блюдо), + метаданные
--      картинки (одна картинка на блюдо, варианты рецепта делят её).
--   2) dish_cache_recipes — варианты рецепта для блюда (вариант 1, 2, ...).
--   3) RLS: SELECT публичный (кэш осознанно публичный, см. ниже). Запись —
--      только сервер через service_role (политик insert/update/delete НЕТ).
--   4) image_gen_counter + reserve_image_generation() — глобальный суточный
--      «стоп-кран» расходов на генерацию картинок.

-- ── 1. dish_cache ─────────────────────────────────────────────────────────────
-- ОСОЗНАННОЕ РЕШЕНИЕ: содержимое dish_cache ПУБЛИЧНОЕ на чтение. Здесь лежат
-- только блюда и их картинки — БЕЗ привязки к людям (нет session_id/user_id,
-- нет персональных рецептов: кэш заполняется ТОЛЬКО когда у пользователя пустой
-- профиль вкуса, см. lib/dishCache.ts). Персональные рецепты (с учётом аллергий/
-- нелюбимого) в кэш не попадают by design. Поэтому публичное чтение безопасно и
-- позволяет отдавать cache hit максимально быстро (в т.ч. из SSR при желании).
create table if not exists public.dish_cache (
  id            bigint generated always as identity primary key,
  -- Нормализованный ключ запроса (см. lib/queryNormalize.ts): trim, lower,
  -- схлопнутые пробелы, без пунктуации/эмодзи, ограниченная длина.
  query_key     text not null unique,
  -- Человекочитаемое название блюда (как показал ИИ на первом запросе).
  display_title text,
  -- Публичная ссылка на картинку блюда (бакет recipe-images, префикс dish-cache/).
  -- null пока не сгенерирована. Одна картинка на всё блюдо (все варианты).
  image_url     text,
  -- Статус генерации картинки: none|generating|ready|failed.
  image_status  text not null default 'none',
  created_at    timestamptz not null default now(),

  constraint dish_cache_query_key_len check (char_length(query_key) between 1 and 200),
  constraint dish_cache_image_status_vals
    check (image_status in ('none', 'generating', 'ready', 'failed'))
);

comment on table public.dish_cache is
  'Публичный кэш блюд для текстового поиска типа B (название блюда). Заполняется '
  'только для пользователей БЕЗ профиля вкуса. Пишет только сервер (service_role).';

-- ── 2. dish_cache_recipes ─────────────────────────────────────────────────────
-- Варианты рецепта для блюда. variant_index: 1 = первый показанный рецепт,
-- 2, 3, ... = «подобрать другой рецепт». Явные поля рецепта — как в recipes,
-- чтобы cache hit отдавался без обращения к OpenAI и рендерился 1-в-1.
create table if not exists public.dish_cache_recipes (
  id                    bigint generated always as identity primary key,
  dish_cache_id         bigint not null references public.dish_cache(id) on delete cascade,
  variant_index         int not null,

  title                 text not null,
  description           text,
  time                  text,
  cooking_time_minutes  int,
  calories              text,
  steps                 jsonb not null default '[]'::jsonb,
  missing_ingredients   jsonb not null default '[]'::jsonb,
  detailed_ingredients  jsonb not null default '[]'::jsonb,
  ingredients           jsonb not null default '[]'::jsonb,
  estimated_cost        numeric,
  delivery_cost         numeric,
  budget_tier           int,
  created_at            timestamptz not null default now(),

  constraint dish_cache_recipes_variant_uniq unique (dish_cache_id, variant_index),
  constraint dish_cache_recipes_variant_pos check (variant_index >= 1),
  constraint dish_cache_recipes_title_len check (char_length(title) between 1 and 200)
);

create index if not exists dish_cache_recipes_cache_id_idx
  on public.dish_cache_recipes (dish_cache_id, variant_index);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
-- SELECT публичный (кэш публичный, см. комментарий к таблице). INSERT/UPDATE/
-- DELETE политик НЕ создаём — их отсутствие и есть запрет для anon/authenticated
-- (RLS включён). Пишет только сервер сервисным ключом (обходит RLS).
alter table public.dish_cache enable row level security;
alter table public.dish_cache_recipes enable row level security;

drop policy if exists "dish_cache public read" on public.dish_cache;
create policy "dish_cache public read"
  on public.dish_cache for select
  to anon, authenticated
  using (true);

drop policy if exists "dish_cache_recipes public read" on public.dish_cache_recipes;
create policy "dish_cache_recipes public read"
  on public.dish_cache_recipes for select
  to anon, authenticated
  using (true);

-- ── 4. Суточный «стоп-кран» на генерацию картинок ─────────────────────────────
-- Глобальный счётчик генераций за сутки (UTC). Только сервер (service_role).
-- RLS включён без политик = полный запрет для anon/authenticated.
create table if not exists public.image_gen_counter (
  day   date primary key,
  count int not null default 0
);

alter table public.image_gen_counter enable row level security;
-- Осознанно без политик: доступ только через service_role.

-- Атомарно резервирует 1 слот генерации картинки на сегодня, если лимит не
-- превышен. Возвращает true (можно генерировать, слот зарезервирован) или false
-- (лимит исчерпан, генерировать нельзя). security definer + row lock (for update)
-- защищают от гонок при параллельных фоновых генерациях.
create or replace function public.reserve_image_generation(p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'utc')::date;
  current_count int;
begin
  insert into public.image_gen_counter(day, count)
  values (today, 0)
  on conflict (day) do nothing;

  select count into current_count
    from public.image_gen_counter
   where day = today
     for update;

  if current_count >= p_limit then
    return false;
  end if;

  update public.image_gen_counter
     set count = count + 1
   where day = today;

  return true;
end;
$$;

-- Проверки после прогона:
--   select * from public.dish_cache limit 1;                 -- таблица есть
--   select * from public.dish_cache_recipes limit 1;         -- таблица есть
--   select public.reserve_image_generation(100);             -- true, слот занят
--   select * from public.image_gen_counter;                  -- count = 1 на сегодня
--   -- anon SELECT dish_cache должен работать, INSERT — отказ RLS (см. приёмку).
