-- Время приготовления рецепта (задача: добавить cooking_time_minutes).
-- Аддитивная миграция: одна nullable-колонка в таблицу recipes.
-- Целое число минут — общая оценка (подготовка + готовка). NULL у старых
-- рецептов (генерация до этой фичи) — UI ничего не показывает для NULL.
--
-- RLS НЕ трогаем: колонка автоматически наследует политики таблицы recipes
-- (см. supabase_recipes_social_rls.sql). Отдельных grant'ов не требуется.
--
-- Как применить (Supabase → SQL Editor):
--   1. Открыть проект в Supabase, вкладка SQL Editor → New query.
--   2. Вставить весь этот файл, нажать Run.
--   3. Проверить, что колонка появилась (запрос ниже вернёт одну строку):
--        select column_name, data_type, is_nullable
--        from information_schema.columns
--        where table_name = 'recipes' and column_name = 'cooking_time_minutes';
--
-- IF NOT EXISTS — идемпотентно, повторный запуск безопасен.

alter table public.recipes
  add column if not exists cooking_time_minutes integer;

comment on column public.recipes.cooking_time_minutes is
  'Общая оценка времени приготовления в минутах (подготовка + готовка). NULL — не задано.';
