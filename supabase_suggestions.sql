-- ============================================================================
-- Предложения пользователей: «что добавить, а что убрать».
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать.
--
-- Зачем: карточка на Главной и пункт в личном кабинете открывают шторку, где
-- человек пишет, что добавить / что убрать / что не работает. Запись падает
-- сюда, а копия уходит основателю в Telegram (kind='bug' помечается отдельно).
-- Разбор — во вкладке «Предложения» в админке.
--
-- ----------------------------------------------------------------------------
-- МОДЕЛЬ ДОСТУПА (осознанное решение, зафиксировано здесь)
-- ----------------------------------------------------------------------------
--   * INSERT — только СВОЁ и только для authenticated: with check требует
--     user_id = auth.uid(). Ни anon-политики, ни `with check (true)` здесь нет.
--   * SELECT — только СВОЁ: using (user_id = auth.uid()). Ни один клиент не
--     видит чужие предложения, даже свой session_id чужого гостя.
--   * UPDATE / DELETE — политик НЕТ вовсе. Ни anon, ни authenticated не могут
--     менять ни статус, ни текст, ни заметку. Админка ходит на service_role
--     (обходит RLS by design) через закрытый админ-сессией роут
--     app/api/admin/suggestions.
--   * ГОСТИ (без аккаунта) пишут НЕ напрямую по REST, а через серверный роут
--     /api/suggestions на service_role. Дать anon INSERT-политику нельзя:
--     тогда засыпать таблицу — это один curl с публичным anon-ключом, а
--     суточный лимит обходится подстановкой любого session_id. Личность гостя
--     сервер берёт из httpOnly-cookie sc_guest (lib/guestSession.ts), НЕ из
--     тела запроса. Та же проверенная модель, что у лайков ленты.
--
-- ----------------------------------------------------------------------------
-- ЛИЧНОСТЬ АВТОРА
-- ----------------------------------------------------------------------------
--   user_id    — uuid из проверенного JWT (auth.uid()), у гостя null;
--   session_id — гостевой ref из cookie sc_guest, у залогиненного null.
--   Ровно одно из двух заполнено — это гарантирует check-ограничение ниже.
--   На паре (user_id | session_id, created_at) стоит суточный лимит 3 записи,
--   он считается сервером по этой же таблице (отдельной таблицы лимитов нет).
--
-- Откат:
--   drop table if exists public.suggestions;
-- ============================================================================

create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Гостевая личность из httpOnly-cookie sc_guest. Наружу не отдаётся никогда
  -- (админка показывает только тип автора и последние 4 символа).
  session_id text,
  -- Личность аккаунта: auth.uid(). FK на auth.users намеренно нет — предложение
  -- переживает удаление аккаунта (App Store 5.1.1(v)) и остаётся в разборе.
  user_id uuid,

  -- Что именно человек предлагает. Значения совпадают с чипами в шторке:
  -- add = «Добавить», remove = «Убрать», bug = «Не работает».
  kind text not null,
  -- Текст предложения. Сервер режет управляющие символы, схлопывает пробелы и
  -- обрезает до 500; здесь — жёсткая граница на уровне БД.
  text text not null,

  -- Разбор основателем. Меняются ТОЛЬКО через service_role из админки.
  status text not null default 'new',
  admin_note text,

  constraint suggestions_kind_vals check (kind in ('add', 'remove', 'bug')),
  constraint suggestions_status_vals
    check (status in ('new', 'in_progress', 'done', 'rejected')),
  constraint suggestions_text_len check (char_length(text) between 1 and 500),
  constraint suggestions_admin_note_len
    check (admin_note is null or char_length(admin_note) <= 2000),
  constraint suggestions_session_len
    check (session_id is null or char_length(session_id) between 1 and 100),
  -- Автор ровно один: либо аккаунт, либо гость. Обе колонки пустыми быть не
  -- могут — иначе запись анонимна настолько, что под неё не подвести лимит.
  constraint suggestions_owner_present
    check ((user_id is null) <> (session_id is null))
);

-- Лента разбора в админке: новые сверху, фильтр по статусу.
create index if not exists suggestions_status_created_idx
  on public.suggestions (status, created_at desc);
create index if not exists suggestions_created_at_idx
  on public.suggestions (created_at desc);

-- Суточный лимит: «сколько записей у этой личности за последние 24 часа».
-- Частичные индексы — чтобы счёт шёл по узкой выборке, а не по всей таблице.
create index if not exists suggestions_user_created_idx
  on public.suggestions (user_id, created_at desc) where user_id is not null;
create index if not exists suggestions_session_created_idx
  on public.suggestions (session_id, created_at desc) where session_id is not null;

alter table public.suggestions enable row level security;

-- Пересоздаём политики: файл должен быть безопасен при повторном прогоне.
drop policy if exists "suggestions_insert_own" on public.suggestions;
drop policy if exists "suggestions_select_own" on public.suggestions;

-- INSERT: только от своего имени и только «сырая» запись. Клиент не может ни
-- подставить чужой user_id, ни притвориться гостем (session_id обязан быть
-- null), ни выставить себе статус или заметку разбора.
create policy "suggestions_insert_own"
on public.suggestions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and session_id is null
  and kind in ('add', 'remove', 'bug')
  and char_length(text) between 1 and 500
  and status = 'new'
  and admin_note is null
);

-- SELECT: только свои записи. USING (true) здесь нет и быть не должно —
-- иначе любой залогиненный читал бы все предложения всех людей.
create policy "suggestions_select_own"
on public.suggestions
for select
to authenticated
using (user_id = auth.uid());

-- UPDATE / DELETE: политик НЕТ намеренно. Смена статуса и заметка — только
-- service_role из app/api/admin/suggestions, закрытого админ-сессией.
