-- ============================================================================
-- Платформа захода в analytics_events — раздел «Платформы» в админке.
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать. Ничего не удаляет.
--
-- ЗАЧЕМ. Сейчас невозможно ответить на простой вопрос: сколько людей приходит
-- на сайт, сколько — из приложения App Store, сколько — из RuStore. Метрика
-- видит все три как один браузер: и WKWebView, и TWA — это обычные веб-заходы
-- с того же домена. Отличить их может только сам сайт (lib/platform.ts), и его
-- ответ надо где-то хранить.
--
-- ЧТО ИМЕННО ПИШЕТСЯ. Одна строка на СЕАНС (не на экран), с тремя полями:
--   event_type = 'visit'
--   platform   = 'web' | 'ios_app' | 'android_twa'
--   visitor    = 'new' | 'returning'
-- Пишет серверный роут /api/platform-hit сервис-ролью.
--
-- ЧЕГО В СТРОКЕ НЕТ И НЕ ДОЛЖНО БЫТЬ: идентификатора устройства, IP, User-Agent.
-- «Новый или вернувшийся» приходит готовым словом — отметку о том, что
-- устройство уже было, держит у себя клиент в localStorage. Связать два захода
-- одного человека по этим строкам нельзя, и это сознательно: разрез «новые
-- против вернувшихся» такой точности и требует, а сквозной идентификатор
-- пришлось бы заводить, описывать в политике и хранить.
--
-- БЕЗОПАСНОСТЬ. RLS на analytics_events уже включён:
--   * INSERT открыт анониму (осознанно, для событий банкета — так этот пункт и
--     стоит в аудит-запросе из CLAUDE.md);
--   * SELECT закрыт всем, читает только сервис-роль из /api/admin/*.
-- Новые колонки наследуют ровно этот режим. Политик этот файл НЕ добавляет и
-- существующие НЕ трогает.
--
-- ВНИМАНИЕ на открытый INSERT: подделать статистику платформ анонимным ключом
-- технически можно. Поэтому приложение пишет её НЕ анонимным ключом, а через
-- свой роут сервис-ролью (см. app/api/platform-hit/route.ts). Закрывать INSERT
-- этим файлом нельзя: на нём держатся события банкета.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Колонки
-- ----------------------------------------------------------------------------

alter table public.analytics_events
  add column if not exists platform text,
  add column if not exists visitor text;

-- party_id у события захода нет и быть не может: заход происходит вне банкета.
-- Если колонка досталась от старой схемы обязательной — снимаем требование.
-- Идемпотентно: повторный запуск ничего не меняет.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'analytics_events'
      and column_name = 'party_id'
      and is_nullable = 'NO'
  ) then
    alter table public.analytics_events alter column party_id drop not null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Ограничения — вторая линия обороны
-- ----------------------------------------------------------------------------
-- Значения уже проверены в роуте по списку (lib/platform.ts). Эти CHECK'и —
-- страховка на случай, если будущий роут забудут через них пропустить: мусор в
-- колонку не ляжет, и раздел админки не начнёт рисовать колонку «undefined».
-- Пределы совпадают с типами Platform и VisitorKind.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'analytics_events_platform_valid') then
    alter table public.analytics_events
      add constraint analytics_events_platform_valid
      check (platform is null or platform in ('web', 'ios_app', 'android_twa'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'analytics_events_visitor_valid') then
    alter table public.analytics_events
      add constraint analytics_events_visitor_valid
      check (visitor is null or visitor in ('new', 'returning'));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Индекс
-- ----------------------------------------------------------------------------
-- Единственный запрос раздела — «заходы за последние N дней». Индекс частичный,
-- только по строкам визитов: события банкета в него не попадают и не раздувают
-- его со временем.

create index if not exists analytics_events_visit_created_idx
  on public.analytics_events (created_at desc)
  where event_type = 'visit';

-- ----------------------------------------------------------------------------
-- 4. Самопроверка
-- ----------------------------------------------------------------------------
-- Выполнится вместе с файлом. Ожидаем две строки — platform и visitor, обе
-- text и nullable; rls_enabled = true и ДВЕ политики (INSERT для анона и
-- запрет чтения) — ровно те, что были до этого файла.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_events'
  and column_name in ('platform', 'visitor')
order by column_name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'analytics_events';

-- Политики целиком — чтобы видеть, что файл их не трогал (правило 3.1
-- CLAUDE.md: перед и после правки смотрим фактическое состояние, а не файл).
select policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'analytics_events'
order by cmd, policyname;

-- ============================================================================
-- Curl-приёмка (выполнить руками ПОСЛЕ Run). Подставить свои значения:
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"     # публичный ключ
--
-- 1) Аноним по-прежнему не читает статистику — и новые колонки в том числе.
--    Ожидаем [] (а не строки и не ошибку про несуществующую колонку).
--   curl -s "$SB_URL/rest/v1/analytics_events?select=platform,visitor" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   # ожидаем: []
--
-- 2) CHECK работает: мусор в platform не проходит даже сервис-ролью.
--    Ожидаем 400 с "analytics_events_platform_valid".
--   curl -s -X POST "$SB_URL/rest/v1/analytics_events" \
--     -H "apikey: <service-role>" -H "Authorization: Bearer <service-role>" \
--     -H "Content-Type: application/json" \
--     -d '{"event_type":"visit","platform":"windows_phone","visitor":"new"}'
--
--    Пробную строку, если она всё-таки вставится, удалить по её id —
--    это собственная тестовая запись, а не данные пользователя.
-- ============================================================================
