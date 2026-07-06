-- ИНЦИДЕНТ: массовая перезапись поля title у recipes для всех пользователей.
-- Причина (как и в прошлый раз с parties.is_paid/title) — на таблице `recipes`
-- вообще не было RLS. Anon-ключ публичный (зашит в клиентский бандл, см.
-- lib/supabase.ts), поэтому кто угодно мог обратиться напрямую к
-- Supabase REST API (в обход всего Next.js-приложения) и одним PATCH-запросом
-- переписать title во всех строках сразу.
--
-- Этот файл закрывает `recipes` и заодно ВСЕ остальные таблицы с
-- пользовательскими данными, у которых RLS ещё не было включён:
-- feed_posts, photo_comments, photo_likes, comment_likes, recipe_likes,
-- party_messages (упустили при прошлой чистке party_items/party_members),
-- daily_recipes (неиспользуемая таблица — блокируем на всякий случай).
--
-- Уже закрыто раньше и НЕ трогается этим файлом:
--   parties, support_tickets, analytics_events, site_settings
--     -> supabase_admin_tables_rls.sql
--   party_members, party_items
--     -> supabase_party_members_rls.sql
--   game_progress (+ view game_leaderboard, game_public_levels)
--     -> supabase_game_progress_rls.sql
--   ai_rate_limit_events
--     -> supabase_rate_limits.sql
--
-- Запускать целиком в Supabase SQL Editor.

-- ============================================================================
-- Вспомогательная функция: "принадлежит ли этот session_id/user_id реальному
-- зарегистрированному аккаунту". Нужна, чтобы гость (без JWT, роль anon) не
-- мог вставить/удалить строку, представившись чужим настоящим auth.uid() —
-- он может писать только под "случайными" гостевыми идентификаторами,
-- которые ни на один реальный auth.users.id не похожи.
-- security definer нужен, т.к. auth.users не выдан на прямой SELECT
-- ролям anon/authenticated.
-- ============================================================================
create or replace function public.is_registered_user_id(check_id text)
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select exists (
    select 1 from auth.users where id::text = check_id
  );
$$;

revoke all on function public.is_registered_user_id(text) from public;
grant execute on function public.is_registered_user_id(text) to anon, authenticated;


-- ============================================================================
-- RECIPES
-- session_id = auth.uid() для залогиненных пользователей (см. app/page.tsx,
-- строка "currentSessionId = user.id"), случайная строка "user_xxxxx" для
-- гостей без логина.
-- ============================================================================
alter table public.recipes enable row level security;

-- SELECT остаётся ПУБЛИЧНЫМ и открытым НАМЕРЕННО: /api/feed.ts делает
-- select * from recipes без owner-фильтра — это и есть публичная лента
-- рецептов, видимая всем посетителям. Название/шаги рецепта — не приватные
-- данные, это витрина. Если это не так задумано — скажите, сузим.
drop policy if exists "Public read access to recipes" on public.recipes;
create policy "Public read access to recipes"
on public.recipes
for select
to anon, authenticated
using (true);

-- INSERT: гости должны иметь возможность сохранить свой рецепт без логина
-- (легитимный сценарий "сохранение своих рецептов"), поэтому anon-insert не
-- блокируем полностью. Но: залогиненный пользователь обязан вставлять только
-- под своим auth.uid(), а гость не имеет права представиться чужим реальным
-- (зарегистрированным) uid — только "своим" гостевым идентификатором.
drop policy if exists "Insert own recipes" on public.recipes;
create policy "Insert own recipes"
on public.recipes
for insert
to anon, authenticated
with check (
  (auth.uid() is not null and auth.uid()::text = session_id)
  or (auth.uid() is null and not public.is_registered_user_id(session_id))
);

-- UPDATE — САМОЕ ГЛАВНОЕ ИСПРАВЛЕНИЕ. Раньше не было вообще никакой
-- политики (эквивалент "запрещено всем после enable RLS", но RLS даже не
-- был включён — то есть update был доступен буквально всем). Теперь:
-- владелец-аккаунт может редактировать только свою запись, гости (anon) —
-- вообще ничего не могут update'ить напрямую (у них нет проверяемого
-- владения). /api/favorite теперь обновляет is_favorite через service role
-- с собственной проверкой владельца в коде — гостям это не ломает.
drop policy if exists "Update own recipes" on public.recipes;
create policy "Update own recipes"
on public.recipes
for update
to authenticated
using (auth.uid()::text = session_id)
with check (auth.uid()::text = session_id);

drop policy if exists "Block anon recipe updates" on public.recipes;
create policy "Block anon recipe updates"
on public.recipes
as restrictive
for update
to anon
using (false);

