-- Run in Supabase SQL editor.
-- Заявки на восстановление доступа: пользователь забыл и пароль, и код
-- восстановления. Он оставляет логин + свой Telegram, админ выдаёт ему НОВЫЙ
-- КОД ВОССТАНОВЛЕНИЯ (не пароль!) и лично присылает его в Telegram. Пароль
-- пользователь задаёт себе сам, введя код в форме «Забыли пароль».
--
-- Модель доступа — та же, что у error_reports (осознанно, см. тот файл):
--   * INSERT разрешён anon + authenticated: это публичный канал, заявку
--     оставляет тот, кто в аккаунт уже не попадает. WITH CHECK валидирует
--     длины/формат и фиксирует status='new' — подделать статус нельзя.
--   * SELECT / UPDATE / DELETE политик НЕТ вовсе → никто, кроме серверных
--     админ-роутов с service_role (они обходят RLS), не может ни прочитать
--     заявки, ни закрыть их. Это важно: список заявок раскрывает, какие
--     логины существуют.
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

-- Единственная политика: публичная вставка валидной заявки со status='new'.
-- USING/SELECT нет — оставивший заявку не сможет прочитать таблицу обратно.
create policy "password_reset_requests_public_insert"
on public.password_reset_requests
for insert
to anon, authenticated
with check (
  username ~ '^[a-z0-9_]{3,20}$'
  and char_length(telegram) between 2 and 100
  and status = 'new'
);
