-- ============================================================================
-- Этап 7, Блок 2 — Лента v1 «Приготовили сегодня» (витрина, НЕ соцсеть).
-- Запускать целиком в Supabase SQL Editor (New query → Run).
--
-- Модель безопасности (осознанно, по CLAUDE.md, с оглядкой на инциденты №1/№2):
--   * Всё на auth.uid() — анонимы НИЧЕГО не пишут и не лайкают.
--   * Публичная витрина отдаётся ТОЛЬКО через view feed_photos_public, который
--     НЕ раскрывает user_ref (id владельца) и НЕ отдаёт список лайкнувших —
--     только агрегат count(). Прямого публичного SELECT на таблицы нет.
--   * is_hidden (модерация) клиент менять не может: UPDATE-политик для
--     anon/authenticated нет вовсе; скрытие — только серверным админ-роутом на
--     service_role.
--
-- Откат: drop view if exists public.feed_photos_public;
--        drop table if exists public.feed_photo_likes;
--        drop table if exists public.feed_photos;
--        (+ удалить bucket 'feed_photos' и его storage-политики, см. низ файла)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Таблица фото ленты
-- ---------------------------------------------------------------------------
create table if not exists public.feed_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Владелец берётся из проверенной сессии (auth.uid()), НЕ из тела запроса.
  user_ref uuid not null,
  -- Денормализованное отображаемое имя, чтобы витрина показывала автора, НЕ
  -- раскрывая user_ref в публичном ответе (защита от утечки идентификаторов).
  user_name text,
  recipe_title text,
  -- Только путь/URL в публичном бакете feed_photos (без EXIF/гео — чистится
  -- на клиенте до загрузки). Имя файла — случайный id.
  photo_url text not null,
  is_public boolean not null default false,
  is_hidden boolean not null default false,

  constraint feed_photos_user_name_len check (user_name is null or char_length(user_name) <= 100),
  constraint feed_photos_recipe_title_len check (recipe_title is null or char_length(recipe_title) <= 200),
  constraint feed_photos_photo_url_len check (char_length(photo_url) <= 1000)
);

create index if not exists feed_photos_public_created_idx
  on public.feed_photos (created_at desc)
  where is_public = true and is_hidden = false;

alter table public.feed_photos enable row level security;

-- SELECT: только владелец видит СВОИ строки (для «мои публикации», и чтобы
-- аноним НЕ мог прочитать user_ref публичных строк напрямую). Публичная
-- витрина идёт через view feed_photos_public ниже, а не через эту политику.
drop policy if exists "feed_photos_select_own" on public.feed_photos;
create policy "feed_photos_select_own"
on public.feed_photos
for select
to authenticated
using (auth.uid() = user_ref);

-- INSERT: владелец из auth; нельзя опубликоваться сразу скрытым/за другого.
drop policy if exists "feed_photos_insert_own" on public.feed_photos;
create policy "feed_photos_insert_own"
on public.feed_photos
for insert
to authenticated
with check (auth.uid() = user_ref and is_hidden = false);

-- DELETE: удалять можно только своё фото.
drop policy if exists "feed_photos_delete_own" on public.feed_photos;
create policy "feed_photos_delete_own"
on public.feed_photos
for delete
to authenticated
using (auth.uid() = user_ref);

-- UPDATE-политик НЕТ намеренно: пользователю правки не нужны, а is_hidden
-- (модерация) меняется ТОЛЬКО серверным админ-роутом на service_role (обходит
-- RLS). Значит клиент is_hidden выставить/снять не может.

-- ---------------------------------------------------------------------------
-- 2. Лайки (один на пользователя, только залогиненные)
-- ---------------------------------------------------------------------------
create table if not exists public.feed_photo_likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  photo_id uuid not null references public.feed_photos(id) on delete cascade,
  user_ref uuid not null,
  -- Один лайк на пользователя на фото — на уровне БД, всегда.
  constraint feed_photo_likes_unique unique (photo_id, user_ref)
);

create index if not exists feed_photo_likes_photo_idx
  on public.feed_photo_likes (photo_id);

alter table public.feed_photo_likes enable row level security;

-- SELECT: пользователь видит ТОЛЬКО свои лайки (чтобы знать, что уже лайкнул).
-- Список чужих user_ref наружу не отдаётся — счётчик идёт через агрегат-view.
drop policy if exists "feed_photo_likes_select_own" on public.feed_photo_likes;
create policy "feed_photo_likes_select_own"
on public.feed_photo_likes
for select
to authenticated
using (auth.uid() = user_ref);

-- INSERT: лайкать может только сам пользователь от своего имени.
drop policy if exists "feed_photo_likes_insert_own" on public.feed_photo_likes;
create policy "feed_photo_likes_insert_own"
on public.feed_photo_likes
for insert
to authenticated
with check (auth.uid() = user_ref);

-- DELETE: снять можно только свой лайк.
drop policy if exists "feed_photo_likes_delete_own" on public.feed_photo_likes;
create policy "feed_photo_likes_delete_own"
on public.feed_photo_likes
for delete
to authenticated
using (auth.uid() = user_ref);

-- ---------------------------------------------------------------------------
-- 3. Публичная витрина — единственный публичный источник ленты.
--    security_invoker=false → view исполняется с правами владельца и может
--    посчитать лайки в обход RLS, но отдаёт ТОЛЬКО безопасные поля + агрегат.
--    user_ref НЕ отдаётся. liked_by_me вычисляется по auth.uid() текущего
--    запроса (для анонима — false).
-- ---------------------------------------------------------------------------
drop view if exists public.feed_photos_public;
create view public.feed_photos_public
with (security_invoker = false) as
select
  f.id,
  f.created_at,
  f.user_name,
  f.recipe_title,
  f.photo_url,
  (select count(*) from public.feed_photo_likes l where l.photo_id = f.id) as likes_count,
  exists (
    select 1 from public.feed_photo_likes l
    where l.photo_id = f.id and l.user_ref = auth.uid()
  ) as liked_by_me
from public.feed_photos f
where f.is_public = true and f.is_hidden = false
order by f.created_at desc;

grant select on public.feed_photos_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage-бакет витрины (отдельный от recipe_photos: у ленты свой цикл —
--    модерация/удаление по жалобе — и свои правила доступа).
--    public = true → фото читаются публично (осознанно: это публичная витрина).
--    Запись/изменение/удаление — только залогиненный владелец объекта.
--    Имена файлов задаёт клиент случайным id (без user_ref/оригинального имени).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('feed_photos', 'feed_photos', true)
on conflict (id) do update set public = true;

drop policy if exists "feed_photos_read_public" on storage.objects;
create policy "feed_photos_read_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'feed_photos');

drop policy if exists "feed_photos_write_auth" on storage.objects;
create policy "feed_photos_write_auth"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'feed_photos');

-- UPDATE/DELETE-политик для клиентов НЕТ намеренно: объекты в этом бакете
-- иммутабельны со стороны пользователя (никто не перезапишет/удалит чужое фото).
-- Чистка при модерации/удалении — на стороне сервера через service_role, если
-- понадобится. Так мы не зависим от имени служебной колонки owner/owner_id,
-- которое отличается между версиями Supabase.
