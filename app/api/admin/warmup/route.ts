import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { isTextTooLong } from "@/lib/inputLimits";
import { normalizeQueryKey } from "@/lib/queryNormalize";
import { getCachedVariant, createDishCacheEntry } from "@/lib/dishCache";
import { generateDishRecipe } from "@/lib/dishGeneration";
import { generateDishCacheImage, COST_PER_IMAGE_USD } from "@/lib/recipeImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Один прогрев (рецепт + картинка) может занять 30–50 с. Клиент гонит список
// последовательно, по одному блюду за запрос (как батч картинок в этапе 1).
export const maxDuration = 60;

// GET: справочные данные для UI прогрева (стоимость, лимит за прогон).
export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ costPerImageUsd: COST_PER_IMAGE_USD, maxPerRun: 30 });
}

// POST: прогреть ОДНО блюдо. body: { dish: string }.
// Нормализуем → если вариант 1 уже в кэше, пропускаем; иначе генерируем рецепт
// (без профиля вкуса — кэш публичный) + картинку (синхронно, с учётом суточного
// лимита), пишем в кэш.
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const dish = typeof body?.dish === "string" ? body.dish.trim() : "";

  if (!dish || dish.length < 2) {
    return NextResponse.json({ dish, status: "skipped", reason: "empty" });
  }
  if (isTextTooLong(dish)) {
    return NextResponse.json({ dish, status: "skipped", reason: "too_long" });
  }

  const key = normalizeQueryKey(dish);
  if (!key) {
    return NextResponse.json({ dish, status: "skipped", reason: "empty" });
  }

  try {
    // Уже прогрето — не тратим бюджет повторно.
    const existing = await getCachedVariant(key, 1);
    if (existing) {
      return NextResponse.json({ dish, status: "skipped", reason: "exists" });
    }

    const raw = await generateDishRecipe(dish);
    const title = typeof raw?.title === "string" && raw.title.trim() ? raw.title : dish;

    const entry = await createDishCacheEntry(key, title, raw, "generating");
    if (!entry) {
      return NextResponse.json({ dish, status: "error", error: "cache write failed" });
    }

    // Картинка синхронно — сама уважает IMAGE_DAILY_LIMIT (при превышении вернёт
    // status 'none', рецепт всё равно в кэше и работает).
    const img = await generateDishCacheImage(entry.dishCacheId);

    return NextResponse.json({
      dish,
      status: "ok",
      dishCacheId: entry.dishCacheId,
      image: img.status, // ready | none | failed
    });
  } catch (err: any) {
    return NextResponse.json({ dish, status: "error", error: String(err?.message || err) });
  }
}
