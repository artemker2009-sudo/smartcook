# PR B — realtime-синхронизация семейного списка покупок

Статус: **ЭТАП 1 (разведка + план). Код не писался, миграция не писалась.**
Ветка: `feature/shopping-realtime`.

---

## 1. Что уже есть (разведка, read-only)

### 1.1 Хранение списков покупок сегодня

Всё в localStorage, без БД (см. память `shopping-list-mvp`):

- `lib/shoppingList.ts` — примитивы: `ShoppingItem{id,name,checked}`, санитайз имени
  (`sanitizeShoppingName`, ≤50 симв., без control-символов), дедуп (`sameName`),
  лимит `MAX_SHOPPING_ITEMS=60`, сборка групп для умной сортировки.
- `lib/shoppingLists.ts` — «Покупки 2.0»: мультисписки в ключе
  `smartcook_shopping_lists_v2`, каждый список — `ShoppingListRecord{id,name,createdAt,items,sort}`.
  Разовая миграция из v1 при первом заходе.
- `components/ShoppingApp.tsx` — хаб (карточки списков + меню списка: переименовать
  /поделиться/удалить, [ShoppingApp.tsx:312](components/ShoppingApp.tsx:312)) →
  открывает `components/ShoppingListView.tsx` (редактор одного списка: ввод,
  голосовой ввод, умная сортировка, копирование, Купер-блок).
- Гостевая идентичность **для списков покупок отсутствует в принципе** —
  всё анонимно на устройстве, ничего не отправляется на сервер.

### 1.2 Шаринг списка сегодня

`lib/shoppingShare.ts` — список целиком кодируется в base64url в query-параметр
`?shared=`, БЕЗ БД и без сервера. Жёсткая санитизация при разборе (только
строки, ≤50 симв./позиция, ≤80 позиций). Это **не синхронизация**: получатель
получает статичный снимок один раз и создаёт у себя отдельную независимую копию
списка (`handleImportSave` в ShoppingApp.tsx). Изменения после импорта никак не
связаны между устройствами.

### 1.3 Прецедент realtime + шаринг по ссылке — комната банкета

`app/party/[id]/ClientRoom.tsx` — единственное реальное использование Supabase
Realtime в проекте:

- Один канал `room:${party.id}` (создаётся клиентом с **anon-ключом**, см.
  `lib/supabase.ts`), на нём — 6 `postgres_changes` подписок (INSERT/UPDATE/DELETE
  по `party_messages`/`party_members`/`party_items`/`parties`) + один
  `broadcast` (`paywall_alert`, [ClientRoom.tsx:909](app/party/[id]/ClientRoom.tsx:909)),
  который сервер не шлёт — его шлёт **сам клиент-инициатор** через тот же
  anon-канал ([party.ts serverside → нет; смотри clientRoom broadcast send дальше
  в файле]).
- Гостевая идентичность банкета — **не Supabase Auth.** `userId` генерируется на
  клиенте (`generateSafeUserId`, `crypto.randomUUID()` или fallback) и просто
  доверяется при записи через сервис-роль (см. `joinPartyAction` в
  `app/actions/party.ts`). Хранится в localStorage
  (`party_participant_<partyId>`), «участник» = строка в `party_members` с этим
  `user_id`.
- Все записи в `parties`/`party_members`/`party_items` идут ТОЛЬКО через
  server actions с `SUPABASE_SERVICE_ROLE_KEY`
  (`app/actions/party.ts`, `lib/supabaseAdmin.ts`) — память
  `party-writes-need-service-role`. RLS на этих таблицах
  (`supabase_party_members_rls.sql`) — **SELECT открыт всем** (`using(true)`,
  «доступ по ссылке» — кто угодно с id банкета читает всё), запись заблокирована
  для anon/authenticated (`with check(false)`), пишет только сервис-роль.
- **`postgres_changes` долетает до анонимного клиента только потому, что SELECT
  открыт `using(true)`.** Supabase Realtime фильтрует WAL-события через RLS той
  роли, которой подписан канал (здесь — anon). Это прямая причина, почему для
  задачи B нельзя скопировать эту RLS-модель один в один — основатель явно
  просит «никаких USING(true)» для семейного списка (более приватные данные,
  чем меню банкета, задуманное как публично-шаримое).
