-- ============================================================================
-- Жалобы на публикации в ленте сообщества (App Store 1.2 — UGC moderation).
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода R2.
-- Идемпотентно, безопасно перезапускать.
--
-- Зачем: чтобы пользователь мог пожаловаться на пост, а после 3 разных жалоб
-- пост автоматически скрывался (сервер выставляет community_posts.status =
-- 'rejected' → пост пропадает из публичного view community_posts_public).
-- Без этой таблицы роут /api/feed/report всё равно работает, но только шлёт
-- уведомление основателю в Telegram (ручная модерация); авто-скрытие и дедуп
-- жалоб включаются ровно после прогона этого файла — код менять не нужно.
--
-- Модель безопасности (копия проверенной модели ai_rate_limit_events):
--   * Пишет и читает ТОЛЬКО сервер на service_role (роут /api/feed/report).
--   * RLS включён с НУЛЁМ политик → anon/authenticated не видят и не пишут
--     ничего напрямую по REST. service_role обходит RLS by design.
--   * reporter_ref — строка вида "user:<uuid>" или "guest:<uuid>"; личность
--     берётся сервером из проверенного JWT либо httpOnly-cookie, НЕ из тела.
--   * unique(post_id, reporter_ref) → одна жалоба на пост от одной личности
--     (повторная упирается в 23505 и не накручивает счётчик).
--
-- Откат:
--   drop table if exists public.community_post_reports;
-- ============================================================================

create table if not exists public.community_post_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Пост, на который жалуются. FK намеренно нет (как и в остальной ленте —
  -- у неё свой жизненный цикл; при удалении поста осиротевшие жалобы безвредны).
  post_id uuid not null,
  -- Кто пожаловался: "user:<uuid>" или "guest:<uuid>". Наружу не отдаётся.
  reporter_ref text not null,
  -- Необязательная причина (санитизируется на сервере: control-байты, пробелы,
  -- обрезка). На уровне БД — только ограничение длины.
  reason text,

  constraint community_post_reports_reporter_len
    check (char_length(reporter_ref) between 1 and 80),
  constraint community_post_reports_reason_len
    check (reason is null or char_length(reason) <= 300),
  -- Одна жалоба на пост от одной личности.
  constraint community_post_reports_unique unique (post_id, reporter_ref)
);

-- Подсчёт жалоб по посту (select count where post_id = ...).
create index if not exists community_post_reports_post_idx
  on public.community_post_reports (post_id);

alter table public.community_post_reports enable row level security;
-- Политик НЕ добавляем намеренно: это блокирует любой доступ anon/authenticated.
-- Роут /api/feed/report работает на service_role и RLS обходит.
