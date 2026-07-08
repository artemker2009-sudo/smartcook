import type { Metadata } from "next";
import Link from "next/link";
import SharedRecipe from "@/components/SharedRecipe";
import type { RecipeData } from "@/lib/types";

// Выделенный маршрут расшаренного рецепта (задача T, P0). Раньше share-ссылка
// вела на /search?recipeId=… — это монтировало ВЕСЬ SearchApp (~800 КБ JS,
// история/профиль/лента) за пустым экраном (Suspense fallback=null), и рецепт
// появлялся только после гидрации + клиентского запроса. На Fast 3G это ~20 сек.
// Здесь рецепт читается ОДНИМ серверным запросом и попадает в HTML сразу; бандл
// маршрута — только SharedRecipe, а не монолит. Пока сервер читает — loading.tsx
// показывает скелет рецепта.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

// Публичное чтение recipes разрешено RLS (supabase_recipes_social_rls.sql).
// ВАЖНО (CLAUDE.md, чек-лист): выбираем ТОЛЬКО поля для отображения, без select=*.
// В recipes есть session_id (по инциденту №2 — фактически токен доступа) и user_id —
// они НЕ должны утекать в SSR-пейлоад страницы.
const RECIPE_FIELDS =
  "id,title,description,time,calories,steps,ingredients,detailed_ingredients,missing_ingredients,estimated_cost,delivery_cost,budget_tier";

// revalidate=60 — рецепт неизменен, кэшируем на edge: повторные открытия мгновенны.
async function getRecipe(id: string): Promise<RecipeData | null> {
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/recipes?select=${RECIPE_FIELDS}&id=eq.${id}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: "application/vnd.pgrst.object+json",
        },
        next: { revalidate: 60 },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.title ? (data as RecipeData) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) return { title: "Рецепт — SmartCook" };
  const title = `${recipe.title} — рецепт из SmartCook`;
  const description =
    recipe.description ||
    "Рецепт, подобранный нейро-шефом SmartCook по вашим продуктам.";
  return {
    title,
    description,
    openGraph: { title, description, type: "article", siteName: "SmartCook" },
  };
}

export default async function SharedRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);

  if (!recipe) {
    return (
      <div className="container">
        <div className="card" style={{ marginTop: "var(--space-5)", textAlign: "center" }}>
          <h1 className="recipe-title" style={{ marginBottom: "var(--space-2)" }}>
            Рецепт не найден
          </h1>
          <p style={{ color: "var(--color-text-secondary)", marginBottom: "var(--space-4)" }}>
            Возможно, ссылка устарела. Но вы легко получите свой рецепт.
          </p>
          <Link href="/search?focus=photo" className="btn-primary" style={{ display: "inline-flex", width: "auto" }}>
            Подобрать рецепт
          </Link>
        </div>
      </div>
    );
  }

  return <SharedRecipe recipe={recipe} />;
}
