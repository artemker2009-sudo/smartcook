-- ЛЕГАСИ-ПОЛИТИКА "Enable all access for all users" НА recipe_likes.
-- Последний пункт из аудита схемы (см. запрос 4 в
-- supabase_recipes_update_policy_fix.sql) — всё остальное там либо закрыто,
-- либо открыто по замыслу.
--
-- ЧТО ОБНАРУЖЕНО. На таблице висит permissive-политика `ALL` для роли
-- `{public}` с `qual = true` и `with_check = true`, и ни одной restrictive.
-- Проверено на боевой базе 2026-09-19 (строка создана и тут же удалена):
--   * anon INSERT лайка от имени ЧУЖОГО реального аккаунта -> HTTP 201;
--   * anon DELETE строк по recipe_id -> HTTP 204, строки удалены.
-- То есть накрутить и снести лайки может кто угодно с публичным анон-ключом,
-- причём от чужого имени. Строгие политики "Insert own recipe_likes" и
-- "Delete own recipe_likes" рядом не значат ничего: permissive складываются по
-- ИЛИ. Тот же шаблон, что уже чинили на recipes в INSERT и UPDATE.
--
-- ПОЧЕМУ ЗАКРЫВАЕМ ПОЛНОСТЬЮ, А НЕ «ПРАВИЛЬНЫМИ» ПОЛИТИКАМИ.
-- Таблица сейчас ПУСТА (0 строк) и из клиента не читается и не пишется вовсе:
-- единственный код, который к ней обращается, — app/api/like/route.ts, а он
-- ходит под service_role, которому RLS не писан. Счётчик, который видит
-- пользователь, лежит в recipes.likes_count — отдельной колонке публичной
-- таблицы, и от recipe_likes не зависит.
-- Значит давать ролям anon/authenticated хоть какой-то доступ сейчас незачем.
-- Это ровно тот же вывод, что уже сделан для daily_recipes в
-- supabase_recipes_social_rls.sql: «политик не добавляем намеренно».
-- Меньше политик — меньше поверхности, на которой снова разойдутся замысел и
-- факт.
--
-- ЕСЛИ ЛАЙКИ РЕЦЕПТОВ КОГДА-НИБУДЬ ВКЛЮЧАТ В ИНТЕРФЕЙСЕ — не возвращайте
-- широкую политику, а раскомментируйте блок «АЛЬТЕРНАТИВА» в самом низу: он
-- даёт публичное чтение и запись строго от своего имени, плюс restrictive-
-- страховку, которая переживёт случайно созданную из дашборда широкую политику.


-- ПРОГНАН В ПРОДЕ 2026-09-19. Проверено ТРЕМЯ операциями от анона, на реальной
-- строке (создана service_role и тут же удалена):
--   * INSERT лайка от чужого имени -> 42501 «new row violates RLS policy»;
--   * SELECT существующей строки    -> [] (строка есть, но не видна);
--   * DELETE                        -> 204, НО строка жива.
-- Две последние — ровно тот случай, когда код ответа врёт: закрытые SELECT и
-- DELETE при RLS выглядят как успех. Проверять надо чтением значения.
-- Осторожно с пустой таблицей: на ней закрытая и открытая политика неотличимы,
-- поэтому строка для пробы обязательна.
--
-- ============================================================================
-- 0) ДО. Сохраните вывод.
-- ============================================================================
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'recipe_likes'
order by cmd, policyname;


-- ============================================================================
-- 1) Снос ВСЕХ политик recipe_likes через каталог, а не по именам.
--    По именам мы спотыкались трижды подряд: старая политика всегда
--    называлась не так, как ожидал файл-«исправление».
-- ============================================================================
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'recipe_likes'
  loop
    execute format('drop policy %I on public.recipe_likes', pol.policyname);
    raise notice 'dropped policy: %', pol.policyname;
  end loop;
end $$;


-- ============================================================================
-- 2) RLS остаётся включённым, политик нет -> anon и authenticated не могут
--    ни читать, ни писать. service_role (серверные роуты) не затронут.
-- ============================================================================
alter table public.recipe_likes enable row level security;


-- ============================================================================
-- 3) ПОСЛЕ. Ожидаем ПУСТО.
-- ============================================================================
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'recipe_likes'
order by cmd, policyname;

-- И контрольный прогон аудита всей схемы: recipe_likes должен из него исчезнуть,
-- а остаться только то, что открыто по замыслу (INSERT в analytics_events,
-- parties, party_messages).
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
-- АЛЬТЕРНАТИВА — если лайки рецептов включают в интерфейсе и клиенту нужен
-- прямой доступ. Раскомментировать ЦЕЛИКОМ вместо шага 2.
--
-- Restrictive-политики здесь не дубликат permissive, а страховка: они
-- действуют по И, поэтому даже случайно созданная из дашборда широкая
-- permissive-политика не откроет запись от чужого имени. Именно этой страховки
-- не хватало recipes — там restrictive покрывал только anon, и authenticated
-- проходил насквозь.
-- `for all` для restrictive использовать НЕЛЬЗЯ: оно распространится и на
-- SELECT и закроет публичное чтение счётчиков.
-- ============================================================================
-- create policy "Public read access to recipe_likes"
-- on public.recipe_likes for select to anon, authenticated using (true);
--
-- create policy "Insert own recipe_likes"
-- on public.recipe_likes for insert to authenticated
-- with check (auth.uid()::text = user_id);
--
-- create policy "Delete own recipe_likes"
-- on public.recipe_likes for delete to authenticated
-- using (auth.uid()::text = user_id);
--
-- create policy "recipe_likes insert owner only"
-- on public.recipe_likes as restrictive for insert to anon, authenticated
-- with check (auth.uid() is not null and auth.uid()::text = user_id);
--
-- create policy "recipe_likes delete owner only"
-- on public.recipe_likes as restrictive for delete to anon, authenticated
-- using (auth.uid() is not null and auth.uid()::text = user_id);
--
-- -- Лайк не редактируется: он либо есть, либо его нет.
-- create policy "recipe_likes no updates"
-- on public.recipe_likes as restrictive for update to anon, authenticated
-- using (false);


-- ============================================================================
-- ОТКАТ (вернуть дырявое поведение — только если что-то сломалось и нужно
-- время разобраться; это снова открывает накрутку и удаление чужих лайков):
--   create policy "Enable all access for all users" on public.recipe_likes
--     for all to public using (true) with check (true);
-- ============================================================================
