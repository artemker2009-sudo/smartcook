-- ============================================================================
-- Лента сообщества (фото блюд от пользователей) с ОБЯЗАТЕЛЬНОЙ премодерацией.
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать.
--
-- Это НЕ витрина «Приготовили сегодня». Витрина живёт в feed_photos /
-- feed_photos_public и этой миграцией НЕ затрагивается. Лента — отдельная
-- поверхность и отдельные таблицы (community_posts*). Одобренные посты ленты в
-- витрину не попадают.
--
-- Модель безопасности (по CLAUDE.md, с оглядкой на инциденты №1/№2 — копия
-- проверенной модели feed_photos):
--   * Всё на auth.uid() — анонимы НИЧЕГО не пишут и не лайкают.
--   * Владелец (user_ref) берётся из проверенной сессии (auth.uid()), НЕ из тела
--     запроса. RLS это гарантирует на уровне БД.
--   * Новый пост создаётся только в статусе 'pending' и виден лишь автору
--     (SELECT own) и серверу на service_role (админка + Telegram-вебхук).
--     Публичным пост становится ТОЛЬКО после status='approved'.
--   * Статус модерации клиент менять НЕ может: UPDATE-политик для
--     anon/authenticated нет вовсе; approve/reject — только серверным роутом на
--     service_role (обходит RLS). Значит самоодобрение невозможно.
--   * Публичная лента отдаётся ТОЛЬКО через view community_posts_public, который
--     НЕ раскрывает user_ref, НЕ раскрывает status и НЕ отдаёт список лайкнувших
--     — только агрегат count(). Прямого публичного SELECT на таблицы нет.
--
-- Хранилище фото: переиспользуем существующий публичный бакет 'feed_photos'
-- (создан в supabase_feed_photos_rls.sql: публичное чтение по случайному
-- UUID-имени, запись — только залогиненный). Отдельный бакет НЕ заводим —
-- никаких storage-изменений в этом файле нет.
--
-- Откат:
--   drop view if exists public.community_posts_public;
--   drop table if exists public.community_post_likes;
--   drop table if exists public.community_posts;
--   (deny-all на зомби-таблицах §4 откатывать не нужно — это ужесточение)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Таблица постов ленты
-- ---------------------------------------------------------------------------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Владелец из проверенной сессии (auth.uid()), НЕ из тела запроса.
  user_ref uuid not null,
  -- Денормализованное отображаемое имя — чтобы лента показывала автора, НЕ
  -- раскрывая user_ref в публичном ответе (защита от утечки идентификаторов).
  user_name text,
  recipe_title text,
  -- Числовой id рецепта (recipes.id), из которого опубликовали фото. NULL =
  -- публикация без привязки к рецепту. FK намеренно нет (как в feed_photos:
  -- у ленты свой жизненный цикл, embedding recipes(...) не используется).
  recipe_id bigint,
  -- Только URL в публичном бакете feed_photos (EXIF/гео чистятся на клиенте до
  -- загрузки, имя файла — случайный UUID). Валидируется и на сервере (что это
  -- наш бакет), длина ограничена ниже.
  photo_url text not null,
  -- Подпись к фото. Санитизируется на сервере (trim, схлопывание пробелов);
  -- на уровне БД — ограничение длины и запрет управляющих символов (см. CHECK).
  caption text,
  -- Статус модерации. Публичным пост становится только при 'approved'.
  status text not null default 'pending',
  -- Когда модератор принял решение (approve/reject).
  moderated_at timestamptz,
  -- Когда ушла карточка на модерацию в Telegram (дедуп повторных уведомлений).
  notified_at timestamptz,

  constraint community_posts_status_chk
    check (status in ('pending', 'approved', 'rejected')),
  constraint community_posts_user_name_len
    check (user_name is null or char_length(user_name) <= 100),
  constraint community_posts_recipe_title_len
    check (recipe_title is null or char_length(recipe_title) <= 200),
  constraint community_posts_photo_url_len
    check (char_length(photo_url) <= 1000),
  constraint community_posts_caption_len
    check (caption is null or char_length(caption) <= 300),
  -- Запрет управляющих символов в подписи (включая перевод строки/таб): подпись
  -- короткая и однострочная, а карточка уходит в Telegram Markdown — не даём
  -- протащить control-байты. [[:cntrl:]] покрывает C0 + DEL. Сервер дополнительно
  -- вырезает их до вставки; это защита на уровне БД на случай прямой вставки.
  constraint community_posts_caption_clean
    check (caption is null or caption !~ '[[:cntrl:]]')
);