-- DELETE: сейчас recipes нигде не удаляются напрямую из клиента, но на
-- случай появления такой фичи сразу закрываем правильно — только владелец,
-- гостям запрещено.
drop policy if exists "Delete own recipes" on public.recipes;
create policy "Delete own recipes"
on public.recipes
for delete
to authenticated
using (auth.uid()::text = session_id);

drop policy if exists "Block anon recipe deletes" on public.recipes;
create policy "Block anon recipe deletes"
on public.recipes
as restrictive
for delete
to anon
using (false);


-- ============================================================================
-- FEED_POSTS
-- user_id — всегда настоящий auth.uid() (публикация фото требует логина,
-- см. app/page.tsx: "if (!user) return setIsAuthModalOpen(true)").
-- ============================================================================
alter table public.feed_posts enable row level security;

-- Публичная фотолента (status='approved' фильтруется на уровне приложения) +
-- собственные посты пользователя. Публично НАМЕРЕННО — это витрина фото.
drop policy if exists "Public read access to feed_posts" on public.feed_posts;
create policy "Public read access to feed_posts"
on public.feed_posts
for select
to anon, authenticated
using (true);

drop policy if exists "Insert own feed_posts" on public.feed_posts;
create policy "Insert own feed_posts"
on public.feed_posts
for insert
to authenticated
with check (auth.uid() = user_id);

-- Закрывает конкретную дыру: раньше update({user_name, user_avatar})
-- фильтровался только на клиенте (.eq('user_id', user.id)), без RLS —
-- то есть теоретически такой же вектор атаки, как с recipes.title.
drop policy if exists "Update own feed_posts" on public.feed_posts;
create policy "Update own feed_posts"
on public.feed_posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Delete own feed_posts" on public.feed_posts;
create policy "Delete own feed_posts"
on public.feed_posts
for delete
to authenticated
using (auth.uid() = user_id);

-- Гости (anon) фото не публикуют и ничего в feed_posts не пишут — только
-- читают. Insert/update/delete для anon по умолчанию запрещены (RLS без
-- policy = deny), явные restrictive-политики не нужны.


-- ============================================================================
-- PHOTO_COMMENTS
-- user_id — всегда настоящий auth.uid() (комментирование требует логина,
-- см. submitComment: "if (!user) return setIsAuthModalOpen(true)").
-- ============================================================================
alter table public.photo_comments enable row level security;

-- Комментарии к публичным фото — читает кто угодно. Публично НАМЕРЕННО.
drop policy if exists "Public read access to photo_comments" on public.photo_comments;
create policy "Public read access to photo_comments"
on public.photo_comments
for select
to anon, authenticated
using (true);

drop policy if exists "Insert own photo_comments" on public.photo_comments;
create policy "Insert own photo_comments"
on public.photo_comments
for insert
to authenticated
with check (auth.uid()::text = user_id);

-- Та же дыра, что и в feed_posts: update({user_name, user_avatar}) при
-- смене профиля был защищён только клиентским .eq(), не RLS.
-- Примечание: photo_comments.user_id хранится как text (не uuid, в отличие
-- от feed_posts.user_id) — поэтому auth.uid() приводим к тексту явно.
drop policy if exists "Update own photo_comments" on public.photo_comments;
create policy "Update own photo_comments"
on public.photo_comments
for update
to authenticated
using (auth.uid()::text = user_id)
with check (auth.uid()::text = user_id);

drop policy if exists "Delete own photo_comments" on public.photo_comments;
create policy "Delete own photo_comments"
on public.photo_comments
for delete
to authenticated
using (auth.uid()::text = user_id);


-- ============================================================================
-- PHOTO_LIKES / COMMENT_LIKES
-- session_id — auth.uid() для залогиненных, случайная гостевая строка для
-- анонимов (лайкать фото/комментарии можно и без логина, см.
-- handlePhotoLike/handleCommentLike — там нет "if (!user)").
-- Т.к. у гостей нет проверяемой личности, INSERT/DELETE для anon оставляем
-- открытыми (иначе сломаем гостевые лайки), НО запрещаем anon-запросу
-- писать/удалять под session_id, который совпадает с настоящим
-- зарегистрированным аккаунтом (см. is_registered_user_id выше) — это
-- закрывает подмену чужого реального пользователя.
-- ============================================================================
alter table public.photo_likes enable row level security;

drop policy if exists "Public read access to photo_likes" on public.photo_likes;
create policy "Public read access to photo_likes"
on public.photo_likes
for select
to anon, authenticated
using (true);

drop policy if exists "Insert own photo_likes" on public.photo_likes;
create policy "Insert own photo_likes"
on public.photo_likes
for insert
to anon, authenticated
with check (
  (auth.uid() is not null and auth.uid()::text = session_id)
  or (auth.uid() is null and not public.is_registered_user_id(session_id))
);

