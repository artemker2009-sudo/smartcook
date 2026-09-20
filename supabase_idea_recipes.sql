-- ============================================================================
-- Раздел «Идеи», PR 2 — таблица каталога рецептов.
-- Запускать целиком в Supabase SQL Editor (New query → Run). Идемпотентно:
-- повторный Run безопасен и приводит набор политик к заявленному здесь.
--
-- ЧТО ЭТО. Каталог рецептов, который наполняем МЫ: черновики заливаются
-- JSON-импортом из админки, вычитываются руками и публикуются по одному.
-- Модель ровно та же, что у «Кухонных заметок» (supabase_articles_rls.sql).
--
-- Таблица public.recipes здесь НЕ ТРОГАЕТСЯ ВООБЩЕ. Это принципиально:
-- recipes — личная история поиска, где владение (session_id) и есть модель
-- доступа, а каталог публичен и владельца не имеет. Смешивать две разные
-- модели доступа в одной таблице — ровно тот корень, из которого выросли
-- инциденты №1–№3 в CLAUDE.md.
--
-- Модель доступа (CLAUDE.md, разделы 1–3.2):
--   * SELECT публичный ТОЛЬКО для опубликованных (is_published = true).
--     Это ОСОЗНАННОЕ РЕШЕНИЕ, а не значение по умолчанию: каталог — публичный
--     контент сайта без единого чувствительного поля (нет user_id, нет
--     session_id, автора у рецепта нет вовсе — подпись «Подборка SmartCook»
--     живёт в интерфейсе). Обоснование зафиксировано здесь, как требует
--     правило 1.
--   * Черновики (is_published = false) не видны ни анону, ни залогиненному.
--   * INSERT/UPDATE/DELETE-политик для anon/authenticated НЕТ НАМЕРЕННО.
--     Отсутствие политики и есть запрет. Пишет только service_role из
--     админ-роута /api/admin/ideas за requireAdminSession — то есть публикует
--     человек, а не запрос из браузера.
--   * Вторая линия обороны — привилегии: у anon/authenticated на таблице
--     остаётся ровно SELECT. Политика и привилегия — РАЗНЫЕ слои
--     (урок раздела 3.1: RLS не умеет то, что умеет grant, и наоборот).
--     Даже если однажды кто-то кликом в дашборде заведёт широкую политику
--     записи, писать всё равно будет нечем.
--
-- Откат: drop table if exists public.idea_recipes;
--        drop function if exists public.touch_idea_recipe();
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Таблица
-- ---------------------------------------------------------------------------
create table if not exists public.idea_recipes (
  id uuid primary key default gen_random_uuid(),

  -- ЧПУ-адрес /ideas/<slug> и одновременно стабильный ключ рецепта для импорта
  -- (повторный импорт того же slug — не дубль, а пропуск) и для анимации
  -- перехода картинки из карточки в экран рецепта.
  slug text not null unique,

  title text not null,
  -- Короткое описание: подпись в карточке ленты и og:description. НЕ тело
  -- рецепта — его заменяют ingredients + steps.
  description text not null,

  servings int not null,
  -- Общее время (подготовка + готовка) в минутах. Обязательное и ЧИСЛО:
  -- на нём стоит фильтр «до 30 минут», по тексту он работать не может.
  -- В recipes время лежит ещё и строкой («30 минут») — здесь этого нет
  -- намеренно, строку собирает интерфейс.
  cooking_time_minutes int not null,

  -- Форма ОДИН В ОДИН как recipes.detailed_ingredients: [{name, amount}].
  -- Благодаря этому экран рецепта каталога переиспользует RecipeMissingBlock
  -- и CookMode без единой правки.
  ingredients jsonb not null default '[]'::jsonb,
  -- Массив строк, как recipes.steps.
  steps jsonb not null default '[]'::jsonb,

  -- Приёмы пищи. Массив: сырники — и завтрак, и перекус, загонять такое в одно
  -- значение значит врать в фильтре.
  meals text[] not null,

  -- Главный продукт — ровно одно значение, это фильтр-переключатель.
  main_product text not null,

  -- Способ приготовления. В интерфейс пока НЕ выводится (принцип «меньше, но
  -- понятнее»), но при вычитке его проставить дешевле, чем потом возвращаться
  -- ко всем рецептам. Поэтому nullable.
  cook_method text,

  -- Свободные теги для блока «Похожие идеи».
  tags text[] not null default '{}',

  -- Аллергены ТОЛЬКО из словаря ниже. Свободный текст здесь запрещён: по нему
  -- фильтр «Подходит мне» работать не может — профиль вкуса человек набирает
  -- руками, и сопоставлять его надо со словарём, а не со строкой из головы
  -- редактора.
  allergens text[] not null default '{}',

  image_url text,
  -- Те же четыре значения, что у dish_cache.image_status — статусы фоновой
  -- генерации обязаны читаться одинаково в обеих системах.
  image_status text not null default 'none',
  -- Пропорции картинки. Лента — сетка разной высоты, и высота берётся отсюда;
  -- одна и та же картинка без кропа показывается и в карточке, и на экране
  -- рецепта (иначе переход между ними «прыгает»).
  image_aspect text not null default 'square',

  -- Публикация — только вручную после вычитки. Импорт и создание ВСЕГДА кладут
  -- false; переключает отдельная операция админ-роута.
  is_published boolean not null default false,
  published_at timestamptz,

  -- Ручной порядок в ленте: больше — выше. Лента дополнительно перемешивается
  -- на клиенте, но у редактора должна оставаться возможность поднять рецепт.
  sort_weight int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- 2. Ограничения — вторая линия обороны после валидации в роуте
-- ---------------------------------------------------------------------------
-- Всё, что проверяет админ-роут, проверяется здесь ещё раз. Причина та же, что
-- у user_shopping_lists: роут можно переписать, а база остаётся.
--
-- Отдельными ALTER'ами через do-блок (а не в create table) — чтобы файл
-- доезжал и на таблице, созданной прошлым Run'ом.

do $$
begin
  -- --- Тексты: длины ------------------------------------------------------
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_slug_len') then
    alter table public.idea_recipes
      add constraint idea_recipes_slug_len check (char_length(slug) between 1 and 200);
  end if;

  -- Латиница, цифры и дефисы — как у articles.slug. Кириллический slug в
  -- адресе превращается в percent-кодировку и в мессенджерах выглядит мусором.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_slug_fmt') then
    alter table public.idea_recipes
      add constraint idea_recipes_slug_fmt check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_title_len') then
    alter table public.idea_recipes
      add constraint idea_recipes_title_len check (char_length(title) between 1 and 200);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_description_len') then
    alter table public.idea_recipes
      add constraint idea_recipes_description_len check (char_length(description) between 1 and 400);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_image_url_len') then
    alter table public.idea_recipes
      add constraint idea_recipes_image_url_len
      check (image_url is null or char_length(image_url) between 1 and 2000);
  end if;

  -- --- Числа --------------------------------------------------------------
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_servings_range') then
    alter table public.idea_recipes
      add constraint idea_recipes_servings_range check (servings between 1 and 20);
  end if;

  -- Сутки сверху — это не «реалистичный рецепт», а потолок против опечатки
  -- в импорте (35 вместо 3.5 часа и т.п.).
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_time_range') then
    alter table public.idea_recipes
      add constraint idea_recipes_time_range check (cooking_time_minutes between 1 and 1440);
  end if;

  -- --- Словари ------------------------------------------------------------
  -- <@ — «подмножество». Пустой массив подмножество ЛЮБОГО, поэтому отдельно
  -- требуем хотя бы один приём пищи: рецепт без него выпал бы из всех фильтров
  -- разом и не показался бы нигде.
  --
  -- ТОЛЬКО cardinality, НЕ array_length. Это та же NULL-ловушка, что ниже у
  -- allergens, и она сработала бы молча: array_length('{}', 1) возвращает не 0,
  -- а NULL; «NULL between 1 and 4» — тоже NULL; а CHECK пропускает всё, что не
  -- FALSE. То есть пустой meals сохранился бы, и констрейнт выглядел бы
  -- работающим. cardinality('{}') = 0 → FALSE → отказ. Проба на это стоит в
  -- разделе 7 и падает, если кто-то вернёт array_length обратно.
  --
  -- array_position(meals, null) is null — «внутри нет NULL-элементов»
  -- (в JSON это ["завтрак", null]). Сам по себе <@ такой массив тоже отбивает,
  -- но правильность не должна держаться на тонкости чужого оператора.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_meals_dict') then
    alter table public.idea_recipes
      add constraint idea_recipes_meals_dict
      check (
        meals <@ array['завтрак', 'обед', 'ужин', 'перекус']::text[]
        and cardinality(meals) between 1 and 4
        and array_position(meals, null) is null
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_main_product_dict') then
    alter table public.idea_recipes
      add constraint idea_recipes_main_product_dict
      check (main_product in ('курица', 'мясо', 'рыба', 'без мяса'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_cook_method_dict') then
    alter table public.idea_recipes
      add constraint idea_recipes_cook_method_dict
      check (cook_method is null or cook_method in ('плита', 'духовка', 'без готовки', 'мультиварка'));
  end if;

  -- Словарь аллергенов. Пустой массив разрешён (блюдо без аллергенов), но
  -- слово не из словаря — нет: фильтр «Подходит мне» сопоставляет профиль
  -- вкуса человека ИМЕННО с этими значениями, и «молочное» вместо «молоко»
  -- тихо выключило бы защиту для всех рецептов с этой опечаткой.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_allergens_dict') then
    alter table public.idea_recipes
      add constraint idea_recipes_allergens_dict
      check (
        allergens <@ array[
          'молоко', 'яйца', 'глютен', 'орехи', 'арахис',
          'рыба', 'морепродукты', 'соя', 'кунжут', 'мёд'
        ]::text[]
        and array_position(allergens, null) is null
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_image_status_vals') then
    alter table public.idea_recipes
      add constraint idea_recipes_image_status_vals
      check (image_status in ('none', 'generating', 'ready', 'failed'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_image_aspect_vals') then
    alter table public.idea_recipes
      add constraint idea_recipes_image_aspect_vals
      check (image_aspect in ('square', 'portrait'));
  end if;

  -- --- Массивы и jsonb: размер -------------------------------------------
  -- ВАЖНО, чтобы приёмка не соврала: проверки ниже стерегут РАЗМЕР, а не
  -- форму. CHECK не умеет подзапросов, поэтому «каждый элемент ingredients —
  -- объект с непустым name» проверяет админ-роут (заход Б), а база держит
  -- потолок, мимо которого не зальёшь мегабайт.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_ingredients_shape') then
    alter table public.idea_recipes
      add constraint idea_recipes_ingredients_shape
      check (
        jsonb_typeof(ingredients) = 'array'
        and jsonb_array_length(ingredients) between 1 and 40
        and pg_column_size(ingredients) <= 16384
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_steps_shape') then
    alter table public.idea_recipes
      add constraint idea_recipes_steps_shape
      check (
        jsonb_typeof(steps) = 'array'
        and jsonb_array_length(steps) between 1 and 40
        and pg_column_size(steps) <= 16384
      );
  end if;

  -- cardinality, а не coalesce(array_length(...), 0): результат тот же, но
  -- читается как счётчик и не требует помнить, что у пустого массива
  -- array_length отдаёт NULL. Словаря у тегов нет, поэтому NULL-элементы здесь
  -- некому отбить — проверяем явно.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_tags_size') then
    alter table public.idea_recipes
      add constraint idea_recipes_tags_size
      check (
        cardinality(tags) <= 12
        and array_position(tags, null) is null
        and pg_column_size(tags) <= 1024
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_allergens_size') then
    alter table public.idea_recipes
      add constraint idea_recipes_allergens_size
      check (cardinality(allergens) <= 10);
  end if;

  -- Опубликованный рецепт обязан иметь дату публикации: по ней сортируется
  -- лента, и строка с NULL уехала бы в непредсказуемое место.
  --
  -- Обратное НЕ требуем: у снятого с публикации рецепта published_at
  -- СОХРАНЯЕТСЯ. Иначе «снял → поправил опечатку → вернул» поднимало бы
  -- рецепт на верх ленты как новый, а он там уже был.
  if not exists (select 1 from pg_constraint where conname = 'idea_recipes_published_at_set') then
    alter table public.idea_recipes
      add constraint idea_recipes_published_at_set
      check (is_published = false or published_at is not null);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. Индексы
-- ---------------------------------------------------------------------------
-- Лента: только опубликованные, ручной вес сверху, дальше свежие.
create index if not exists idea_recipes_published_idx
  on public.idea_recipes (sort_weight desc, published_at desc nulls last, created_at desc)
  where is_published = true;

-- Отдельный индекс по slug НЕ создаём: unique-констрейнт на slug уже создал
-- уникальный индекс, и второй был бы мёртвым грузом на каждой записи.
-- Проверить: select indexname from pg_indexes where tablename = 'idea_recipes';

-- Индексов по meals/tags/main_product тоже нет намеренно: каталог — сотня-две
-- строк, планировщик всё равно возьмёт seq scan, а GIN пришлось бы
-- поддерживать. Вернуться сюда, если каталог перевалит за тысячи.


-- ---------------------------------------------------------------------------
-- 4. updated_at ставит сервер
-- ---------------------------------------------------------------------------
-- Не клиент и не роут: часы машин врут, а по этому полю админка показывает,
-- что правили последним.
--
-- set search_path = '' — требование линтера Supabase (function_search_path_
-- mutable) и заодно правильная привычка: функция не должна зависеть от того,
-- какой search_path у вызывающего. Тело от этого не страдает — now() живёт в
-- pg_catalog, который подставляется всегда, а других объектов функция не
-- трогает.
create or replace function public.touch_idea_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists idea_recipes_touch on public.idea_recipes;
create trigger idea_recipes_touch
  before insert or update on public.idea_recipes
  for each row execute function public.touch_idea_recipe();


-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.idea_recipes enable row level security;

-- Правило 3.1: дропаем ПЕРЕЧИСЛЕНИЕМ ИЗ КАТАЛОГА, а не по именам. Имя старой
-- политики заранее неизвестно — политики, заведённые кликом в дашборде
-- Supabase, называются «Enable ... access for all users», и три чистки подряд
-- по ожидаемым именам их не трогали. После этого блока на таблице остаётся
-- ровно то, что создано ниже.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'idea_recipes'
  loop
    execute format('drop policy %I on public.idea_recipes', pol.policyname);
  end loop;
end $$;

-- ЕДИНСТВЕННАЯ политика. Публичное чтение опубликованного — осознанное
-- решение, обоснование в шапке файла.
create policy "idea_recipes_public_read_published"
on public.idea_recipes
for select
to anon, authenticated
using (is_published = true);

-- Политик INSERT/UPDATE/DELETE здесь нет и не должно появиться. Если такая
-- понадобится — это значит, что кто-то собрался писать каталог из браузера;
-- сначала перечитать инцидент №3 в CLAUDE.md.


-- ---------------------------------------------------------------------------
-- 6. Привилегии — второй, независимый слой
-- ---------------------------------------------------------------------------
-- Supabase по умолчанию выдаёт anon/authenticated полный набор привилегий
-- на новые таблицы public, а сдерживает их только RLS. Снимаем лишнее явно:
-- тогда запись невозможна ДВАЖДЫ — и политикой, и привилегией.
--
-- Снимаем ALL, а не перечисление INSERT/UPDATE/DELETE: кроме них в наборе
-- есть TRUNCATE, REFERENCES и TRIGGER, и после точечного revoke они остались
-- бы висеть — самопроверка ниже честно показала бы лишние строки там, где
-- ожидается только SELECT.
--
-- service_role не упоминаем: его привилегии не трогаем, админ-роут продолжает
-- писать как писал.
revoke all on public.idea_recipes from anon, authenticated;
grant select on public.idea_recipes to anon, authenticated;

comment on table public.idea_recipes is
  'Каталог рецептов раздела «Идеи». Публичное чтение ТОЛЬКО опубликованных '
  '(осознанное решение: публичный контент без чувствительных полей). Запись — '
  'только service_role из /api/admin/ideas. Чувствительных полей нет: ни '
  'user_id, ни session_id.';


-- ============================================================================
-- 7. Самопроверка — выполнится вместе с файлом.
-- ============================================================================

-- 7.1. Проба NULL-ловушки: пустой meals ОБЯЗАН быть отбит.
--
-- Зачем проба на констрейнт, который вот тут же и написан: первая версия этого
-- файла проверяла «array_length(meals, 1) between 1 and 4», и пустой массив
-- проходил молча — array_length('{}', 1) это NULL, сравнение даёт NULL, а CHECK
-- пропускает всё, кроме FALSE. Текст выглядел правильным, и отличить рабочий
-- констрейнт от нерабочего можно было только попыткой вставки. Она и стоит
-- здесь — чтобы правка в эту сторону упала при Run, а не всплыла на рецепте,
-- который не показывается ни в одном фильтре.
--
-- Строка не остаётся в таблице ни в одном исходе: при отказе её не было вовсе,
-- при (недопустимом) успехе raise откатывает вставку вместе с блоком.
do $$
begin
  begin
    insert into public.idea_recipes
      (slug, title, description, servings, cooking_time_minutes,
       ingredients, steps, meals, main_product)
    values
      ('proba-null-lovushka', 'Проба NULL-ловушки', 'Эта вставка обязана упасть',
       1, 5, '[{"name":"проверка","amount":"1"}]'::jsonb, '["Проверка"]'::jsonb,
       '{}'::text[], 'без мяса');

    -- Досюда доходить нельзя: строка с пустым meals сохранилась.
    raise exception
      'ПРОВАЛ САМОПРОВЕРКИ: рецепт с пустым meals вставился. Констрейнт '
      'idea_recipes_meals_dict не работает — проверьте, не вернулся ли в него '
      'array_length вместо cardinality (NULL-ловушка).';
  exception
    when check_violation then
      raise notice 'OK: пустой meals отбит констрейнтом (check_violation).';
  end;
end $$;

-- 7.2. RLS и число политик. Ожидаем: rls_enabled = true, policies = 1.
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'idea_recipes') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'idea_recipes';

-- Политики поимённо. Ожидаем ОДНУ строку: SELECT, {anon,authenticated},
-- qual = (is_published = true). Ни одной строки с ролью {public} быть не должно.
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'idea_recipes'
order by cmd, policyname;

-- Привилегии. Ожидаем у anon и authenticated ТОЛЬКО SELECT.
--
-- Грантополучателей НЕ фильтруем намеренно. Ровно на этом споткнулись с
-- recipes (раздел 3.1): привилегия может быть выдана не роли anon, а роли
-- PUBLIC — в неё входят все роли, и `revoke ... from anon` её не снимает.
-- Запрос с фильтром «grantee in (anon, authenticated)» такую строку не
-- покажет и соврёт, что всё закрыто. Смотрим ВЕСЬ список: если есть строка с
-- grantee = PUBLIC и чем-то кроме SELECT — лечится
-- `revoke insert, update, delete on public.idea_recipes from public;`
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'idea_recipes'
order by grantee, privilege_type;

-- Аудит по всей схеме (чек-лист CLAUDE.md): пишущие permissive-политики,
-- выданные роли public. Ожидаемый результат — только осознанно открытое:
-- INSERT в analytics_events, parties, party_messages. idea_recipes в выдаче
-- появиться НЕ должна.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and permissive = 'PERMISSIVE'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and 'public' = any (roles)
order by tablename, cmd, policyname;


-- ============================================================================
-- 8. ПРИЁМКА РАНТАЙМОМ (правило 3.2). Выполнить руками ПОСЛЕ Run.
--
-- Почему нельзя ограничиться текстом политики:
--   * на ПУСТОЙ таблице закрытая и открытая политика неотличимы — обе вернут
--     []. Поэтому шаг 0 создаёт две строки service_role'ом, а шаг 6 их удаляет;
--   * заблокированные PATCH и DELETE отдают 204 ровно так же, как успешные:
--     RLS просто не показал ни одной строки, менять было нечего. 204 — НЕ
--     доказательство. Каждая проба записи ниже заканчивается ЧТЕНИЕМ ОБРАТНО;
--   * анон и залогиненный проверяются ОТДЕЛЬНО. Дыра, через которую можно было
--     присвоить чужой рецепт, была видна только под залогиненным.
--
-- Подставить свои значения:
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"        # публичный ключ, он и так лежит в бандле
--   USER_JWT="<access_token>"  # из localStorage браузера, ключ sb-*-auth-token
--
-- service-role ключ в терминале НЕ нужен: всё, что требует обхода RLS
-- (шаги 0 и 6), делается в SQL Editor — он и так ходит service_role'ом.
--
-- ── Шаг 0. Две пробные строки (в SQL Editor, он ходит service_role'ом) ──────
--   insert into public.idea_recipes
--     (slug, title, description, servings, cooking_time_minutes,
--      ingredients, steps, meals, main_product, is_published, published_at)
--   values
--     ('proba-chernovik', 'Проба: черновик', 'Не должен быть виден снаружи',
--      2, 20, '[{"name":"яйцо","amount":"2 шт"}]'::jsonb, '["Проверка"]'::jsonb,
--      array['завтрак'], 'без мяса', false, null),
--     ('proba-opublikovan', 'Проба: опубликован', 'Виден всем', 2, 20,
--      '[{"name":"яйцо","amount":"2 шт"}]'::jsonb, '["Проверка"]'::jsonb,
--      array['завтрак'], 'без мяса', true, now());
--
-- ── Шаг 1. Аноним видит ТОЛЬКО опубликованный ──────────────────────────────
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug,title,is_published" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: ровно одна строка — proba-opublikovan. Черновика в выдаче НЕТ.
--
-- ── Шаг 2. Залогиненный тоже НЕ видит черновик ─────────────────────────────
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug,title&slug=eq.proba-chernovik" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   # ожидаем: []
--   # Если здесь вернулась строка — рядом живёт широкая политика, см. правило 3.1.
--
-- ── Шаг 3. Аноним не пишет ─────────────────────────────────────────────────
--   curl -s -X POST "$SB_URL/rest/v1/idea_recipes" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"slug":"vzlom","title":"Взлом","description":"x","servings":1,
--          "cooking_time_minutes":5,"ingredients":[{"name":"x","amount":"1"}],
--          "steps":["x"],"meals":["обед"],"main_product":"без мяса"}'
--   # ожидаем: 42501 (permission denied) либо отказ RLS. Затем убедиться:
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug&slug=eq.vzlom" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--
-- ── Шаг 4. Залогиненный не переписывает опубликованный рецепт ──────────────
--   curl -s -X PATCH "$SB_URL/rest/v1/idea_recipes?slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" -d '{"title":"Взломано"}'
--   # ответ может быть 204 — это НИЧЕГО не значит. Читаем обратно:
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug,title&slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: title по-прежнему «Проба: опубликован»
--
--   То же самое под анонимом — роль public включает и anon, и authenticated,
--   и проверять надо обе (правило 3.1):
--   curl -s -X PATCH "$SB_URL/rest/v1/idea_recipes?slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" -d '{"title":"Взломано анонимом"}'
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug,title&slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: title не изменился
--
-- ── Шаг 5. DELETE не удаляет — тоже с чтением обратно ──────────────────────
--   curl -s -X DELETE "$SB_URL/rest/v1/idea_recipes?slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT"
--   curl -s "$SB_URL/rest/v1/idea_recipes?select=slug&slug=eq.proba-opublikovan" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: строка на месте
--
-- ── Шаг 6. Убрать пробные строки (в SQL Editor) ────────────────────────────
--   delete from public.idea_recipes
--    where slug in ('proba-chernovik', 'proba-opublikovan', 'vzlom');
--   # и убедиться, что удалились:
--   select slug from public.idea_recipes
--    where slug in ('proba-chernovik', 'proba-opublikovan', 'vzlom');
--   # ожидаем: пусто
-- ============================================================================
