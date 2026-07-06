-- ОЧИСТКА recipes ПОСЛЕ ИНЦИДЕНТА.
-- Запускать ПОСЛЕ применения supabase_recipes_social_rls.sql (иначе дыра,
-- которой воспользовались для вставки этого мусора, останется открытой,
-- и через минуту после удаления всё вернётся обратно).
--
-- Перед этим файлом обязательно прогнать supabase_recipes_social_rls.sql —
-- он уже применён по подтверждению пользователя (Этап 2).
--
-- Бакет A: скриптовая атака 2026-07-05 ~21:09-21:10 UTC — 1092 строки,
--          session_id IS NULL, заголовки вида "... #N" / "ХУЙНЯ_N",
--          часть с накрученным likes_count (попытка попасть в топ ленты).
-- Бакет B: повторяющийся мусор с февраля по июль 2026 (424 строки,
--          title='ХУЙ', steps=['Иди нахуй']) — шёл через легитимный
--          /api/recipe (там нет фильтра адекватности блюда, в отличие от
--          /api/search-recipe), а не через взлом авторизации.
--
-- Итог после удаления: в таблице должна остаться 1 строка (id=425, "Борщ").

-- 0) Бэкап на всякий случай — можно откатиться, если что-то пойдёт не так.
create table if not exists public.recipes_incident_backup_20260706 as
select * from public.recipes
where (session_id is null and (title ~ '#[0-9]+$' or title ~ '^ХУЙНЯ_[0-9]+$'))
   or title = 'ХУЙ';

-- 1) Проверка перед удалением (ожидаем 1092 | 424 | 1517)
select
  count(*) filter (where session_id is null and (title ~ '#[0-9]+$' or title ~ '^ХУЙНЯ_[0-9]+$')) as burst_attack_rows,
  count(*) filter (where title = 'ХУЙ') as recurring_junk_rows,
  count(*) as total_rows
from public.recipes;

-- 2) Удаление обоих бакетов
delete from public.recipes
where session_id is null
  and (title ~ '#[0-9]+$' or title ~ '^ХУЙНЯ_[0-9]+$');

delete from public.recipes
where title = 'ХУЙ';

-- 3) Проверка после удаления (ожидаем ровно 1 строку — "Борщ")
select count(*) from public.recipes;


-- ============================================================================
-- СЛЕДУЮЩИЙ ШАГ УЖЕСТОЧЕНИЯ (опционально, можно прогнать отдельно позже).
-- Раскопки показали: 100% мусора (1099 из 1092+424 строк) имели
-- session_id IS NULL, а НИ ОДНА легитимная запись — нет. RLS-политика из
-- supabase_recipes_social_rls.sql формально ещё разрешает anon-вставку с
-- session_id = NULL (проверяет только "не совпадает ли с чужим реальным
-- аккаунтом", а NULL ни с кем не совпадает). Раньше нельзя было добавить
-- жёсткий NOT NULL на колонку — в таблице были строки с NULL. Теперь,
-- после удаления мусора, можно закрыть и это:
-- ============================================================================
-- alter table public.recipes alter column session_id set not null;
--
-- drop policy if exists "Insert own recipes" on public.recipes;
-- create policy "Insert own recipes"
-- on public.recipes
-- for insert
-- to anon, authenticated
-- with check (
--   session_id is not null
--   and (
--     (auth.uid() is not null and auth.uid()::text = session_id)
--     or (auth.uid() is null and not public.is_registered_user_id(session_id))
--   )
-- );