-- Частичный индекс под публичную ленту (только одобренные, свежие сверху).
create index if not exists community_posts_public_created_idx
  on public.community_posts (created_at desc)
  where status = 'approved';

-- Индекс под очередь модерации в админке (pending, свежие сверху).
create index if not exists community_posts_status_created_idx
  on public.community_posts (status, created_at desc);

alter table public.community_posts enable row level security;

-- SELECT: автор видит ТОЛЬКО свои посты (в любом статусе — чтобы показать
-- «на модерации» / «отклонено»). Публичная лента идёт через view ниже, а не
-- через эту политику. Аноним из таблицы напрямую не читает ничего.
drop policy if exists "community_posts_select_own" on public.community_posts;
create policy "community_posts_select_own"
on public.community_posts
for select
to authenticated
using (auth.uid() = user_ref);

-- INSERT: владелец из auth; создать можно ТОЛЬКО свой пост и ТОЛЬКО в статусе
-- 'pending' (нельзя опубликоваться сразу одобренным / за другого).
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
on public.community_posts
for insert
to authenticated
with check (auth.uid() = user_ref and status = 'pending');

-- DELETE: удалять можно только свой пост (в любом статусе).
drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
on public.community_posts
for delete
to authenticated
using (auth.uid() = user_ref);

-- UPDATE-политик НЕТ намеренно: статус модерации (pending→approved/rejected)
-- меняется ТОЛЬКО серверным роутом на service_role (обходит RLS) — из админки и
-- из Telegram-вебхука. Клиент статус выставить не может → самоодобрение
-- невозможно.

-- ---------------------------------------------------------------------------
-- 2. Лайки (один на пользователя на пост, только залогиненные) — копия модели
--    feed_photo_likes.
-- ---------------------------------------------------------------------------
create table if not exists public.community_post_likes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_ref uuid not null,
  -- Один лайк на пользователя на пост — на уровне БД, всегда.
  constraint community_post_likes_unique unique (post_id, user_ref)
);

create index if not exists community_post_likes_post_idx
  on public.community_post_likes (post_id);

alter table public.community_post_likes enable row level security;

-- SELECT: пользователь видит ТОЛЬКО свои лайки (чтобы знать, что уже лайкнул).
-- Список чужих user_ref наружу не отдаётся — счётчик идёт через агрегат-view.
drop policy if exists "community_post_likes_select_own" on public.community_post_likes;
create policy "community_post_likes_select_own"
on public.community_post_likes
for select
to authenticated
using (auth.uid() = user_ref);

-- INSERT: лайкать может только сам пользователь от своего имени.
drop policy if exists "community_post_likes_insert_own" on public.community_post_likes;
create policy "community_post_likes_insert_own"
on public.community_post_likes
for insert
to authenticated
with check (auth.uid() = user_ref);

-- DELETE: снять можно только свой лайк.
drop policy if exists "community_post_likes_delete_own" on public.community_post_likes;
create policy "community_post_likes_delete_own"
on public.community_post_likes
for delete
to authenticated
using (auth.uid() = user_ref);

-- ---------------------------------------------------------------------------
-- 3. Публичная лента — единственный публичный источник постов.
--    security_invoker=false → view исполняется с правами владельца и может
--    посчитать лайки в обход RLS, но отдаёт ТОЛЬКО безопасные поля + агрегат.
--    user_ref и status НЕ отдаются. Показываются только status='approved'.
--    liked_by_me вычисляется по auth.uid() текущего запроса (для анонима false).
-- ---------------------------------------------------------------------------
drop view if exists public.community_posts_public;
create view public.community_posts_public
with (security_invoker = false) as
select
  p.id,
  p.created_at,
  p.user_name,
  p.recipe_title,
  p.recipe_id,
  p.photo_url,
  p.caption,
  (select count(*) from public.community_post_likes l where l.post_id = p.id) as likes_count,
  exists (
    select 1 from public.community_post_likes l
    where l.post_id = p.id and l.user_ref = auth.uid()
  ) as liked_by_me
