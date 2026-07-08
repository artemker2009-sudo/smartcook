-- ============================================================================
-- Этап Y — «Кухонные заметки»: статьи на Главной с лайками.
-- Запускать целиком в Supabase SQL Editor (New query → Run).
--
-- Модель доступа (по CLAUDE.md, с оглядкой на инциденты №1/№2):
--   * articles.SELECT публичный ТОЛЬКО для опубликованных (is_published=true) —
--     это осознанно публичные данные (статьи-контент на сайте, без чувствительных
--     полей: нет user_id/session_id, автор всегда «Команда SmartCook»).
--     Черновики (is_published=false) не видны никому, кроме админа (service_role).
--   * INSERT/UPDATE/DELETE статей — ТОЛЬКО через админ-роуты на service_role
--     (/api/admin/articles). Политик записи для anon/authenticated НЕТ намеренно:
--     публиковать может только директор. Никаких «выдуманных авторов» — подпись
--     фиксированная в UI, в таблице автора нет вовсе.
--   * article_likes — по образцу feed_photo_likes: лайк только залогиненным,
--     один на пользователя (UNIQUE), список лайкнувших наружу НЕ отдаётся —
--     только агрегат count() через view articles_public. Прямого публичного
--     SELECT на article_likes нет (пользователь видит лишь свои лайки).
--
-- Откат: drop view if exists public.articles_public;
--        drop table if exists public.article_likes;
--        drop table if exists public.articles;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Статьи
-- ---------------------------------------------------------------------------
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Момент публикации (проставляется при первом переводе в is_published=true).
  -- Сортировка ленты идёт по нему, чтобы порядок не «прыгал» при редактировании.
  published_at timestamptz,
  title text not null,
  -- Человекочитаемый slug для ЧПУ-ссылок /articles/<slug> (SEO, задача T/W).
  slug text not null unique,
  -- 1-2 предложения для карточки на Главной и OG-описания.
  excerpt text not null,
  -- Тело статьи в markdown (пишет админ/GPT-черновик, рендерится безопасным
  -- подмножеством на сервере — см. lib/markdown.ts).
  body text not null,
  -- Обложек-картинок у нас нет (генерить нечем) → в дизайн-языке проекта:
  -- пастельная плитка + крупная эмодзи по теме. Храним только эмодзи.
  emoji_icon text,
  -- Публикация — только вручную директором после вычитки. Черновики от GPT
  -- сохраняются с is_published=false и наружу не видны.
  is_published boolean not null default false,

  constraint articles_title_len check (char_length(title) between 1 and 200),
  constraint articles_slug_len check (char_length(slug) between 1 and 200),
  constraint articles_slug_fmt check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint articles_excerpt_len check (char_length(excerpt) between 1 and 400),
  constraint articles_body_len check (char_length(body) between 1 and 20000),
  constraint articles_emoji_len check (emoji_icon is null or char_length(emoji_icon) <= 16)
);

-- Индекс под публичную ленту (только опубликованные, свежие сверху).
create index if not exists articles_published_idx
  on public.articles (published_at desc nulls last, created_at desc)
  where is_published = true;

alter table public.articles enable row level security;

-- Единственная политика записи наружу — публичное чтение ОПУБЛИКОВАННЫХ статей.
-- Обоснование: статьи — осознанно публичный контент без чувствительных полей.
-- Черновики (is_published=false) недоступны anon/authenticated.
drop policy if exists "articles_public_read_published" on public.articles;
create policy "articles_public_read_published"
on public.articles
for select
to anon, authenticated
using (is_published = true);

-- INSERT/UPDATE/DELETE-политик для anon/authenticated НЕТ намеренно: создание,
-- редактирование, публикация/снятие и удаление — только серверным админ-роутом
-- (/api/admin/articles) на service_role (обходит RLS). Значит клиент не может
-- ни создать статью, ни опубликовать чужой черновик.

-- ---------------------------------------------------------------------------
-- 2. Лайки статей (один на пользователя, только залогиненные) — образец
--    feed_photo_likes.
-- ---------------------------------------------------------------------------
create table if not exists public.article_likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_ref uuid not null,
  -- Один лайк на пользователя на статью — на уровне БД, всегда.
  constraint article_likes_unique unique (article_id, user_ref)
);

create index if not exists article_likes_article_idx
  on public.article_likes (article_id);

alter table public.article_likes enable row level security;

-- SELECT: пользователь видит ТОЛЬКО свои лайки (чтобы знать, что уже лайкнул).
-- Список чужих user_ref наружу не отдаётся — счётчик идёт через агрегат-view.
drop policy if exists "article_likes_select_own" on public.article_likes;
create policy "article_likes_select_own"
on public.article_likes
for select
to authenticated
using (auth.uid() = user_ref);

-- INSERT: лайкать может только сам пользователь от своего имени.
drop policy if exists "article_likes_insert_own" on public.article_likes;
create policy "article_likes_insert_own"
on public.article_likes
for insert
to authenticated
with check (auth.uid() = user_ref);

-- DELETE: снять можно только свой лайк.
drop policy if exists "article_likes_delete_own" on public.article_likes;
create policy "article_likes_delete_own"
on public.article_likes
for delete
to authenticated
using (auth.uid() = user_ref);

-- ---------------------------------------------------------------------------
-- 3. Публичная витрина статей — единственный публичный источник со счётчиком.
--    security_invoker=false → view исполняется с правами владельца и может
--    посчитать лайки в обход RLS, но отдаёт ТОЛЬКО безопасные поля + агрегат.
--    Список лайкнувших (user_ref) НЕ отдаётся. liked_by_me вычисляется по
--    auth.uid() текущего запроса (для анонима/SSR под anon — false; клиент
--    залогиненного перечитывает view и подтягивает свой лайк, как в ленте).
--    read_minutes считаем из длины тела здесь, чтобы карточки на Главной/в
--    списке НЕ тянули всё body в пейлоад ради оценки времени чтения.
-- ---------------------------------------------------------------------------
drop view if exists public.articles_public;
create view public.articles_public
with (security_invoker = false) as
select
  a.id,
  a.created_at,
  a.published_at,
  a.title,
  a.slug,
  a.excerpt,
  a.emoji_icon,
  a.body,
  greatest(1, ceil(char_length(a.body) / 900.0))::int as read_minutes,
  (select count(*) from public.article_likes l where l.article_id = a.id) as likes_count,
  exists (
    select 1 from public.article_likes l
    where l.article_id = a.id and l.user_ref = auth.uid()
  ) as liked_by_me
from public.articles a
where a.is_published = true
order by a.published_at desc nulls last, a.created_at desc;

grant select on public.articles_public to anon, authenticated;
