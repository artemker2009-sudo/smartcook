-- ЛЕГАСИ-ПОЛИТИКА "Enable update access for all users" НА recipes.
-- СРОЧНО: это открытая кража и порча чужих рецептов прямо сейчас.
--
-- КАК НАШЛОСЬ. Вывод диагностики из supabase_recipes_insert_policy_fix.sql
-- показал на recipes 8 политик, среди них:
--     Enable update access for all users | UPDATE | PERMISSIVE | {public}
-- Роль public включает в себя authenticated. Ограничитель
-- "Block anon recipe updates" — RESTRICTIVE и только для {anon}, поэтому
-- залогиненного он не трогает, а permissive-политики складываются по ИЛИ.
-- Итог: строгая "Update own recipes" (auth.uid()::text = session_id) не значит
-- ничего.
--
-- ПРОВЕРЕНО НА БОЕВОЙ БАЗЕ 2026-09-19 (на собственной временной строке и
-- временном аккаунте, оба удалены):
--   A) чужой залогиненный PATCH title чужой строки -> 204, заголовок переписан;
--   B) чужой залогиненный PATCH session_id на свой -> 204, строка украдена,
--      прежний владелец её больше не видит.
-- Регистрация свободная, id рецептов — последовательные целые, так что перебор
-- тривиален и знать session_id не требуется. Это ровно инцидент №2 (массовая
-- перезапись title), который закрыли не до конца: тогда добавили правильные
-- политики, но не убрали старую широкую.
--
-- ПОЧЕМУ ЭТО ВАЖНЕЕ ВСЕГО ОСТАЛЬНОГО. Пока политика жива:
--   * закрытие session_id (PR 1) от кражи не защищает — воровать можно по id;
--   * аккуратный claim на service_role в PR 2 бессмысленен: переписать
--     владельца можно напрямую из браузера;
--   * красная линия «ни один рецепт не теряется» нарушается уже сегодня.
--
-- Клиент рецепты НЕ обновляет: /api/favorite, /api/like и генерация картинок
-- ходят под service_role (RLS их не касается), в SearchApp/ProfileApp есть
-- только select и insert. Поэтому снос широкой UPDATE-политики ничего не ломает.


-- ПРОГНАН В ПРОДЕ 2026-09-19. Результат перепроверен теми же запросами, что
-- нашли дыру: обе атаки теперь отдают 204 при НУЛЕ изменённых строк —
--   A) чужой залогиненный PATCH title  -> title остался __probe_victim__;
--   B) чужой залогиненный PATCH session_id -> владелец остался user_victimprobe.
-- Важно: заблокированная RLS запись отдаёт тот же 204, что и успешная, поэтому
-- проверять надо ЧТЕНИЕМ значения, а не кодом ответа.
-- Аудит (запрос 4) после прогона: recipes из выдачи исчез.
--
-- ============================================================================
-- 0) ДО. Полный снимок политик recipes — сохраните вывод.
-- ============================================================================
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'recipes'
order by cmd, policyname;


-- ============================================================================
-- 1) Снос ВСЕХ UPDATE-политик через каталог (не по именам — ровно на этом
--    спотыкались дважды).
-- ============================================================================
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'recipes' and cmd = 'UPDATE'
  loop
    execute format('drop policy %I on public.recipes', pol.policyname);
    raise notice 'dropped update policy: %', pol.policyname;
  end loop;
end $$;


-- ============================================================================
-- 2) Правильная пара (смысл — из supabase_recipes_social_rls.sql):
--    владелец-аккаунт правит только свою строку и не может отдать её другому
--    (with check не даёт переписать session_id на чужой), гостям UPDATE
--    запрещён полностью.
-- ============================================================================
create policy "Update own recipes"
on public.recipes
for update
to authenticated
using (auth.uid()::text = session_id)
with check (auth.uid()::text = session_id);

create policy "Block anon recipe updates"
on public.recipes
as restrictive
for update
to anon
using (false);


-- ============================================================================
-- 3) ПОСЛЕ. Ожидаем по UPDATE ровно две строки и НИ ОДНОЙ с ролью {public}.
-- ============================================================================
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'recipes'
order by cmd, policyname;


-- ============================================================================
-- 4) АУДИТ ОСТАЛЬНЫХ ТАБЛИЦ.
-- "Enable <что-то> access for all users" — это имя по умолчанию из дашборда
-- Supabase. Раз такие политики завелись на recipes, они могли завестись и на
-- других таблицах тем же способом. Запрос показывает ВСЕ пишущие permissive-
-- политики, выданные роли public, по всей схеме. Ожидаемый результат — пусто;
-- всё, что найдётся, разбирать отдельно (не сносить вслепую: где-то это может
-- быть осознанным решением, как публичный SELECT на recipes).
-- ============================================================================
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and permissive = 'PERMISSIVE'
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and 'public' = any (roles)
order by tablename, cmd, policyname;


-- ============================================================================
-- ОТКАТ (вернуть дырявое поведение — только если что-то сломалось и нужно
-- время разобраться; это снова открывает кражу чужих рецептов):
--   create policy "Enable update access for all users" on public.recipes
--     for update to public using (true) with check (true);
-- ============================================================================