- Публикации `ALTER PUBLICATION supabase_realtime ADD TABLE …` в репозитории
  НЕТ ни для одной таблицы — значит либо Realtime включён на уровне схемы
  `public` глобально (дефолт для новых Supabase-проектов), либо переключён
  точечно тумблером в Dashboard (Table Editor → Realtime) вне репозитория.
  **Вывод: Realtime в проекте включён и реально работает в проде для party-таблиц;
  повторной активации/новой публикации для новых таблиц эта задача, скорее
  всего, не потребует — но это внешняя настройка, не код, поэтому пункт вынесен
  в открытые вопросы (§7).**

### 1.4 Паттерн серверных роутов с защитой (не через server actions)

`/api/shopping/sort/route.ts` — пример другого стиля (Route Handler, не server
action), который стоит взять за образец для новых shopping-роутов:
`isTrustedOrigin`/`originBlockedResponse` (`lib/originGuard.ts`, Origin/Referer
gate в проде), `getVerifiedUserId` (`lib/auth.ts`, JWT из `Authorization:
Bearer`, опционален — гость тоже разрешён), лимитер по IP+user
(`lib/rateLimit.ts`, таблица `ai_rate_limit_events`, RLS с нулём policy —
только сервис-роль читает/пишет), санитизация И лимиты **повторно проверяются
на сервере**, не доверяя клиенту.

### 1.5 Гостевая cookie-идентичность (лайки ленты) — для сравнения

`lib/guestSession.ts` — httpOnly `sc_guest`, ставится сервером только в момент
первого действия. Не подходит один-в-один для семейного списка: там задача —
не дать анониму зачесть лишний голос под чужим именем; здесь задача другая —
несколько РАЗНЫХ людей должны быть узнаваемыми участниками ОДНОГО списка
(нужна видимая идентичность «кто добавил», а не анти-фрод счётчик). Поэтому
модель ближе к party (`userId` в localStorage, доверяем на вставке через
сервис-роль), не к `sc_guest`.

---

## 2. Архитектурное решение

### 2.1 Ключевое отличие от party: RLS без `using(true)`

Party-модель осознанно открывает SELECT всем — банкетное меню задумано
публично-шаримым. Основатель для семейного списка прямо просит **владелец и
участники по membership, никаких `USING(true)`**. Но участники — анонимные
устройства без Supabase Auth (как в party), значит классический RLS-паттерн
`using(auth.uid() = ...)` не работает: у гостя нет JWT с `sub`.

**Решение: RLS блокирует ВСЁ (ноль policy для anon/authenticated, как у
`ai_rate_limit_events` — см. `supabase_rate_limits.sql`), а не пытается
закодировать membership в Postgres-policy.** Всё чтение и вся запись идут
ТОЛЬКО через серверные Route Handlers на сервис-роли; membership и права
(«владелец» vs «участник», кто вообще имеет доступ к списку) проверяются в
коде роута — так же, как party уже проверяет владельца перед
`updatePartyRoomSettingsAction`
([app/actions/party.ts:236](app/actions/party.ts:236)). Это строго СИЛЬНЕЕ,
чем «USING(true) + доверять серверу»: прямой REST-запрос к Supabase с anon-
ключом (`curl .../rest/v1/shared_list_items`) не отдаёт вообще ничего и не
пишет вообще ничего, в отличие от party, где такой curl сегодня свободно
читает весь список гостей/меню банкета.

### 2.2 Realtime без `postgres_changes` — через Broadcast

Раз RLS блокирует SELECT для anon, `postgres_changes` до анонимных участников
физически не долетит (Realtime фильтрует WAL-события через RLS роли
подписчика). Вместо этого — **Broadcast**, второй механизм Realtime, уже
используемый в проекте (`paywall_alert` в ClientRoom.tsx): это pub/sub поверх
канала, НЕ читает таблицы напрямую и не зависит от RLS/публикации таблицы.

Дизайн: после каждой успешной записи серверный роут (на сервис-роли) шлёт
`broadcast` в канал `shared-list:<listId>` с события `changed`
(лёгкий пейлоад: `{type: "items"|"members", updatedAt}`, БЕЗ самих данных).
Клиенты (владелец + все участники, у кого открыт список) подписаны на этот
канал anon-ключом ровно как ClientRoom уже делает. Получив `changed`, клиент
дергает `GET /api/shopping/shared/[id]` (тот же путь, что и при открытии
списка) и получает актуальный снимок с сервера.

