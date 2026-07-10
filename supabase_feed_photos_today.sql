-- ============================================================================
-- Витрина «Приготовили сегодня» — реальное окно времени + ссылка на рецепт.
-- Аддитивная миграция поверх supabase_feed_photos_rls.sql (этап 7, блок 2).
--
-- ВАЖНО (урок #25): сначала прогнать ЭТОТ файл в Supabase SQL Editor (New query →
-- Run), проверить curl-приёмкой ниже, и ТОЛЬКО ПОТОМ мержить код. Пока колонки
-- recipe_id / нового вида view нет, код на неё не рассчитывает; но explicit-select
-- на несуществующую колонку recipe_id отдаст 400 (PostgREST) — поэтому миграция
-- ДОЛЖНА появиться раньше кода.
--
-- Что делает миграция (всё идемпотентно, безопасно перезапускать):
--   1) feed_photos.recipe_id — числовой id рецепта из recipes (nullable). У старых
--      фото NULL → кнопка «К рецепту» на витрине не показывается. FK намеренно НЕ
--      ставим (см. ниже).
--   2) Индекс по created_at для оконных запросов витрины (если ещё нет).
--   3) Пересоздаём view feed_photos_public, добавив created_at (уже был) и
--      recipe_id в безопасный публичный набор полей. user_ref по-прежнему НЕ
--      отдаётся. Модель безопасности не меняется.
--
-- Откат:
--   drop view if exists public.feed_photos_public;   -- затем пересоздать старую версию
--   alter table public.feed_photos drop column if exists recipe_id;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. recipe_id: ссылка на рецепт, из которого опубликовали фото.
--    Тип bigint: recipes.id — числовой автоинкремент (lib/types.ts: id:number,
--    страница /recipe/[id] валидирует ^\d+$). bigint — безопасный супертип.
--    FK на recipes(id) НАМЕРЕННО не ставим:
--      * витрине FK не нужен — название блюда уже денормализовано (recipe_title),
--        embedding recipes(...) на витрине не используется;
--      * у ленты свой жизненный цикл (модерация/удаление по жалобе) — не хотим
--        каскадов и связки с точным типом PK recipes;
--      * страница рецепта мягко показывает «не найдено», если recipe_id ведёт на
--        удалённый рецепт.
-- ---------------------------------------------------------------------------
alter table public.feed_photos
  add column if not exists recipe_id bigint;

comment on column public.feed_photos.recipe_id is
  'Числовой id рецепта (recipes.id), из которого опубликовали фото. NULL = фото '
  'без привязки к рецепту (публикация «по своему рецепту» / старые строки). '
  'Витрина показывает кнопку «К рецепту» только когда не NULL. FK намеренно нет.';

-- ---------------------------------------------------------------------------
-- 2. Индекс под оконные запросы витрины (created_at >= начало окна, desc).
--    Тот же частичный индекс, что в базовой миграции — повторяем с
--    if not exists, чтобы этот файл был самодостаточным. Частичное условие
--    (is_public, not is_hidden) совпадает с фильтром view, диапазон по
--    created_at покрывается тем же индексом.
-- ---------------------------------------------------------------------------
create index if not exists feed_photos_public_created_idx
  on public.feed_photos (created_at desc)
  where is_public = true and is_hidden = false;

-- ---------------------------------------------------------------------------
-- 3. Публичная витрина — пересоздаём с recipe_id в наборе полей.
--    Модель безопасности НЕ меняется (см. supabase_feed_photos_rls.sql):
--      * security_invoker=false → лайки считаются в обход RLS, но наружу уходит
--        ТОЛЬКО безопасный набор + агрегат;
--      * user_ref НЕ отдаётся;
--      * liked_by_me по auth.uid() (для анонима false);
--      * where is_public and not is_hidden — как раньше;
--      * фильтрацию по окну времени делает КЛИЕНТ через created_at=gte.<iso>
--        (view отдаёт created_at, оконность не «зашита» во view).
-- ---------------------------------------------------------------------------
drop view if exists public.feed_photos_public;
create view public.feed_photos_public
with (security_invoker = false) as
select
  f.id,
  f.created_at,
  f.user_name,
  f.recipe_title,
  f.recipe_id,
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

-- ============================================================================
-- Curl-приёмка (после Run в SQL Editor). Подставить SUPABASE_URL и anon-ключ.
-- Ожидаем: 200, массив, в каждом объекте есть recipe_id (может быть null),
-- created_at, likes_count; НЕТ поля user_ref.
--
--   SB_URL="https://<project>.supabase.co"
--   SB_KEY="<anon-key>"
--
--   # 3.1 view отдаёт recipe_id и НЕ отдаёт user_ref
--   curl -s "$SB_URL/rest/v1/feed_photos_public?select=id,created_at,recipe_id,recipe_title,likes_count&limit=3" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
--
--   # 3.2 оконный фильтр по дате работает (последние 7 суток)
--   SINCE=$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)
--   curl -s "$SB_URL/rest/v1/feed_photos_public?select=id,created_at&created_at=gte.$SINCE&order=created_at.desc&limit=20" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
--
--   # 3.3 прямой доступ к таблице для anon по-прежнему закрыт (ожидаем [] или ошибку RLS)
--   curl -s "$SB_URL/rest/v1/feed_photos?select=id,user_ref&limit=1" \
--     -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | jq .
-- ============================================================================
