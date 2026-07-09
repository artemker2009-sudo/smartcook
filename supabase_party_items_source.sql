-- Источник блюда банкета (задача: не терять ручные блюда при перегенерации меню).
--
-- Проблема: /api/party/generate при перегенерации удалял ВСЕ party_items и
-- заменял ответом ИИ — тихо стирая блюда, которые гости/организатор добавили
-- руками (addPartyItemAction). Чтобы удалять только ИИ-блюда, нужен признак
-- источника: 'ai' — сгенерировано нейросетью, 'manual' — добавлено человеком.
--
-- Аддитивная миграция: одна NOT NULL колонка с DEFAULT 'manual' и CHECK на
-- допустимые значения. Существующие строки получают 'manual' по умолчанию —
-- это осознанный выбор: в старых банкетах ИИ-блюда тоже станут 'manual', и
-- при следующей перегенерации не удалятся (появится дубликат). Дубликат в
-- тестовом банкете безопаснее, чем удаление чьего-то настоящего ручного блюда.
--
-- RLS НЕ трогаем: колонка автоматически наследует политики таблицы
-- party_items (см. supabase_party_members_rls.sql). Прямые клиентские записи
-- по-прежнему заблокированы, всё пишется через service-role
-- (addPartyItemAction ставит 'manual', /api/party/generate ставит 'ai').
--
-- Как применить (Supabase -> SQL Editor):
--   1. Открыть проект в Supabase, вкладка SQL Editor -> New query.
--   2. Вставить весь этот файл, нажать Run.
--   3. Проверить, что колонка появилась (запрос ниже вернёт одну строку):
--        select column_name, data_type, is_nullable, column_default
--        from information_schema.columns
--        where table_name = 'party_items' and column_name = 'source';
--
-- IF NOT EXISTS + DROP/ADD CONSTRAINT — идемпотентно, повторный запуск безопасен.

alter table public.party_items
  add column if not exists source text not null default 'manual';

alter table public.party_items
  drop constraint if exists party_items_source_check;

alter table public.party_items
  add constraint party_items_source_check check (source in ('ai', 'manual'));

comment on column public.party_items.source is
  'Источник блюда: ''ai'' — сгенерировано нейросетью (удаляется/заменяется при перегенерации), ''manual'' — добавлено человеком (сохраняется). DEFAULT ''manual''.';