drop policy if exists "Delete own photo_likes" on public.photo_likes;
create policy "Delete own photo_likes"
on public.photo_likes
for delete
to anon, authenticated
using (
  (auth.uid() is not null and auth.uid()::text = session_id)
  or (auth.uid() is null and not public.is_registered_user_id(session_id))
);

-- Лайки никогда не редактируются (только insert/delete) — update запрещён
-- всем по умолчанию (нет policy = deny).

alter table public.comment_likes enable row level security;

drop policy if exists "Public read access to comment_likes" on public.comment_likes;
create policy "Public read access to comment_likes"
on public.comment_likes
for select
to anon, authenticated
using (true);

drop policy if exists "Insert own comment_likes" on public.comment_likes;
create policy "Insert own comment_likes"
on public.comment_likes
for insert
to anon, authenticated
with check (
  (auth.uid() is not null and auth.uid()::text = session_id)
  or (auth.uid() is null and not public.is_registered_user_id(session_id))
);

drop policy if exists "Delete own comment_likes" on public.comment_likes;
create policy "Delete own comment_likes"
on public.comment_likes
for delete
to anon, authenticated
using (
  (auth.uid() is not null and auth.uid()::text = session_id)
  or (auth.uid() is null and not public.is_registered_user_id(session_id))
);


-- ============================================================================
-- RECIPE_LIKES
-- В отличие от photo_likes/comment_likes, колонка называется user_id (не
-- session_id) и используется только в /api/like (сейчас не вызывается из
-- UI, но маршрут "живой" — теперь требует настоящий JWT, см. код route).
-- Гостям тут делать нечего — блокируем anon полностью.
-- ============================================================================
alter table public.recipe_likes enable row level security;

drop policy if exists "Public read access to recipe_likes" on public.recipe_likes;
create policy "Public read access to recipe_likes"
on public.recipe_likes
for select
to anon, authenticated
using (true);

-- recipe_likes.user_id хранится как text (не uuid) — приводим auth.uid() к тексту.
drop policy if exists "Insert own recipe_likes" on public.recipe_likes;
create policy "Insert own recipe_likes"
on public.recipe_likes
for insert
to authenticated
with check (auth.uid()::text = user_id);

drop policy if exists "Delete own recipe_likes" on public.recipe_likes;
create policy "Delete own recipe_likes"
on public.recipe_likes
for delete
to authenticated
using (auth.uid()::text = user_id);


-- ============================================================================
-- PARTY_MESSAGES
-- Пропустили эту таблицу при прошлой чистке party_items/party_members.
-- Модель та же: "шаринг по ссылке" — если знаешь party_id, можешь читать
-- и писать в чат этой комнаты (как и с party_items/party_members). Никакой
-- отдельной проверяемой личности гостя банкета нет, поэтому "владелец"
-- здесь — весь party_id целиком, а не конкретный user_id.
-- INSERT идёт напрямую с клиента (ClientRoom.tsx), поэтому его нельзя
-- полностью блокировать, как party_items — иначе сломаем чат.
-- ============================================================================
alter table public.party_messages enable row level security;

drop policy if exists "Allow read access to party_messages" on public.party_messages;
create policy "Allow read access to party_messages"
on public.party_messages
for select
to anon, authenticated
using (true);

drop policy if exists "Allow chat inserts to party_messages" on public.party_messages;
create policy "Allow chat inserts to party_messages"
on public.party_messages
for insert
to anon, authenticated
with check (party_id is not null and user_id is not null);

-- Сообщения никогда не редактируются и не удаляются напрямую с клиента —
-- очистка идёт каскадом через service role при удалении party
-- (app/actions/party.ts, childTables). Блокируем явно.
drop policy if exists "Block direct client party_messages updates" on public.party_messages;
create policy "Block direct client party_messages updates"
on public.party_messages
as restrictive
for update
to anon, authenticated
using (false);

drop policy if exists "Block direct client party_messages deletes" on public.party_messages;
create policy "Block direct client party_messages deletes"
on public.party_messages
as restrictive
for delete
to anon, authenticated
using (false);


-- ============================================================================
-- DAILY_RECIPES
-- Ни один текущий route/компонент к этой таблице не обращается ("блюдо дня"
-- на самом деле реализовано через unstable_cache в app/api/daily/route.ts,
-- без БД). Похоже на неиспользуемый / legacy-остаток. На всякий случай
-- закрываем полностью — если понадобится, откроете осознанно под
-- конкретную новую фичу.
-- ============================================================================
alter table public.daily_recipes enable row level security;
-- Политик не добавляем намеренно — это блокирует anon/authenticated
-- полностью, доступ только через service role.