from public.community_posts p
where p.status = 'approved'
order by p.created_at desc;

grant select on public.community_posts_public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Закрываем наглухо зомби-таблицы старой соц-ленты (Система A) — инцидент №2.
--    Данные НЕ дропаем (решим отдельно позже): убираем все USING(true)-политики
--    и оставляем RLS включённым без политик → deny-all для anon/authenticated.
--    service_role по-прежнему имеет доступ (обходит RLS) — это норма.
--    Каждый блок защищён проверкой существования таблицы (to_regclass), чтобы
--    файл был самодостаточным и не падал, если таблицы уже нет.
-- ---------------------------------------------------------------------------
-- ВАЖНО: дропаем политики name-agnostic — перебором ВСЕХ политик таблицы из
-- pg_policies, а не по угаданным именам. На живой БД у feed_posts/photo_likes
-- остались permissive-политики с именами, отличными от тех, что в
-- supabase_recipes_social_rls.sql (напр. заведены раньше/через дашборд) —
-- дроп по имени их не снимал, и аноним продолжал читать чужие user_id/session_id.
-- Перебор гарантированно снимает всё → RLS включён без политик = deny-all для
-- anon/authenticated (service_role по-прежнему обходит RLS).
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['feed_posts', 'photo_comments', 'photo_likes', 'comment_likes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      for r in
        select policyname from pg_policies where schemaname = 'public' and tablename = t
      loop
        execute format('drop policy if exists %I on public.%I', r.policyname, t);
      end loop;
    end if;
  end loop;
end $$;

-- ============================================================================
-- Curl-приёмка (после Run в SQL Editor). Подставить SUPABASE_URL и anon-ключ.
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"
--
-- 4.1 Публичная лента доступна анониму, но отдаёт ТОЛЬКО одобренные и БЕЗ
--     служебных полей. Ожидаем: 200, массив (может быть пустым). Явно
--     запрашиваем user_ref/status — ожидаем 400 (таких колонок во view нет).
--   curl -s "$SB_URL/rest/v1/community_posts_public?select=id,created_at,recipe_id,recipe_title,caption,likes_count,liked_by_me&limit=5" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
--   curl -s "$SB_URL/rest/v1/community_posts_public?select=user_ref&limit=1" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .   # ожидаем ошибку про отсутствие колонки
--
-- 4.2 Прямой доступ анонима к таблице постов закрыт (ожидаем [] — RLS без
--     подходящей политики не отдаёт строк). Неодобренные посты недоступны.
--   curl -s "$SB_URL/rest/v1/community_posts?select=id,user_ref,status&limit=5" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
--
-- 4.3 Аноним не может создать пост (нет INSERT-политики для anon). Ожидаем 401/403.
--   curl -s -X POST "$SB_URL/rest/v1/community_posts" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"user_ref":"00000000-0000-0000-0000-000000000000","photo_url":"x","status":"approved"}' | jq .
--
-- 4.4 Аноним не может лайкать (нет политик для anon на community_post_likes).
--   curl -s -X POST "$SB_URL/rest/v1/community_post_likes" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"post_id":"00000000-0000-0000-0000-000000000000","user_ref":"00000000-0000-0000-0000-000000000000"}' | jq .
--
-- 4.5 Зомби-таблицы старой ленты закрыты наглухо: прямой SELECT анонима больше
--     НЕ отдаёт строк (раньше было USING(true)). Ожидаем [] по каждой.
--   for t in feed_posts photo_comments photo_likes comment_likes; do
--     echo "== $t =="; \
--     curl -s "$SB_URL/rest/v1/$t?select=*&limit=1" \
--       -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"; echo; \
--   done
--
-- 4.6 (после мержа кода, с реальным пользовательским JWT $USER_JWT) — автор
--     видит свой pending/rejected пост, а после отклонения публично его нет.
--   curl -s "$SB_URL/rest/v1/community_posts?select=id,status&order=created_at.desc&limit=5" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" | jq .   # видит свои, включая rejected
-- ============================================================================
