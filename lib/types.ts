export interface AnalysisData {
  ingredients: string[];
  dishes: string[];
}

export interface DetailedIngredient {
  name: string;
  amount: string;
}

export interface RecipeData {
  id?: number;
  is_favorite?: boolean;
  title: string;
  description?: string;
  time: string;
  // Общая оценка времени приготовления в минутах (подготовка + готовка).
  // null/undefined у старых рецептов — UI тогда ничего не показывает.
  cooking_time_minutes?: number | null;
  calories?: string;
  // Публичная ссылка на сгенерированную ИИ картинку блюда (бакет recipe-images).
  // null/undefined — картинки нет, UI ничего не показывает.
  image_url?: string | null;
  steps: string[];
  missing_ingredients?: string[];
  ingredients?: string[];
  detailed_ingredients?: DetailedIngredient[];
  estimated_cost?: number;
  delivery_cost?: number;
  budget_tier?: number;
  // Этап 2 (кэш блюд): id записи dish_cache и статус фоновой генерации картинки.
  // Заполняются только для результатов текстового поиска типа B без профиля
  // вкуса; для остальных сценариев undefined.
  dish_cache_id?: number;
  image_status?: "none" | "generating" | "ready" | "failed";
  variant_index?: number;
}

export interface DBRecipe {
  id: number;
  title: string;
  time: string;
  cooking_time_minutes?: number | null;
  calories?: string;
  image_url?: string | null;
  is_favorite: boolean;
  created_at: string;
  steps: string[];
  ingredients: string[];
  detailed_ingredients?: DetailedIngredient[];
  missing_ingredients?: string[];
  description?: string;
  session_id: string;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  custom_title?: string;
  user_id?: string;
  user_avatar?: string;
  user_name?: string;
  estimated_cost?: number;
  delivery_cost?: number;
  budget_tier?: number;
}

export interface DailyRecipeType {
  title: string;
  description?: string;
  time: string | number;
  cooking_time_minutes?: number | null;
  calories: string | number;
  ingredients?: string[];
  detailed_ingredients?: DetailedIngredient[];
  missing_ingredients?: string[];
  steps: string[];
  date?: string;
  error?: string;
  estimated_cost?: number;
  delivery_cost?: number;
  budget_tier?: number;
}

export interface HolidayType {
  title: string;
  text: string;
  gradient: string;
  icon: string;
}

export interface DBComment {
  id: number;
  post_id: number;
  user_id: string;
  user_name: string;
  user_avatar?: string;
  text: string;
  created_at: string;
  parent_id?: number | null;
  likes_count?: number;
  is_liked?: boolean;
}
