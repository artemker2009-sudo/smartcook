-- ============================================================================
-- Этап 8 (K) — Новости проекта в таблице (редактируются из админки).
-- Запускать целиком в Supabase SQL Editor (New query → Run).
--
-- Модель доступа (по CLAUDE.md):
--   * SELECT публичный ТОЛЬКО для видимых записей (is_visible=true) — это
--     осознанно публичные данные (новости на Главной). Скрытые не видны никому
--     кроме админа (через service_role). Чувствительных полей в таблице нет.
--   * INSERT/UPDATE/DELETE — только через админ-роуты на service_role (обходит
--     RLS). Политик записи для anon/authenticated НЕТ намеренно.
--
-- Откат: drop table if exists public.news;
-- ============================================================================

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date text,                                  -- отображаемая дата, напр. «Июль 2026»
  title text not null,
  body text not null,
  is_visible boolean not null default true,

  constraint news_date_len check (date is null or char_length(date) <= 50),
  constraint news_title_len check (char_length(title) between 1 and 200),
  constraint news_body_len check (char_length(body) between 1 and 1000)
);

create index if not exists news_visible_created_idx
  on public.news (created_at desc)
  where is_visible = true;

alter table public.news enable row level security;

-- Единственная политика записи наружу — публичное чтение видимых новостей.
-- Обоснование: новости проекта показываются всем на Главной (осознанно
-- публичные данные, без чувствительных полей). Скрытые записи недоступны.
drop policy if exists "news_public_read_visible" on public.news;
create policy "news_public_read_visible"
on public.news
for select
to anon, authenticated
using (is_visible = true);

-- INSERT/UPDATE/DELETE-политик для anon/authenticated НЕТ: создание,
-- редактирование, скрытие/показ и удаление — только серверным админ-роутом
-- (/api/admin/news) на service_role.

-- --- Сид: текущие 3 новости (свежие — с более поздним created_at, идут сверху) ---
insert into public.news (title, date, body, is_visible, created_at) values
  ('Новый дизайн', 'Июнь 2026',
   'Мы обновили SmartCook: стало чище, быстрее и удобнее с телефона.',
   true, now() - interval '3 minutes'),
  ('Профиль вкуса', 'Июль 2026',
   'Укажите аллергии и нелюбимые продукты один раз — каждый рецепт будет подобран с их учётом.',
   true, now() - interval '2 minutes'),
  ('SmartCook можно установить как приложение', 'Июль 2026',
   'Откройте сайт с телефона и добавьте на главный экран — иконка как у обычного приложения, открывается в один тап.',
   true, now() - interval '1 minute');
