import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { generateRecipeImage, COST_PER_IMAGE_USD } from "@/lib/recipeImage";

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

  // Последние рецепты С картинкой — для кнопок «Перегенерировать».
  const { data: withImage, error: wiError } = await supabase
    .from("recipes")
    .select("id, title, image_url")
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(24);

  if (wiError) {
    return NextResponse.json({ error: wiError.message }, { status: 500 });
  }

  return NextResponse.json({
    withoutImageCount: count ?? 0,
    candidates: candidates ?? [],
    withImage: withImage ?? [],
    costPerImageUsd: COST_PER_IMAGE_USD,
    maxBatch: MAX_BATCH,
  });
}

// POST: сгенерировать/перегенерировать картинку для ОДНОГО рецепта.
// body: { recipeId: number, force?: boolean }
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const recipeId = Number(body?.recipeId);
  const force = body?.force === true;

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return NextResponse.json({ error: "Некорректный recipeId" }, { status: 400 });
  }

  const result = await generateRecipeImage(recipeId, { force });
  // Даже при ok:false отвечаем 200 — это не сбой роута, а результат одной
  // генерации; клиент-батч продолжает со следующим рецептом.
  return NextResponse.json(result);
}
