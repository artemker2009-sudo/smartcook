-- ============================================================================
-- Жалобы на фото в витрине «Приготовили сегодня» (App Store 1.2 — UGC moderation).
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать.
--
-- Зачем. Витрина на Главной (feed_photos) — такой же пользовательский контент,
-- как и лента сообщества, но у неё до сих пор не было кнопки «Пожаловаться».
-- Проверяющий App Store видит витрину ПЕРВОЙ (она на Главной), поэтому пункт
-- 1.2 закрывается именно здесь. Модель повторяет уже проверенную
-- supabase_community_post_reports.sql один в один:
--   * жалоба доступна и без регистрации (личность — проверенный JWT либо
--     httpOnly-cookie sc_guest, как у лайков);
--   * одна жалоба на фото от одной личности (unique в БД);
--   * каждая жалоба уведомляет основателя в Telegram;
--   * на третьей жалобе фото автоматически скрывается — сервер выставляет
--     feed_photos.is_hidden = true, и строка пропадает из публичного view
--     feed_photos_public (у него в фильтре `is_hidden = false`).
--
-- Почему ОТДЕЛЬНАЯ таблица, а не общая с community_post_reports:
--   * у витрины другой признак скрытия (feed_photos.is_hidden), у ленты —
--     community_posts.status = 'rejected'; смешивать сущности в одной таблице
--     значит городить дискриминатор и чинить админскую вкладку «Жалобы»,
--     которая сегодня джойнит именно community_posts;
--   * жизненные циклы независимы, и порог жалоб может разойтись.
--
-- Модель безопасности (копия проверенной модели ai_rate_limit_events):
--   * Пишет и читает ТОЛЬКО сервер на service_role (роут /api/feed/report).
--   * RLS включён с НУЛЁМ политик → anon/authenticated не видят и не пишут
--     ничего напрямую по REST. service_role обходит RLS by design.
--   * reporter_ref — строка вида "user:<uuid>" или "guest:<uuid>"; личность
--     берётся сервером из проверенного JWT либо httpOnly-cookie, НЕ из тела.
--
-- Устойчивость кода: пока этот файл не прогнан, жалоба на фото витрины всё
-- равно уходит в Telegram (ручная модерация), но дедуп и авто-скрытие не
-- работают. После прогона включаются сами, без изменений кода.
--
-- Откат:
--   drop table if exists public.feed_photo_reports;
-- ============================================================================

create table if not exists public.feed_photo_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Фото, на которое жалуются. FK намеренно нет — ровно по тем же причинам, что
  -- и у жалоб на посты: у витрины свой жизненный цикл (модерация/удаление),
  -- осиротевшие жалобы безвредны и не должны тянуть за собой каскады.
  photo_id uuid not null,
  -- Кто пожаловался: "user:<uuid>" или "guest:<uuid>". Наружу не отдаётся.
  reporter_ref text not null,
  -- Необязательная причина (санитизируется на сервере: control-байты, пробелы,
  -- обрезка). На уровне БД — только ограничение длины.
  reason text,
  -- Решение модератора «жалоба отклонена, фото оставляем». Из данных не
  -- выводится, поэтому колонка заведена сразу (у ленты её пришлось добавлять
  -- второй миграцией).
  dismissed_at timestamptz,

  constraint feed_photo_reports_reporter_len
    check (char_length(reporter_ref) between 1 and 80),
  constraint feed_photo_reports_reason_len
    check (reason is null or char_length(reason) <= 300),
  -- Одна жалоба на фото от одной личности.
  constraint feed_photo_reports_unique unique (photo_id, reporter_ref)
);

comment on table public.feed_photo_reports is
  'Жалобы пользователей на фото витрины «Приготовили сегодня» (feed_photos). '
  'Пишет и читает только сервер на service_role. Три жалобы → is_hidden = true.';

-- Подсчёт жалоб по фото (select count where photo_id = ...).
create index if not exists feed_photo_reports_photo_idx
  on public.feed_photo_reports (photo_id);

-- Частичный индекс под будущую админскую выборку «открытые выше закрытых».
create index if not exists feed_photo_reports_open_created_idx
  on public.feed_photo_reports (created_at desc)
  where dismissed_at is null;

alter table public.feed_photo_reports enable row level security;
-- Политик НЕ добавляем намеренно: это блокирует любой доступ anon/authenticated.
-- Роут /api/feed/report работает на service_role и RLS обходит.

-- ============================================================================
-- Приёмка (после Run в SQL Editor). Подставить SUPABASE_URL и anon-ключ.
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"
--
--   # 1. anon НЕ читает таблицу жалоб (ожидаем пустой массив или ошибку RLS,
--   #    но НИ В КОЕМ СЛУЧАЕ не строки)
--   curl -s "$SB_URL/rest/v1/feed_photo_reports?select=id,reporter_ref&limit=1" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
--
--   # 2. anon НЕ пишет в таблицу напрямую (ожидаем 401/403 от RLS)
--   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SB_URL/rest/v1/feed_photo_reports" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"photo_id":"00000000-0000-0000-0000-000000000000","reporter_ref":"guest:x"}'
--
--   # 3. витрина по-прежнему отдаёт только безопасные поля
--   curl -s "$SB_URL/rest/v1/feed_photos_public?select=id,user_name,recipe_id&limit=3" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
-- ============================================================================
