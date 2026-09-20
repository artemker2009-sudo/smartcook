-- ============================================================================
-- Каталог «Идеи»: поле family — семейство блюда.
-- Запускать целиком в Supabase SQL Editor (New query → Run). Идемпотентно.
--
-- ЗАЧЕМ. «Сырники классические» и «Сырники с бананом» — РАЗНЫЕ рецепты, но
-- одно блюдо. Без общего признака лента покажет их подряд как два почти
-- одинаковых кирпича, а на экране рецепта нечем собрать «Другие варианты».
-- family — это ключ семейства (syrniki), а не второй slug: он не уникален,
-- и рецептов с одним family может быть сколько угодно.
--
-- Сейчас поле ТОЛЬКО ХРАНИТСЯ: импорт, форма правки и список админки его
-- знают, но ни лента (PR 3), ни экран рецепта (PR 4) ещё не написаны.
--
-- ПОЛИТИКИ И ПРИВИЛЕГИИ НЕ ТРОГАЕМ. Это аддитивная nullable-колонка, она
-- наследует всё от таблицы: публичное чтение опубликованного, запись только
-- service_role. Самопроверка в конце файла подтверждает, что политика
-- по-прежнему ровно одна — чтобы прогон этой миграции не оказался тем самым
-- местом, где рядом завелась лишняя (инцидент №3, раздел 3.1 CLAUDE.md).
--
-- Откат: alter table public.idea_recipes drop column if exists family;
-- ============================================================================

alter table public.idea_recipes
  add column if not exists family text;

comment on column public.idea_recipes.family is
  'Семейство блюда: «Сырники классические» и «Сырники с бананом» — один family '
  '(syrniki). NULL = рецепт сам по себе. Не уникально. Формат как у slug.';

-- Формат тот же, что у slug: латиница в нижнем регистре, цифры и дефисы.
-- Причина та же — значение попадёт в адреса и параметры фильтров, а
-- кириллица там превращается в percent-кодировку.
--
-- NULL разрешён: у большинства рецептов семейства нет. Обратите внимание на
-- `family is null or ...` — без этой ветки выражение на NULL дало бы NULL, и
-- CHECK пропустил бы что угодно (ровно та ловушка, что была с meals).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_family_fmt') then
    alter table public.idea_recipes
      add constraint idea_recipes_family_fmt
      check (
        family is null
        or (
          char_length(family) between 1 and 60
          and family ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        )
      );
  end if;
end $$;

-- Индекса нет намеренно: каталог — сотня-две строк, «Другие варианты»
-- отбираются в памяти из уже прочитанной ленты.


-- ============================================================================
-- Самопроверка — выполнится вместе с файлом.
-- ============================================================================

-- 1. Колонка появилась и допускает NULL.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'idea_recipes' and column_name = 'family';

-- 2. Констрейнт на месте и ловит мусор. Обе вставки ОБЯЗАНЫ упасть:
--    кириллица и пустая строка. Строки в таблице не остаются ни в одном
--    исходе — при отказе их не было, при (недопустимом) успехе raise
--    откатывает вставку вместе с блоком.
do $$
declare
  bad text;
begin
  foreach bad in array array['сырники', '']
  loop
    begin
      insert into public.idea_recipes
        (slug, title, description, servings, cooking_time_minutes,
         ingredients, steps, meals, main_product, family)
      values
        ('proba-family-' || md5(bad), 'Проба family', 'Эта вставка обязана упасть',
         1, 5, '[{"name":"проверка","amount":"1"}]'::jsonb, '["Проверка"]'::jsonb,
         array['завтрак'], 'без мяса', bad);

      raise exception
        'ПРОВАЛ САМОПРОВЕРКИ: family = %L принят. Констрейнт '
        'idea_recipes_family_fmt не работает.', bad;
    exception
      when check_violation then
        raise notice 'OK: family = %L отбит констрейнтом.', bad;
    end;
  end loop;
end $$;

-- 3. ГЛАВНОЕ: политика на таблице по-прежнему ОДНА — публичное чтение
--    опубликованного. Ожидаем policies = 1 и ни одной строки с ролью {public}.
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'idea_recipes') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'idea_recipes';

select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'idea_recipes'
order by cmd, policyname;

-- 4. Привилегии не поехали: у anon и authenticated только SELECT.
--    Грантополучателей не фильтруем — привилегия могла быть выдана роли
--    PUBLIC, и фильтр по anon её бы не показал (раздел 3.1).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'idea_recipes'
order by grantee, privilege_type;
