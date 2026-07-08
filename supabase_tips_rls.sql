-- ============================================================================
-- Этап Z-2 — «Совет дня»: короткие кулинарные советы на Главной.
-- Запускать целиком в Supabase SQL Editor (New query → Run).
--
-- Модель доступа (по CLAUDE.md, образец articles/news):
--   * SELECT публичный ТОЛЬКО для опубликованных (is_published=true) — это
--     осознанно публичный контент без чувствительных полей (нет user_id/
--     session_id). Черновики не видны никому, кроме админа (service_role).
--   * INSERT/UPDATE/DELETE — только через админ-роуты на service_role
--     (/api/admin/tips). Политик записи для anon/authenticated НЕТ намеренно:
--     публикует только директор после вычитки. Никаких фейков — пассивный
--     контент без кнопок и без авторства.
--
-- Ротация на Главной — детерминированно по дате (день года % число советов),
-- на стороне приложения. Лайков/просмотров у советов нет (пассивный контент),
-- поэтому view с агрегатом не нужен — читаем таблицу напрямую (RLS отдаёт
-- только опубликованные), явным списком колонок (без is_published в пейлоаде).
--
-- Откат: drop table if exists public.tips;
-- ============================================================================

create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  -- Короткий проверяемый совет, 1-2 предложения.
  body text not null,
  -- Иконка по теме; в UI дефолт — лампочка, если пусто.
  emoji_icon text,
  is_published boolean not null default false,

  constraint tips_body_len check (char_length(body) between 1 and 400),
  constraint tips_emoji_len check (emoji_icon is null or char_length(emoji_icon) <= 16)
);

-- Индекс под публичную выборку (только опубликованные, стабильный порядок).
create index if not exists tips_published_idx
  on public.tips (published_at asc nulls last, created_at asc)
  where is_published = true;

alter table public.tips enable row level security;

-- Единственная политика записи наружу — публичное чтение опубликованных советов.
-- Обоснование: советы — осознанно публичный контент без чувствительных полей.
drop policy if exists "tips_public_read_published" on public.tips;
create policy "tips_public_read_published"
on public.tips
for select
to anon, authenticated
using (is_published = true);

-- INSERT/UPDATE/DELETE-политик для anon/authenticated НЕТ намеренно: создание,
-- генерация черновиков, публикация/снятие и удаление — только серверным
-- админ-роутом (/api/admin/tips) на service_role (обходит RLS).