**Почему пуш-пейлоада с данными, а не просто «changed» + refetch:**
(а) не нужно тащить через canale то же самое, что уже возвращает GET —
меньше рассинхрона форматов; (б) сервер остаётся единственным источником
истины, конфликты (два человека одновременно чиркнули один пункт) решаются
последней записью в БД, а не мержем на клиенте; (в) сильно проще и меньше
кода для конвейера, который нужно сдать за один заход. Плата — лишний
round-trip на каждое изменение (приемлемо: список продуктов, не чат).

**Почему не нужна миграция публикации Realtime:** Broadcast не завязан на
`ALTER PUBLICATION`/RLS вообще — значит новым `shared_*` таблицам не нужен
рубильник в Supabase Dashboard, только код. Значимое упрощение и снижение
риска относительно party-паттерна.

### 2.3 Один UUID = и id списка, и токен ссылки (без отдельного `join_token`)

Party использует id банкета прямо в URL шаринга (`/party/<uuid>`) как
единственный секрет — 122 бита энтропии UUIDv4 не перебираются. Для
семейного списка предлагаю тот же приём: `shared_lists.id` (UUIDv4) и есть
токен приглашения, ссылка — `smart-cook.pro/shopping/join/<id>`. Отдельный
`join_token` добавил бы вторую опаску без реального прироста безопасности
(тот же порядок энтропии), но лишний код и лишнее поле для рассинхрона.
Если основатель хочет ротацию ссылки (закрыть доступ по старой ссылке, не
трогая сами данные) — это ровно причина завести отдельный `join_token`
(ротируемый), а `id` останется стабильным. См. открытый вопрос §7.1.

### 2.4 Сосуществование с локальными списками (фолбэк)

Локальные списки (`lib/shoppingLists.ts`, ключ `..._v2`) **не трогаем вообще**
— ни формат, ни поведение. Общий список — это НОВАЯ, полностью параллельная
сущность:

- Локальный указатель на «мои общие списки» —
  `smartcook_shared_shopping_lists_v1` в localStorage:
  `[{id, name, memberRef, role: "owner"|"member", joinedAt}]`. Не хранит сами
  позиции — только «я состою в этом списке», для рендера хаба и для того,
  чтобы не потерять список при офлайне до первого успешного `GET`.
- Персональная идентичность участника — как у party:
  `smartcook_shared_member_<listId>` = `{memberRef, name}`, `memberRef`
  генерируется на клиенте (`crypto.randomUUID()`), сервер доверяет ему на
  вставке (та же модель доверия, что у party — не сильнее и не слабее).
- Хаб (`ShoppingApp.tsx`) получает новую секцию «Семейные списки» РЯДОМ с
  существующими карточками (не вместо). Кнопка «Сделать общим» — новый пункт
  в существующем нижнем листе меню списка
  ([ShoppingApp.tsx:313-330](components/ShoppingApp.tsx:313)), между
  «Поделиться» и «Удалить». По нажатию: копирует текущие позиции локального
  списка как стартовый набор на сервер (**не удаляет и не мутирует локальный
  список** — он остаётся как был, ровно требование ТЗ), открывает экран
  приглашения со ссылкой.

---

## 3. Схема БД (для отдельного файла на Этапе 2)

```
shared_lists
  id            uuid primary key default gen_random_uuid()
  name          text not null                    -- sanitizeListName, ≤60 симв.
  owner_ref     text not null                     -- memberRef создателя
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

shared_list_members
  id              uuid primary key default gen_random_uuid()
  shared_list_id  uuid not null references shared_lists(id) on delete cascade
  member_ref      text not null                   -- client-generated uuid, как party.user_id
  member_name     text not null                   -- sanitizeShoppingName-класс санитайза, ≤50
  joined_at       timestamptz not null default now()
  unique (shared_list_id, member_ref)

shared_list_items
  id              uuid primary key default gen_random_uuid()
  shared_list_id  uuid not null references shared_lists(id) on delete cascade
  name            text not null                   -- sanitizeShoppingName, ≤50
  checked         boolean not null default false
  created_by      text                            -- member_ref, nullable
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now()
```

Индексы: `shared_list_members(shared_list_id)`, `shared_list_items(shared_list_id)`.
Лимит позиций на список — `MAX_SHOPPING_ITEMS` (60, тот же импорт из
`lib/shoppingList.ts`), проверяется в коде роута перед INSERT — без триггера в
БД (по аналогии с `/api/shopping/sort`, не с party-триггером лимита гостей:
там триггер был нужен из-за конкурентных INSERT от РАЗНЫХ клиентов напрямую
в БД; здесь запись только через один серверный роут, гонки нет смысла ловить
триггером).

