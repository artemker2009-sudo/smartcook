import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import {
  COST_PER_IMAGE_USD,
  IMAGE_DAILY_LIMIT,
  IMAGE_MODEL,
  IMAGE_QUALITY,
  generateIdeaImage,
} from "@/lib/recipeImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ОДНА КАРТИНКА ЗА ЗАПРОС, и лимит функции сильно больше минуты.
//
// Замер на боевой модели: gpt-image-2, medium, вертикаль 1024x1536 — 63
// секунды. С прежним maxDuration = 60 запрос убивали бы ровно на середине
// генерации: деньги списаны, картинки нет, в базе навсегда висит generating.
// Батч в админке идёт последовательно по одной, поэтому длинный лимит нужен
// на ОДНУ генерацию, а не на тридцать.
export const maxDuration = 300;

// GET: состояние раздела для админки — сколько рецептов без картинки, сколько
// сгенерировано сегодня и во что это обошлось.
export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Счётчик суточного лимита — та же строка, что резервирует
  // reserve_image_generation. Считаем по нему, а не по своим рецептам:
  // лимит общий на проект, и человеку в админке важно видеть ОБЩИЙ остаток,
  // иначе батч упрётся в стену без объяснений.
  const today = new Date().toISOString().slice(0, 10);
  const { data: counter } = await supabase
    .from("image_gen_counter")
    .select("count")
    .eq("day", today)
    .maybeSingle<{ count: number }>();

  const generatedToday = counter?.count ?? 0;

  return NextResponse.json({
    model: IMAGE_MODEL,
    quality: IMAGE_QUALITY,
    dailyLimit: IMAGE_DAILY_LIMIT,
    generatedToday,
    remainingToday: Math.max(0, IMAGE_DAILY_LIMIT - generatedToday),
    costPerImageUsd: COST_PER_IMAGE_USD,
    // ОЦЕНКА СВЕРХУ, не факт: счётчик знает число зарезервированных слотов, а
    // слот резервируется ДО вызова модели — значит в него попадают и неудачные
    // попытки. Имя поля говорит это прямо, чтобы никто не принял его за
    // потраченную сумму.
    spentAtMostTodayUsd: Number((generatedToday * COST_PER_IMAGE_USD).toFixed(2)),
  });
}

// POST: сгенерировать картинку ОДНОМУ рецепту. force = перегенерация поверх
// существующей (это деньги, поэтому подтверждение — на стороне админки).
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const { id, force } = body as { id?: unknown; force?: unknown };
  if (typeof id !== "string" || !id.trim()) {
    return NextResponse.json({ error: "Не хватает ID" }, { status: 400 });
  }

  const result = await generateIdeaImage(id, { force: force === true });

  if (!result.ok) {
    // Исчерпанный суточный лимит — не ошибка сервера, а ожидаемое состояние:
    // 429 позволяет админке остановить батч и сказать об этом человеку, а не
    // показывать «что-то пошло не так» тридцать раз подряд.
    return NextResponse.json(
      { error: result.error },
      { status: result.limited ? 429 : 500 },
    );
  }

  return NextResponse.json({
    success: true,
    image_url: result.image_url,
    costUsd: Number(result.costUsd.toFixed(4)),
  });
}
