import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { generateRecipeImage, generateDishCacheImage, COST_PER_IMAGE_USD } from "@/lib/recipeImage";
import { normalizeQueryKey } from "@/lib/queryNormalize";

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

  // Последние N картинок каждого источника (recipes этапа 1 + dish_cache этапа 2).
  const GALLERY_LIMIT = 300;

  // Рецепты С картинкой. recipes — это личная история поиска (одна строка на
  // каждый поиск), поэтому популярное блюдо имеет много строк, и несколько из
  // них могут ссылаться на одну и ту же картинку. Дедуп по нормализованному
  // названию ниже сводит блюдо к ОДНОЙ карточке.
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

  // Множество нормализованных блюд, у которых УЖЕ есть картинка (обе системы).
  // По нему: (а) фильтруем кандидатов на генерацию — блюдо не получает вторую
  // картинку никогда; (б) считаем счётчик «Блюд с картинкой».
  const dishesWithImage = new Set<string>();
  for (const r of recipeRows ?? []) {
    if (r.image_url) {
      const key = normalizeQueryKey(r.title as string);
      if (key) dishesWithImage.add(key);
    }
  }
  for (const d of dishRows ?? []) {
    if (d.image_url) {
      const key = normalizeQueryKey(d.display_title as string);
      if (key) dishesWithImage.add(key);
    }
  }

  // Кандидаты на генерацию: строки recipes без картинки, порядок «популярные →
  // новые». Берём пул с запасом, затем дедуплицируем по нормализованному блюду
  // и выкидываем блюда, у которых картинка уже есть (в любой системе) — так одно
  // блюдо получает картинку ровно один раз. Рецепт дня в БД строки не имеет.
  const CANDIDATE_POOL = 300;
  const { data: candidatePool, error: candError } = await supabase
    .from("recipes")
    .select("id, title, likes_count, created_at")
    .is("image_url", null)
    .order("likes_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL);

  if (candError) {
    return NextResponse.json({ error: candError.message }, { status: 500 });
  }

  const candidates: { id: number; title: string; likes_count: number | null; created_at: string }[] = [];
  const seenCandidateDishes = new Set<string>();
  for (const c of candidatePool ?? []) {
    const key = normalizeQueryKey(c.title as string);
    // блюдо уже с картинкой — не генерируем вторую
    if (key && dishesWithImage.has(key)) continue;
    // дедуп внутри пула кандидатов: одно блюдо = один кандидат. Пустое название
    // не схлопываем (иначе разные «безымянные» строки слиплись бы в одну).
    const dedupKey = key || `id:${c.id}`;
    if (seenCandidateDishes.has(dedupKey)) continue;
    seenCandidateDishes.add(dedupKey);
    candidates.push({
      id: c.id as number,
      title: (c.title as string) || "",
      likes_count: (c.likes_count as number | null) ?? null,
      created_at: c.created_at as string,
    });
    if (candidates.length >= MAX_BATCH) break;
  }

  // Галерея: одна карточка на нормализованное блюдо из ОБЕИХ систем. При
  // коллизии оставляем «лучшую» строку: с картинкой > без; при равенстве —
  // dish_cache (канонический дедуп) > recipes; затем более новую.
  type GalleryEntry = {
    source: "recipe" | "dish";
    id: number;
    title: string;
    image_url: string | null;
    status: "none" | "generating" | "ready" | "failed";
    created_at: string;
  };
  const recipeEntries: GalleryEntry[] = (recipeRows ?? []).map((r) => ({
    source: "recipe",
    id: r.id as number,
    title: (r.title as string) || "",
    image_url: (r.image_url as string | null) ?? null,
    // У recipes нет колонки статуса: есть картинка → ready, нет → none.
    status: r.image_url ? "ready" : "none",
    created_at: r.created_at as string,
  }));
  const dishEntries: GalleryEntry[] = (dishRows ?? []).map((d) => ({
    source: "dish",
    id: d.id as number,
    title: (d.display_title as string) || "",
    image_url: (d.image_url as string | null) ?? null,
    status: (d.image_status as "none" | "generating" | "ready" | "failed") ?? "none",
    created_at: d.created_at as string,
  }));

  const hasImg = (e: GalleryEntry) => !!e.image_url;
  const pickBetter = (a: GalleryEntry, b: GalleryEntry): GalleryEntry => {
    if (hasImg(a) !== hasImg(b)) return hasImg(a) ? a : b;
    if (a.source !== b.source) return a.source === "dish" ? a : b;
    return a.created_at >= b.created_at ? a : b;
  };

  const byDish = new Map<string, GalleryEntry>();
  // dish первыми, чтобы при прочих равных выигрывал канонический источник.
  for (const e of [...dishEntries, ...recipeEntries]) {
    // Пустое название не схлопываем: ключ уникален по источнику+id.
    const key = normalizeQueryKey(e.title) || `${e.source}:${e.id}`;
    const prev = byDish.get(key);
    byDish.set(key, prev ? pickBetter(prev, e) : e);
  }

  const gallery = [...byDish.values()]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    // created_at нужен только для дедупа/сортировки — наружу не отдаём.
    .map(({ created_at, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars

  return NextResponse.json({
    // Уникальные нормализованные блюда, у которых есть картинка (обе системы).
    dishesWithImageCount: dishesWithImage.size,
    candidates,
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
