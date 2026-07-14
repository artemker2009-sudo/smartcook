-- Run in Supabase SQL editor.
-- Заявки на восстановление доступа: пользователь забыл и пароль, и код
-- восстановления. Он оставляет логин + свой Telegram, админ выдаёт ему НОВЫЙ
-- КОД ВОССТАНОВЛЕНИЯ (не пароль!) и лично присылает его в Telegram. Пароль
-- пользователь задаёт себе сам, введя код в форме «Забыли пароль».
--
-- Модель доступа: RLS включён, политик НЕТ ВООБЩЕ — ни INSERT, ни SELECT.
-- То есть anon/authenticated не могут ни писать, ни читать таблицу напрямую
-- через PostgREST. Вся работа идёт только через серверные роуты с service_role
-- (они обходят RLS):
--   * /api/auth/support-reset   — создаёт заявку;
--   * /api/admin/reset-requests — выдаёт код / закрывает заявку (admin-сессия).
--
-- Это НЕ то же самое, что у error_reports (там anon-INSERT разрешён). Здесь
-- публичный INSERT намеренно закрыт по двум причинам:
--   1) заявки создаёт наш роут, и только он делает rate-limit — прямой доступ
--      к таблице позволил бы засыпать её заявками в обход лимитера;
--   2) SELECT закрыт, потому что список заявок раскрывает, какие логины
--      вообще существуют.
-- CHECK-констрейнты ниже остаются второй линией обороны на случай, если
-- когда-нибудь политику всё же добавят.
--
-- Откат: drop table public.password_reset_requests;

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null,
  telegram text not null,
  status text not null default 'new',

  -- Логин — те же правила, что в приложении (a-z, 0-9, _, 3–20 символов).
  constraint password_reset_requests_username_fmt check (username ~ '^[a-z0-9_]{3,20}$'),
  -- Telegram-контакт: свободная строка (@user / t.me/... / телефон), но с лимитом.
  constraint password_reset_requests_telegram_len check (char_length(telegram) between 2 and 100),
  constraint password_reset_requests_status_vals check (status in ('new', 'done'))
);

create index if not exists password_reset_requests_created_at_idx
  on public.password_reset_requests (created_at desc);

alter table public.password_reset_requests enable row level security;

-- Политик намеренно нет: доступ только через service_role в серверных роутах.
-- Если в ранней версии этого файла политика публичной вставки всё же создалась —
-- убираем её (idempotent, безопасно гонять повторно).
drop policy if exists "password_reset_requests_public_insert" on public.password_reset_requests;
