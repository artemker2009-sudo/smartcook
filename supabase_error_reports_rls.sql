-- Run in Supabase SQL editor.
-- Таблица пользовательских баг-репортов («Сообщить об ошибке»).
--
-- Модель доступа (осознанное решение, зафиксировано здесь):
--   * INSERT разрешён anon + authenticated — это публичный канал обратной
--     связи, отправлять может кто угодно, привязка к владельцу не требуется.
--     WITH CHECK НЕ содержит owner-проверки намеренно, но валидирует длины и
--     фиксирует status='new', чтобы нельзя было залить мусор или подделать
--     статус. Это НЕ `WITH CHECK (true)`.
--   * SELECT / UPDATE / DELETE политик НЕТ вовсе → anon/authenticated не могут
--     ни читать чужие репорты, ни менять статус. Чтение и пометка
--     «просмотрено» идут только через серверный админ-роут с service_role
--     (см. app/api/admin/dashboard и app/api/admin/error-reports), который
--     обходит RLS. Это тот же механизм, что у ai_rate_limit_events и
--     support-эндпоинтов.
--
-- Откат: drop table public.error_reports;

create table if not exists public.error_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null,
  contact text,
  url text,
  user_agent text,
  display_mode text,
  viewport text,
  app_version text,
  user_ref text, -- необязательная привязка к проверенной сессии (verified user id)
  status text not null default 'new',

  -- Обязательные ограничения длины (защита от раздувания таблицы).
  constraint error_reports_message_len check (char_length(message) between 1 and 2000),
  constraint error_reports_contact_len check (contact is null or char_length(contact) <= 200),
  -- Гигиена по контекстным полям, чтобы никто не залил мегабайты.
  constraint error_reports_url_len check (url is null or char_length(url) <= 2000),
  constraint error_reports_user_agent_len check (user_agent is null or char_length(user_agent) <= 1000),
  constraint error_reports_display_mode_len check (display_mode is null or char_length(display_mode) <= 32),
  constraint error_reports_viewport_len check (viewport is null or char_length(viewport) <= 32),
  constraint error_reports_app_version_len check (app_version is null or char_length(app_version) <= 100),
  constraint error_reports_user_ref_len check (user_ref is null or char_length(user_ref) <= 100),
  constraint error_reports_status_vals check (status in ('new', 'viewed'))
);

create index if not exists error_reports_created_at_idx
  on public.error_reports (created_at desc);

alter table public.error_reports enable row level security;

-- Единственная политика: публичная вставка с валидными длинами и status='new'.
-- Владельческой проверки нет намеренно (публичный канал), USING/SELECT нет —
-- поэтому вставивший НЕ сможет прочитать таблицу обратно.
create policy "error_reports_public_insert"
on public.error_reports
for insert
to anon, authenticated
with check (
  char_length(message) between 1 and 2000
  and (contact is null or char_length(contact) <= 200)
  and status = 'new'
);
