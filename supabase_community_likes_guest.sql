-- ============================================================================
-- Гостевые лайки в ленте сообщества (без регистрации).
-- Запускать целиком в Supabase SQL Editor (New query → Run) ДО мержа кода.
-- Идемпотентно, безопасно перезапускать.
--
-- Что меняется (поверх supabase_community_feed_rls.sql):
--   1. community_post_likes.user_ref становится nullable, добавляется guest_ref
--      (uuid из httpOnly-cookie sc_guest, которую выдаёт СЕРВЕР при первом
--      лайке — не из тела запроса и не из localStorage).
--   2. Единый unique-ключ (post_id, user_ref) заменяется на ДВА частичных
--      unique-индекса — по аккаунту и по гостю. «Один лайк на одного» держит БД,
--      а не приложение.
--   3. Вьюха community_posts_public пересоздаётся: likes_count считает лайки
--      ОБОИХ типов. liked_by_me по-прежнему только про залогиненного
--      (для гостя вычислить в SQL нечем — состояние сердечка гость получает
--      из ответа серверного роута, см. app/api/feed/like/route.ts).
--   4. Политики записи для authenticated СНИМАЮТСЯ: и гостевые, и аккаунтные
--      лайки идут ТОЛЬКО через серверный роут на service_role.
--
-- Модель безопасности (главное):
--   * Anon-политик на запись НЕ добавляем вовсе. Иначе накрутка счётчика — это
--     один curl по публичному REST с anon-ключом, без всякого приложения.
--     Единственный путь вставки — серверный роут (service_role, обходит RLS),
--     который знает IP, ставит лимит по частоте и выдаёт guest_ref сам.
--   * guest_ref наружу не отдаётся никогда: во вьюхе только агрегат count(),
--     прямого SELECT на таблицу лайков у anon/authenticated нет.
--   * Cookie sc_guest — httpOnly, поэтому JS страницы (в т.ч. чужой скрипт) её
--     не прочитает и не подменит.
--
-- ВАЖНО про порядок: п.4 снимает INSERT/DELETE-политики, которыми пользуется
-- ТЕКУЩИЙ задеплоенный клиент (он лайкает прямым supabase-запросом). Между
-- прогоном миграции и деплоем кода лайк у залогиненного не сработает. Окно
-- короткое и безопасное: на момент написания в community_posts 0 строк
-- (лайкать нечего). Прогонять непосредственно перед мержем.
--
-- Откат:
--   drop index if exists public.community_post_likes_user_uniq;
--   drop index if exists public.community_post_likes_guest_uniq;
--   delete from public.community_post_likes where user_ref is null;
--   alter table public.community_post_likes alter column user_ref set not null;
--   alter table public.community_post_likes drop column if exists guest_ref;
--   alter table public.community_post_likes
--     add constraint community_post_likes_unique unique (post_id, user_ref);
--   -- + вернуть insert/delete-политики из supabase_community_feed_rls.sql §2
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Колонки: гостевой ключ + user_ref становится необязательным
-- ---------------------------------------------------------------------------
alter table public.community_post_likes
  add column if not exists guest_ref uuid;

alter table public.community_post_likes
  alter column user_ref drop not null;

-- Ровно одна строка = один лайк, и у него есть хотя бы один владелец.
-- Обе колонки одновременно — законный случай: лайк, поставленный гостем и
-- потом «усыновлённый» аккаунтом (см. §2 и роут). Строка при этом остаётся
-- ОДНА → счётчик не удваивается.
alter table public.community_post_likes
  drop constraint if exists community_post_likes_owner_chk;
alter table public.community_post_likes
  add constraint community_post_likes_owner_chk
  check (user_ref is not null or guest_ref is not null);

-- ---------------------------------------------------------------------------
-- 2. Уникальность: два частичных индекса вместо одного составного ключа
--    * по аккаунту — один лайк на пользователя на пост;
--    * по гостю   — один лайк на гостевую сессию на пост.
--    Гость, у которого на этом посте уже есть лайк, «усыновлённый» аккаунтом
--    (строка с обоими ref), упрётся во ВТОРОЙ индекс → дубль не создастся.
-- ---------------------------------------------------------------------------
alter table public.community_post_likes
  drop constraint if exists community_post_likes_unique;

create unique index if not exists community_post_likes_user_uniq
  on public.community_post_likes (post_id, user_ref)
  where user_ref is not null;

