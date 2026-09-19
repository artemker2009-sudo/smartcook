// Единый список колонок public.recipes, которые разрешено читать клиенту.
//
// Здесь НЕТ session_id — и это главное. Колонка закрыта поколоночной
// привилегией (supabase_recipes_session_id_privacy.sql), поэтому любой
// select('*') по recipes из-под anon/authenticated теперь падает с 42501
// «permission denied for column session_id». Список нужен, чтобы такие запросы
// писались одинаково во всех точках и не разъезжались.
//
// Перечислены ТОЛЬКО реально существующие в таблице колонки. В lib/types.ts у
// DBRecipe есть поля, которых в схеме нет (custom_title, user_id, user_name,
// user_avatar, comments_count, estimated_cost, delivery_cost, budget_tier) —
// PostgREST на несуществующую колонку отдаёт 400, и рецепт «пропадает». Если
// добавляете колонку в таблицу — добавьте её и сюда, и в grant в SQL-файле.
//
// Своя история («Мои рецепты») читается НЕ этим списком, а функцией
// recipes_for_session: фильтровать по session_id клиент тоже больше не может —
// для фильтра нужна привилегия на колонку.
export const RECIPE_CLIENT_COLUMNS = [
  "id",
  "created_at",
  "title",
  "description",
  "time",
  "cooking_time_minutes",
  "calories",
  "image_url",
  "steps",
  "ingredients",
  "detailed_ingredients",
  "missing_ingredients",
  "is_favorite",
  "likes_count",
].join(",");