### RLS

```sql
alter table public.shared_lists enable row level security;
alter table public.shared_list_members enable row level security;
alter table public.shared_list_items enable row level security;
-- Ни одной policy ни для anon, ни для authenticated — блокирует ВСЁ.
-- Единственный писатель/читатель — сервис-роль (Route Handlers), она
-- обходит RLS. Как ai_rate_limit_events (supabase_rate_limits.sql).
```

### Curl-приёмка (внизу файла миграции, основатель прогоняет руками)

```bash
# 1) SELECT анон-ключом -> пусто (RLS блокирует, не 403, а честный [])
curl -s "$SUPABASE_URL/rest/v1/shared_lists?select=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
# ожидание: []

# 2) INSERT анон-ключом -> отклонено RLS (42501 / permission denied)
curl -s -X POST "$SUPABASE_URL/rest/v1/shared_lists" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","owner_ref":"x"}'
# ожидание: ошибка row-level security policy, НЕ 201

# 3) Таблицы без кода безвредны: пока нет серверных роутов, эти таблицы
#    недостижимы вообще ни для кого, кроме прямого доступа в Supabase Dashboard.
```

---

## 4. Серверные роуты (Этап 3, для справки уже сейчас — что именно писать)

Все — Route Handlers (не server actions, по прямому указанию ТЗ «через
серверные роуты», плюс так проще навесить `isTrustedOrigin`/rate-limit по
образцу `/api/shopping/sort`). Все на `createServiceRoleClient()`.

| Роут | Метод | Действие | Лимиты |
|---|---|---|---|
| `/api/shopping/shared` | POST | создать список (имя + стартовые позиции + owner memberRef/name) | новый лимитер `shshop:create`, час/день по IP+ref |
| `/api/shopping/shared/[id]` | GET | снимок списка+позиций+участников. Без memberRef в запросе — только `{name, itemCount}` (превью для экрана приглашения, БЕЗ содержимого — п. 2.1); с валидным memberRef-участником — полный снимок | `shshop:read`, мягкий, по IP |
| `/api/shopping/shared/[id]/join` | POST | вступить (имя → member_ref) | переиспользовать `checkAndConsumeAuthRateLimit`-класс лимита, отдельный префикс `shshop:join` |
| `/api/shopping/shared/[id]/items` | POST | добавить позиции (санитайз+дедуп+лимит 60, как `addNames`) | `shshop:write`, минутное окно как `checkAndConsumeFeedLikeRateLimit` |
| `/api/shopping/shared/[id]/items/[itemId]` | PATCH | чиркнуть/вернуть (`checked`) | `shshop:write` |
| `/api/shopping/shared/[id]/items/[itemId]` | DELETE | удалить позицию | `shshop:write` |

Каждый мутирующий роут ПОСЛЕ успешной записи: (1) обновляет
`shared_lists.updated_at`, (2) шлёт broadcast `changed` в канал
`shared-list:<id>` через `createServiceRoleClient()` (сервис-роль тоже может
слать broadcast — не нужен anon-канал на сервере).

Санитизация — переиспользуем `sanitizeShoppingName`/`sanitizeListName`/
`MAX_SHOPPING_ITEMS`/`MAX_SHOPPING_ITEM_LENGTH` из `lib/shoppingList.ts` и
`lib/shoppingLists.ts` один в один, НЕ дублируем константы (тот же принцип,
что уже действует между `/api/shopping/sort` и клиентом).

`memberRef`/`name` в теле запроса — client-generated, не проверяются токеном
(как party `userId`). Осознанно то же доверие, что уже принято в проекте для
анонимных участников; сильнее делать смысла нет без полноценной регистрации
каждого гостя.

---

## 5. Клиентский код (Этап 3, ориентир по разбивке)

Новые файлы (локальные списки не трогаем — ни строчки в
`lib/shoppingList.ts`/`lib/shoppingLists.ts`):

- `lib/sharedShoppingList.ts` — client-side: чтение/запись localStorage-
  указателей (`smartcook_shared_shopping_lists_v1`,
  `smartcook_shared_member_<id>`), обёртки `fetch` над роутами §4, форматтеры.