create unique index if not exists community_post_likes_guest_uniq
  on public.community_post_likes (post_id, guest_ref)
  where guest_ref is not null;

-- Роут ищет свою строку по guest_ref (GET списка «что я лайкнул»).
create index if not exists community_post_likes_guest_idx
  on public.community_post_likes (guest_ref)
  where guest_ref is not null;

-- ---------------------------------------------------------------------------
-- 3. Политики: запись — только через серверный роут (service_role)
--    SELECT own у authenticated оставляем (безвредно, отдаёт только свои
--    строки). INSERT/DELETE снимаем: иначе прямой REST обходит и лимит по
--    частоте, и склейку гостевого лайка с аккаунтом.
--    Для anon политик нет и не появляется — deny-all.
-- ---------------------------------------------------------------------------
drop policy if exists "community_post_likes_insert_own" on public.community_post_likes;
drop policy if exists "community_post_likes_delete_own" on public.community_post_likes;

-- ---------------------------------------------------------------------------
-- 4. Публичная вьюха: счётчик учитывает лайки обоих типов
--    (определение то же, что в supabase_community_feed_rls.sql §3 — count(*) по
--    строкам лайков уже покрывает гостевые; пересоздаём явно, чтобы файл был
--    самодостаточным и фиксировал контракт полей).
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
  -- Считаем СТРОКИ лайков: и аккаунтные, и гостевые. guest_ref/user_ref наружу
  -- не выходят — только число.
  (select count(*) from public.community_post_likes l where l.post_id = p.id) as likes_count,
  exists (
    select 1 from public.community_post_likes l
    where l.post_id = p.id and l.user_ref = auth.uid()
  ) as liked_by_me
from public.community_posts p
where p.status = 'approved'
order by p.created_at desc;

grant select on public.community_posts_public to anon, authenticated;

-- ============================================================================
-- Curl-приёмка (после Run в SQL Editor). Подставить SUPABASE_URL и anon-ключ.
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"
--
-- 1) Аноним НЕ может вставить лайк напрямую (нет anon-политик) — накрутка мимо
--    роута невозможна. Ожидаем 401/403 с "row-level security".
--   curl -s -X POST "$SB_URL/rest/v1/community_post_likes" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"post_id":"00000000-0000-0000-0000-000000000000","guest_ref":"00000000-0000-0000-0000-000000000000"}'
--
-- 2) Аноним НЕ читает таблицу лайков (guest_ref/user_ref наружу не утекают).
--    Ожидаем [] .
--   curl -s "$SB_URL/rest/v1/community_post_likes?select=id,user_ref,guest_ref&limit=5" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--
-- 3) Аноним по-прежнему НЕ пишет в community_posts напрямую. Ожидаем 401/403.
--   curl -s -X POST "$SB_URL/rest/v1/community_posts" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"user_ref":"00000000-0000-0000-0000-000000000000","photo_url":"x","status":"approved"}'
--
-- 4) Залогиненный тоже НЕ пишет лайк напрямую (политики сняты, §3). С реальным
--    пользовательским JWT ожидаем 401/403, а не 201.
--   curl -s -X POST "$SB_URL/rest/v1/community_post_likes" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $USER_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"post_id":"<любой approved id>","user_ref":"<свой uuid>"}'
--
-- 5) Публичная вьюха жива и отдаёт счётчик, но не отдаёт guest_ref.
--   curl -s "$SB_URL/rest/v1/community_posts_public?select=id,likes_count,liked_by_me&limit=5" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
--   curl -s "$SB_URL/rest/v1/community_posts_public?select=guest_ref&limit=1" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"   # ожидаем ошибку: такой колонки нет
--
-- 6) Гостевой лайк работает ТОЛЬКО через наш роут (на задеплоенном коде).
--    Первый вызов ставит cookie sc_guest, второй — не создаёт дубль:
--   curl -s -c /tmp/g.txt -b /tmp/g.txt -X POST "https://smart-cook.pro/api/feed/like" \
--     -H "Content-Type: application/json" -d '{"postId":"<approved id>","like":true}'
--   curl -s -c /tmp/g.txt -b /tmp/g.txt -X POST "https://smart-cook.pro/api/feed/like" \
--     -H "Content-Type: application/json" -d '{"postId":"<approved id>","like":true}'
--   # оба ответа: {"ok":true,"liked":true,"likesCount":1} — счётчик НЕ 2.
-- ============================================================================
