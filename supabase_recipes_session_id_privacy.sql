-- ЗАКРЫТИЕ УТЕЧКИ recipes.session_id (PR 1 из двух).
--
-- ПРОБЛЕМА. Политика "Public read access to recipes"
-- (supabase_recipes_social_rls.sql) открывает SELECT для anon/authenticated на
-- ВСЕ колонки, включая session_id. Анон-ключ публичный (зашит в клиентский
-- бандл), поэтому один запрос
--     GET /rest/v1/recipes?select=session_id
-- выдаёт список ВСЕХ гостевых идентификаторов устройств. А session_id — это по
-- факту токен владения рецептом (так и записано в app/recipe/[id]/page.tsx по
-- итогам инцидента №2): кто знает чужой session_id, тот знает, чьи это рецепты.
--
-- Отдельно это плохо, а вместе с будущим роутом переноса гостевых рецептов в
-- аккаунт (PR 2) — прямое оружие: любой зарегистрировавшийся мог бы выкачать
-- все гостевые id и одним запросом перетащить чужую историю себе, а у настоящих
-- владельцев она бы исчезла. Поэтому утечка закрывается ПЕРВОЙ, до переноса.
--
-- РЕШЕНИЕ. Колонка session_id перестаёт быть читаемой ролями anon/authenticated.
-- Чтение своей истории («Мои рецепты») переезжает на security definer функцию
-- recipes_for_session(p_session), которая фильтрует по session_id ВНУТРИ себя и
-- наружу его не отдаёт. Модель доступа не меняется: кто знает свой id — видит
-- свои рецепты; изменилось только то, что чужие id больше неоткуда взять.
--
-- ВАЖНО ПРО ПОРЯДОК ВНИЗУ. Привилегия SELECT на ТАБЛИЦУ перекрывает
-- поколоночные: пока у роли есть table-level GRANT SELECT, revoke на одну
-- колонку не даст ничего. Поэтому сначала снимается табличный SELECT целиком,
-- и только потом выдаётся поколоночный — на все колонки, КРОМЕ session_id.
--
-- Запускать целиком в Supabase SQL Editor. Откат — в самом низу файла.
--
-- ПОСЛЕ ПРОГОНА обязательна рантайм-приёмка (чтение кода не считается):
--   1) anon: select=session_id  -> отказ (42501);
--   2) anon: select обычных колонок -> 200;
--   3) anon: INSERT рецепта под гостевым id -> проходит (WITH CHECK
--      INSERT-политики ссылается на session_id, и надо убедиться, что
--      поколоночная привилегия его не сломала);
--   4) залогиненный: INSERT под своим uid -> проходит;
--   5) rpc recipes_for_session -> отдаёт свои строки и НЕ содержит session_id.


-- ============================================================================
-- 1) Чтение своей истории без выдачи session_id.
--
-- security definer: функция выполняется с правами владельца, поэтому ей
-- поколоночный запрет не мешает — а вызывающему она возвращает ровно те
-- колонки, что перечислены в returns table (session_id среди них нет).
--
-- Список колонок = все реальные колонки public.recipes минус session_id.
-- Ровно 14 штук; сверено со схемой прода, а не с TypeScript-типом (в
-- lib/types.ts есть поля, которых в таблице нет: custom_title, user_id,
-- user_name, user_avatar, comments_count, estimated_cost, delivery_cost,
-- budget_tier — PostgREST на несуществующую колонку отдаёт 400).
--
-- stable, не volatile: чтение без побочных эффектов.
-- Жёсткий потолок в 500 строк — предохранитель, а не бизнес-правило: история
-- одного устройства столько не набирает (в проде максимум 13 строк на id).
-- ============================================================================
create or replace function public.recipes_for_session(p_session text)
returns table (
  id bigint,
  created_at timestamptz,
  title text,
  ingredients jsonb,
  steps jsonb,
  "time" text,
  detailed_ingredients jsonb,
  calories text,
  is_favorite boolean,
  missing_ingredients text[],
  description text,
  likes_count integer,
  cooking_time_minutes integer,
  image_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    r.id,
    r.created_at,
    r.title,
    r.ingredients,
    r.steps,
    r."time",
    r.detailed_ingredients,
    r.calories,
    r.is_favorite,
    r.missing_ingredients,
    r.description,
    r.likes_count,
    r.cooking_time_minutes,
    r.image_url
  from public.recipes r
  -- Пустой/NULL идентификатор не должен превращаться в выдачу чего-либо.
  where p_session is not null
    and length(p_session) > 0
    and r.session_id = p_session
  order by r.created_at desc
  limit 500;
$$;

revoke all on function public.recipes_for_session(text) from public;
grant execute on function public.recipes_for_session(text) to anon, authenticated;


-- ============================================================================
-- 2) Снятие табличного SELECT и выдача поколоночного без session_id.
--
-- RLS-политика "Public read access to recipes" остаётся как была (using true) —
-- она про СТРОКИ. Колонки — это привилегии, отдельный механизм; RLS скрыть
-- колонку не умеет в принципе, поэтому и делается через grant.
--
-- Перечисленные колонки покрывают всех реальных читателей под anon-ключом:
--   * app/recipe/[id]/page.tsx  — RECIPE_FIELDS (id,title,description,time,
--     cooking_time_minutes,calories,image_url,steps,detailed_ingredients,
--     missing_ingredients);
--   * app/sitemap.ts — select id,created_at,image_url + фильтры по title и
--     steps (фильтр по колонке тоже требует на неё SELECT — они в списке);
--   * клиент (SearchApp/ProfileApp) — явные списки колонок после этого PR.
-- service_role здесь не упоминается намеренно: его привилегии не трогаем,
-- серверные роуты (/api/favorite, /api/account/delete, админка) продолжают
-- видеть session_id и работать как раньше.
-- ============================================================================
revoke select on public.recipes from anon, authenticated;

grant select (
  id,
  created_at,
  title,
  ingredients,
  steps,
  "time",
  detailed_ingredients,
  calories,
  is_favorite,
  missing_ingredients,
  description,
  likes_count,
  cooking_time_minutes,
  image_url
) on public.recipes to anon, authenticated;


-- ============================================================================
-- 3) Проверка прямо в редакторе (до приёмки curl'ом).
-- Ожидаем: *_session_id = false у обеих ролей, *_title = true.
--
-- Если session_id всё ещё true — привилегия выдана не роли anon/authenticated,
-- а роли PUBLIC (в неё входят все роли, и revoke с конкретной роли её не
-- снимает). Следующий запрос это покажет: смотрите, есть ли в grantee строка
-- PUBLIC. Лечится `revoke select on public.recipes from public;` ПЕРЕД
-- поколоночным grant'ом — но сначала посмотрите на список, вслепую снимать
-- привилегии у PUBLIC не надо.
-- ============================================================================
select
  has_column_privilege('anon',          'public.recipes', 'session_id', 'select') as anon_session_id,
  has_column_privilege('authenticated', 'public.recipes', 'session_id', 'select') as auth_session_id,
  has_column_privilege('anon',          'public.recipes', 'title',      'select') as anon_title,
  has_column_privilege('authenticated', 'public.recipes', 'title',      'select') as auth_title;

select grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'recipes' and privilege_type = 'SELECT'
order by grantee;


-- ============================================================================
-- ОТКАТ (если рантайм-приёмка что-то сломала — выполнить эти две строки,
-- прод вернётся ровно в текущее состояние; функцию можно не удалять, она
-- ничего не ломает, но для чистоты приведена третьей строкой).
-- ============================================================================
-- grant select on public.recipes to anon, authenticated;
-- drop function if exists public.recipes_for_session(text);