- `lib/sharedShoppingQueue.ts` — офлайн-очередь: при неудачном/офлайн fetch —
  мутация складывается в `smartcook_shared_pending_<listId>` (localStorage,
  переживает перезагрузку), список изменений применяется оптимистично к UI
  сразу; на событие `window.addEventListener("online", ...)` или при
  следующем успешном запросе — очередь дошивается по порядку, затем полный
  `GET` для сверки с сервером. Баннер офлайна — `navigator.onLine` +
  `online`/`offline` listeners (в проекте такого паттерна ещё не было, пишем
  с нуля, просто и без библиотек).
- `components/SharedShoppingListView.tsx` — экран одного общего списка:
  переиспользует вёрстку/интеракции `ShoppingListView.tsx` насколько можно
  (тот же чек-лист, ввод, голосовой ввод — voice остаётся чисто клиентским,
  просто зовёт серверный `addItems` вместо локального `onItemsChange`), плюс
  подписка на broadcast-канал, плюс баннер офлайна, плюс список участников.
- `components/SharedShoppingJoin.tsx` — экран приглашения (превью
  имя+кол-во позиций → форма «ваше имя» → join → редирект в
  `SharedShoppingListView`).
- Правки существующих файлов: `components/ShoppingApp.tsx` — секция «Семейные
  списки» в хабе + пункт «Сделать общим» в `sl-sheet` меню; новый роут
  `app/shopping/join/[id]/page.tsx` (или query-параметр, решить в Этапе 3) для
  ссылки приглашения.

---

## 6. Цели Метрики

`shopping_shared_created` (после успешного создания), `shopping_shared_joined`
(после успешного join), `shopping_shared_check` (после чирка позиции в общем
списке — по аналогии с `shopping_item_added` для локального). Добавление
позиции и офлайн-баннер новых целей в ТЗ не просили — не добавляю самовольно
(см. открытый вопрос §7.4).

---

## 7. Открытые вопросы к основателю (нужен ответ до «ок» на Этап 2)

1. **Ротация ссылки-приглашения.** §2.3: id списка = токен. Ок как в party,
   или нужен отдельный `join_token`, который можно перевыпустить, не трогая
   сам список (например, если ссылку случайно запостили в общий чат)? Если
   нужна ротация — добавляю поле в схему сейчас, это дешевле сделать до
   миграции, чем после.
2. **Превью до вступления.** §4: GET без memberRef отдаёт только имя+кол-во
   позиций, не сам список (следствие «доступ по ссылке-токену» + «никаких
   USING(true)» — токен даёт право вступить, а не право читать содержимое
   молча). Устраивает, или превью должно показывать сами позиции ещё до
   ввода имени?
3. **Realtime-публикация для party уже включена вне репо** (§1.3) — но новым
   таблицам она не нужна благодаря Broadcast-дизайну (§2.2). Всё равно стоит
   заранее подтвердить в Supabase Dashboard, что Realtime (Broadcast) для
   проекта не выключен глобально — это разовая ручная проверка на Этапе 2
   параллельно с прогоном миграции, не код.
4. Нужна ли метрика-цель на добавление позиции в общий список
   (`shopping_shared_item_added`) сверх трёх названных в ТЗ, или осознанно
   не считаем отдельно от `shopping_item_added`?

Если ответ не придёт до начала Этапа 3 — иду по дефолтам, которые уже заложены
в этот план (без ротации токена, урезанное превью, без 4-й цели), и это будет
явно отмечено в PR как предположение, а не тихое решение.

---

## 8. Приёмка (напоминание из ТЗ, не менять без ведома основателя)

Обязательно с ДВУХ устройств (iPhone + Android):
- галочка на одном → появляется на втором без обновления страницы;
- добавление позиции — так же;
- вступление по ссылке работает;
- локальные списки не изменились (ни разу не тронуты кодом Этапа 3).

**Железное правило мержа:** только полная зелёная приёмка с двух устройств И
запас ≥45 минут на финальный смоук. Не сошлось — ветка `feature/shopping-realtime`
и этот план остаются в репозитории как есть, Этап 3 доисполняется 18.08 по
написанному здесь. Полусмерженного не будет.

---

## 9. Порядок дальнейших шагов

1. **СТОП здесь.** Ждём «ок» на этот план (и ответы на §7, если будут).
2. Этап 2: отдельный файл `supabase_shared_shopping_lists.sql` — таблицы +
   RLS (§3) + curl-приёмка внизу файла. Основатель прогоняет в SQL Editor
   руками. Таблицы без кода безвредны. СТОП.
3. Этап 3: код по §4–6, поверх существующего, opt-in, локальные списки не
   трогаются. Приёмка по §8.
