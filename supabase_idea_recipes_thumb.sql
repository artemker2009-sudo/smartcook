-- idea_recipes.thumb_url — миниатюра 540 px для карточки ленты «Идеи».
--
-- ПРОГНАТЬ ДО МЕРЖА PR с миниатюрами. Лента читает thumb_url явным списком
-- колонок; без колонки PostgREST ответит 400, и (после PR #147) сборка превью
-- с включёнными «Идеями» упадёт, а не выкатит пустую ленту.
--
-- ЧТО ДЕЛАЕТ: одна новая nullable-колонка и CHECK длины — как у image_url.
-- Заполняет её СЕРВЕР: генерация картинки (lib/recipeImage.ts) пишет
-- image_url и thumb_url одной записью, для уже существующих картинок —
-- скрипт scripts/backfill-idea-thumbs.ts. Импорт каталога её не задаёт
-- (thumb_url в SERVER_OWNED, lib/ideaImport.ts).
--
-- ПОЛИТИКИ И ПРИВИЛЕГИИ НЕ ТРОГАЕМ. Чтение таблицы выдано табличным
-- grant select anon, authenticated, а единственная политика пускает только
-- опубликованные строки — новая колонка читается ровно по тем же правилам,
-- что и image_url. Самопроверка в конце это подтверждает и роняет прогон,
-- если в базе вдруг лежит не то, что описано здесь (CLAUDE.md, п. 3.1).
--
-- ОТКАТ: alter table public.idea_recipes drop column thumb_url;
--        (файлы миниатюр в бакете остаются — удалять из storage мы не можем)

alter table public.idea_recipes add column if not exists thumb_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_thumb_url_len') then
    alter table public.idea_recipes
      add constraint idea_recipes_thumb_url_len
      check (thumb_url is null or char_length(thumb_url) between 1 and 2000);
  end if;
end $$;

comment on column public.idea_recipes.thumb_url is
  'Миниатюра 540 px для карточки ленты (ideas/thumb/<slug>-<метка>.webp). '
  'Задаёт сервер; null — ещё не досоздана, карточка показывает image_url.';

-- ── Самопроверка ──────────────────────────────────────────────────────────
-- Роняет прогон с понятным текстом, если что-то не так. Ничего не меняет.
do $$
declare
  n_policies int;
  policy_names text;
  extra_table_privs text;
  extra_column_privs text;
  missing_select text;
begin
  -- 1. Колонка на месте и она text.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'idea_recipes'
      and column_name = 'thumb_url' and data_type = 'text'
  ) then
    raise exception 'thumb_url не создана или не text';
  end if;

  -- 2. Политика на таблице по-прежнему ОДНА.
  select count(*), string_agg(policyname || ' (' || cmd || ')', ', ')
    into n_policies, policy_names
  from pg_policies
  where schemaname = 'public' and tablename = 'idea_recipes';
  if n_policies <> 1 then
    raise exception 'на idea_recipes ожидалась одна политика, найдено %: %', n_policies, policy_names;
  end if;

  -- 3. У anon, authenticated и PUBLIC — только SELECT, на уровне таблицы…
  select string_agg(grantee || ':' || privilege_type, ', ')
    into extra_table_privs
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'idea_recipes'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type <> 'SELECT';
  if extra_table_privs is not null then
    raise exception 'лишние табличные привилегии: %', extra_table_privs;
  end if;

  -- …и на уровне колонок (поколоночный UPDATE табличная проверка не видит).
  select string_agg(distinct grantee || ':' || privilege_type || '(' || column_name || ')', ', ')
    into extra_column_privs
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'idea_recipes'
    and grantee in ('anon', 'authenticated', 'PUBLIC')
    and privilege_type <> 'SELECT';
  if extra_column_privs is not null then
    raise exception 'лишние поколоночные привилегии: %', extra_column_privs;
  end if;

  -- 4. И SELECT у anon и authenticated есть — иначе лента не прочитает колонку.
  select string_agg(r, ', ') into missing_select
  from unnest(array['anon', 'authenticated']) as r
  where not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'idea_recipes'
      and grantee = r and privilege_type = 'SELECT'
  );
  if missing_select is not null then
    raise exception 'нет SELECT у: %', missing_select;
  end if;

  raise notice 'OK: thumb_url создана; политика одна (%); у anon/authenticated только SELECT', policy_names;
end $$;

-- Для глаз: что получилось.
select policyname, cmd, permissive, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'idea_recipes';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'idea_recipes'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;
