import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IdeaRecipe from "@/components/IdeaRecipe";
import { FEATURE_IDEAS, IDEAS_INDEXABLE } from "@/lib/features";
import { siteUrl } from "@/lib/site";
import { IDEA_RECIPE_CATALOG_COLUMNS, toIdeaCard, type IdeaCard } from "@/lib/ideasFeed";
import {
  IDEA_RECIPE_COLUMNS,
  isValidIdeaSlug,
  toIdeaRecipe,
  type IdeaRecipeData,
} from "@/lib/ideaRecipe";
import { relatedIdeas } from "@/lib/ideasRelated";

// Экран рецепта каталога «Идеи».
//
// Читается ОДНИМ серверным запросом и попадает в HTML сразу — это и первый
// экран без ожидания, и og-превью, и разметка для поиска. Окно ревалидации 300
// секунд — то же, что у ленты; админские правка, публикация и удаление сверх
// того бьют по этому адресу через revalidatePath, поэтому вычитанный рецепт
// появляется сразу, а не через пять минут.
//
// ЧЕРНОВИК НЕ СУЩЕСТВУЕТ для этой страницы: фильтр is_published=eq.true стоит
// в самом запросе, поэтому неопубликованный рецепт и несуществующий slug дают
// один и тот же 404 — снаружи не отличить, есть у нас такой черновик или нет.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

const REVALIDATE_SECONDS = 300;

async function getRecipe(slug: string): Promise<IdeaRecipeData | null> {
  // Slug приходит из адреса. В запрос он попадает только после проверки
  // формата — иначе в строку PostgREST уедет что угодно.
  if (!isValidIdeaSlug(slug)) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/idea_recipes?select=${IDEA_RECIPE_COLUMNS}` +
        `&slug=eq.${slug}&is_published=eq.true&limit=1`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? toIdeaRecipe(data[0]) : null;
  } catch {
    return null;
  }
}

/**
 * Каталог для блоков «Другие варианты» и «Похожие идеи».
 *
 * Весь опубликованный каталог одним запросом: он маленький, запрос тот же, что
 * у ленты (значит тот же кэш на edge), а считать похожесть по тегам фильтрами
 * PostgREST — это три запроса вместо одного и логика, размазанная по строке
 * адреса.
 */
async function getCatalog(): Promise<IdeaCard[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/idea_recipes?select=${IDEA_RECIPE_CATALOG_COLUMNS}` +
        `&is_published=eq.true&order=sort_weight.desc,published_at.desc&limit=300`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map(toIdeaCard).filter((c): c is IdeaCard => c !== null);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  if (!FEATURE_IDEAS) return {};
  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) return { title: "Рецепт — SmartCook" };

  const title = `${recipe.title} — рецепт из SmartCook`;
  const description =
    recipe.description || "Рецепт из подборки SmartCook: что приготовить сегодня.";
  const url = siteUrl(`/ideas/${recipe.slug}`);
  // Размеры превью берём из пропорций самой картинки: у портретной 1024×1536,
  // и подставить сюда квадрат значит отдать мессенджеру неверный размер.
  const image = {
    url: recipe.imageUrl,
    width: 1024,
    height: recipe.imageAspect === "portrait" ? 1536 : 1024,
    alt: recipe.title,
  };

  return {
    title,
    description,
    alternates: { canonical: url },
    ...(IDEAS_INDEXABLE ? {} : { robots: { index: false, follow: false } }),
    openGraph: { title, description, type: "article", siteName: "SmartCook", url, images: [image] },
    // Telegram и WhatsApp читают og:*, но VK и X смотрят на twitter:*.
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

// Recipe-разметка schema.org. Правило то же, что на /recipe/[id]: включаем
// ТОЛЬКО реально присутствующие поля, ничего не выдумываем.
function buildJsonLd(recipe: IdeaRecipeData) {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    url: siteUrl(`/ideas/${recipe.slug}`),
    image: recipe.imageUrl,
    recipeYield: `${recipe.servings}`,
    recipeIngredient: recipe.ingredients
      .map((ing) => [ing.amount, ing.name].filter(Boolean).join(" ").trim())
      .filter(Boolean),
    recipeInstructions: recipe.steps.map((text) => ({ "@type": "HowToStep", text })),
  };
  if (recipe.description) jsonLd.description = recipe.description;
  if (recipe.cookingTimeMinutes > 0) jsonLd.totalTime = `PT${recipe.cookingTimeMinutes}M`;
  return jsonLd;
}

export default async function IdeaRecipePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!FEATURE_IDEAS) notFound();

  const { slug } = await params;
  const recipe = await getRecipe(slug);
  if (!recipe) notFound();

  const catalog = await getCatalog();
  const { family, similar } = relatedIdeas(recipe, catalog);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(recipe)) }}
      />
      <IdeaRecipe recipe={recipe} family={family} similar={similar} />
    </>
  );
}
