import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { generateRecipeImage, generateDishCacheImage, COST_PER_IMAGE_USD } from "@/lib/recipeImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Генерация одной картинки может занять 20–40 с. Одна генерация на запрос
// (клиент в админке гонит батч последовательно, по одному) → укладываемся в
// лимит функции и показываем прогресс.
export const maxDuration = 60;

// Максимум за один запуск батча (защита от случайного слива бюджета).
const MAX_BATCH = 30;

// GET: статус для админки — сколько рецептов без картинки, кандидаты на
// генерацию (в нужном порядке) и последние рецепты С картинкой (для
// перегенерации). Всё только через service_role за админ-сессией.
export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Точное число рецептов без картинки.
  const { count, error: countError } = await supabase
    .from("recipes")
    .select("id", { count: "exact", head: true })
    .is("image_url", null);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  // Кандидаты: порядок «популярные → новые». Рецепт дня отдельной строки в БД
  // не имеет (эфемерный) — в этот список он не попадает by design.
  const { data: candidates, error: candError } = await supabase
    .from("recipes")
    .select("id, title, likes_count, created_at")
    .is("image_url", null)
    .order("likes_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(MAX_BATCH);

  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  // Общая галерея ИИ-картинок из ОБОИХ источников: recipes (этап 1) и
  // dish_cache (этап 2). Отдаём последние N каждого источника — для админ-
  // просмотра/поиска/перегенерации. Поиск и фильтры — на клиенте.
  const GALLERY_LIMIT = 300;

  // ВАЖНО: из recipes берём ТОЛЬКО строки С картинкой. recipes — это личная
  // история поиска (одна строка на каждый поиск каждого пользователя), поэтому
  // популярные блюда без картинки повторяются десятками одинаковых карточек и
  // затапливают галерею. Такие строки — не «ИИ-картинки», а история людей
  // (удалять их нельзя). Дедуплицированный набор блюд с картинками живёт в
  // dish_cache; сюда из recipes пускаем только реальные картинки этапа 1.
  const { data: recipeRows, error: recError } = await supabase
    .from("recipes")
    .select("id, title, image_url, created_at")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(GALLERY_LIMIT);

  if (recError) {
    return NextResponse.json({ error: recError.message }, { status: 500 });
  }

  const { data: dishRows, error: dishError } = await supabase
    .from("dish_cache")
    .select("id, display_title, image_url, image_status, created_at")
    .order("created_at", { ascending: false })
    .limit(GALLERY_LIMIT);

  if (dishError) {
    return NextResponse.json({ error: dishError.message }, { status: 500 });
  }

  const gallery = [
    ...(recipeRows ?? []).map((r) => ({
      source: "recipe" as const,
      id: r.id as number,
      title: (r.title as string) || "",
      image_url: (r.image_url as string | null) ?? null,
      // У recipes нет колонки статуса: есть картинка → ready, нет → none.
      status: r.image_url ? ("ready" as const) : ("none" as const),
    })),
    ...(dishRows ?? []).map((d) => ({
      source: "dish" as const,
      id: d.id as number,
      title: (d.display_title as string) || "",
      image_url: (d.image_url as string | null) ?? null,
      status: (d.image_status as "none" | "generating" | "ready" | "failed") ?? "none",
    })),
  ];

  return NextResponse.json({
    withoutImageCount: count ?? 0,
    candidates: candidates ?? [],
    gallery,
    costPerImageUsd: COST_PER_IMAGE_USD,
    maxBatch: MAX_BATCH,
  });
}

// POST: сгенерировать/перегенерировать картинку для ОДНОГО элемента.
// Формы тела:
//   • { recipeId, force } — рецепт (обратная совместимость с батчем этапа 1);
//   • { source: "recipe"|"dish", id, force } — из общей галереи.
// Перегенерация обоих источников уважает суточный лимит IMAGE_DAILY_LIMIT
// (recipes — через generateRecipeImage, dish_cache — через generateDishCacheImage).
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const force = body?.force === true;
  const source: string | undefined = body?.source;

  // Картинка блюда из кэша (этап 2).
  if (source === "dish") {
    const dishId = Number(body?.id);
    if (!Number.isInteger(dishId) || dishId <= 0) {
      return NextResponse.json({ error: "Некорректный id блюда" }, { status: 400 });
    }
    // force:true — из галереи всегда именно перегенерация (заменить файл/URL).
    const result = await generateDishCacheImage(dishId, { force: true });
    return NextResponse.json(result);
  }

  // Рецепт (этап 1). id может прийти как recipeId (батч) или как {source:'recipe', id}.
  const recipeId = Number(body?.recipeId ?? body?.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "Некорректный recipeId" }, { status: 400 });
  }

  const result = await generateRecipeImage(recipeId, { force });
  // Даже при ok:false отвечаем 200 — это не сбой роута, а результат одной
  // генерации; клиент-батч продолжает со следующим рецептом.
  return NextResponse.json(result);
}
