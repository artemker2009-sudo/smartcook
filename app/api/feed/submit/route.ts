import { NextResponse } from "next/server";
import { getVerifiedUserId, createRequestScopedClient } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeFeedSubmitRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { sendModerationCard } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPTION_MAX = 300;
const TITLE_MAX = 200;
const NAME_MAX = 100;

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
// Пост можно создать только с фото из НАШЕГО публичного бакета feed_photos —
// иначе через photo_url в карточку модерации (и в ленту) можно было бы протащить
// произвольный внешний URL.
const PHOTO_URL_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/feed_photos/`;

// Санитизация текста: режем управляющие символы, схлопываем пробелы, обрезаем.
function clean(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

// Создание поста ленты. Владелец (user_ref) берётся ИЗ ПРОВЕРЕННОЙ СЕССИИ
// (auth.uid()), не из тела запроса. Пост создаётся в статусе 'pending' и не
// виден никому, кроме автора и админа, пока не одобрен. После вставки шлём
// карточку основателю в Telegram (путь модерации «б»).
export async function POST(req: Request) {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
  }

  const rate = await checkAndConsumeFeedSubmitRateLimit(req, userId);
  if (!rate.ok) return rateLimitResponse(rate);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
  if (!photoUrl || photoUrl.length > 1000 || !photoUrl.startsWith(PHOTO_URL_PREFIX)) {
    return NextResponse.json({ error: "Некорректное фото." }, { status: 400 });
  }

  const caption = clean(body.caption, CAPTION_MAX);
  const recipeTitle = clean(body.recipeTitle, TITLE_MAX) || null;
  const userName = clean(body.userName, NAME_MAX) || "Гость";

  // recipe_id — только целое положительное или null (recipes.id числовой).
  let recipeId: number | null = null;
  if (typeof body.recipeId === "number" && Number.isInteger(body.recipeId) && body.recipeId > 0) {
    recipeId = body.recipeId;
  }

  // Вставка через клиент с JWT пользователя → RLS сам гарантирует
  // user_ref = auth.uid() и status='pending'. Дублируем эти значения явно.
  const scoped = createRequestScopedClient(req);
  const { data, error } = await scoped
    .from("community_posts")
    .insert({
      user_ref: userId,
      user_name: userName,
      recipe_title: recipeTitle,
      recipe_id: recipeId,
      photo_url: photoUrl,
      caption: caption || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[feed/submit] insert failed", error?.message);
    return NextResponse.json({ error: "Не удалось опубликовать. Попробуйте позже." }, { status: 500 });
  }

  // Карточка на модерацию в Telegram — best-effort: пост уже в БД (pending) и
  // виден в админке, поэтому упавший Telegram не должен ронять запрос. При
  // успехе помечаем notified_at (service_role — у клиента нет UPDATE-политики).
  const sent = await sendModerationCard({
    postId: data.id,
    recipeTitle,
    userName,
    caption: caption || null,
    photoUrl,
  });
  if (sent) {
    const admin = createServiceRoleClient();
    await admin
      .from("community_posts")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", data.id);
  }

  // В ответе — только id созданного поста. Никаких чужих полей / user_ref.
  return NextResponse.json({ ok: true, id: data.id });
}
