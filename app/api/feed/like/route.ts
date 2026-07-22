import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeFeedLikeRateLimit, likeRateLimitResponse } from "@/lib/rateLimit";
import { readGuestRef, newGuestRef, setGuestCookie } from "@/lib/guestSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Лайки ленты сообщества — единственный путь записи в community_post_likes.
//
// Почему через сервер, а не прямым supabase-запросом с клиента (как было):
//   * Лайк доступен БЕЗ регистрации. Дать анониму INSERT-политику в RLS нельзя —
//     тогда накрутка счётчика это один curl по публичному REST с anon-ключом.
//     Поэтому anon-политик нет, а роут пишет на service_role (обходит RLS).
//   * Личность гостя — из httpOnly-cookie, которую выдаёт сервер (lib/guestSession),
//     НЕ из тела запроса и НЕ из localStorage: иначе идентификатор перебирается.
//   * Здесь же живёт лимит по частоте и склейка гостевого лайка с аккаунтом.
// В ответе — только своё состояние (liked) и агрегат (likesCount). Ни чужих
// user_ref, ни guest_ref наружу не уходит.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";

type LikeRow = { id: string; user_ref: string | null; guest_ref: string | null };

async function countLikes(
  admin: ReturnType<typeof createServiceRoleClient>,
  postId: string,
): Promise<number> {
  const { count } = await admin
    .from("community_post_likes")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  return count ?? 0;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const postId = typeof body?.postId === "string" ? body.postId.trim() : "";
  if (!body || !UUID_RE.test(postId)) {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const wantLike = body.like !== false; // по умолчанию — поставить лайк

  // Личность: проверенный JWT либо гостевая cookie. Гостю, который пришёл без
  // cookie, выдаём её ЗДЕСЬ — то есть только в момент реального действия.
  const userId = await getVerifiedUserId(req);
  let guestRef = readGuestRef(req);
  let issueCookie = false;
  if (!guestRef) {
    guestRef = newGuestRef();
    issueCookie = true;
  }

  const rate = await checkAndConsumeFeedLikeRateLimit(
    req,
    userId ? `user:${userId}` : `guest:${guestRef}`,
  );
  if (!rate.ok) return likeRateLimitResponse(rate);

  const admin = createServiceRoleClient();

  // Лайкать можно только существующий ОДОБРЕННЫЙ пост: иначе через прямой вызов
  // роута можно было бы копить лайки на скрытых/отклонённых постах.
  const { data: post } = await admin
    .from("community_posts")
    .select("id")
    .eq("id", postId)
    .eq("status", "approved")
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: "Пост не найден" }, { status: 404 });
  }

  // Свои строки на этом посте: аккаунтная и/или гостевая.
  const filters = [`guest_ref.eq.${guestRef}`];
  if (userId) filters.push(`user_ref.eq.${userId}`);
  const { data: existingRaw } = await admin
    .from("community_post_likes")
    .select("id,user_ref,guest_ref")
    .eq("post_id", postId)
    .or(filters.join(","));
  const existing = (existingRaw ?? []) as LikeRow[];

  const myAccountRow = userId ? existing.find((r) => r.user_ref === userId) : undefined;
  const guestRow = existing.find((r) => r.guest_ref === guestRef);

  const respond = (liked: boolean, likesCount: number) => {
    const res = NextResponse.json({ ok: true, liked, likesCount });
    if (issueCookie) setGuestCookie(res, guestRef!);
    return res;
  };

  if (!wantLike) {
    if (userId) {
      // Свой аккаунтный лайк. Гостевую строку не трогаем — она может быть
      // чужой (тот же браузер, другой человек).
      await admin.from("community_post_likes").delete().eq("post_id", postId).eq("user_ref", userId);
    } else {
      // Гость снимает ТОЛЬКО гостевую строку без владельца-аккаунта: лайк,
      // «усыновлённый» аккаунтом, разлогиненный гость снять не может.
      await admin
        .from("community_post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("guest_ref", guestRef)
        .is("user_ref", null);
    }
    return respond(false, await countLikes(admin, postId));
  }

  // ---- Поставить лайк -------------------------------------------------------
  if (userId) {
    if (myAccountRow) {
      return respond(true, await countLikes(admin, postId)); // уже лайкнуто
    }
    if (guestRow && guestRow.user_ref === null) {
      // Тот же человек лайкал гостем, теперь вошёл → переносим лайк в аккаунт,
      // НЕ создавая вторую строку (счётчик не удваивается).
      await admin
        .from("community_post_likes")
        .update({ user_ref: userId })
        .eq("id", guestRow.id);
      return respond(true, await countLikes(admin, postId));
    }
    // guest_ref привязываем к аккаунтной строке — тогда позже, если человек
    // выйдет и лайкнет гостем, вставка упрётся в unique по guest_ref и дубль не
    // появится. Если cookie уже занята чужой строкой (общий браузер, второй
    // аккаунт) — пишем без неё, чтобы не отобрать чужой лайк.
    const linkGuest = !guestRow;
    const { error } = await admin.from("community_post_likes").insert({
      post_id: postId,
      user_ref: userId,
      guest_ref: linkGuest ? guestRef : null,
    });
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error("[feed/like] insert failed", error.message);
      return NextResponse.json({ error: "Не удалось поставить лайк" }, { status: 500 });
    }
    return respond(true, await countLikes(admin, postId));
  }

  // Гость. Строка с его guest_ref уже есть (в т.ч. усыновлённая аккаунтом) →
  // дубль не создаём.
  if (guestRow) {
    return respond(true, await countLikes(admin, postId));
  }
  const { error } = await admin
    .from("community_post_likes")
    .insert({ post_id: postId, guest_ref: guestRef, user_ref: null });
  if (error && error.code !== UNIQUE_VIOLATION) {
    console.error("[feed/like] guest insert failed", error.message);
    return NextResponse.json({ error: "Не удалось поставить лайк" }, { status: 500 });
  }
  return respond(true, await countLikes(admin, postId));
}

// Что лайкнул ЭТОТ гость — чтобы после перезагрузки сердечки были закрашены.
// Залогиненному это не нужно: liked_by_me приходит из view. Cookie здесь НЕ
// выдаём (просмотр страницы новых cookie не создаёт) — нет cookie, пустой ответ.
export async function GET(req: Request) {
  const guestRef = readGuestRef(req);
  if (!guestRef) return NextResponse.json({ likedPostIds: [] });

  const admin = createServiceRoleClient();
  const { data } = await admin
    .from("community_post_likes")
    .select("post_id")
    .eq("guest_ref", guestRef)
    .limit(500);

  // Только id постов — своих же лайков. Никаких идентификаторов в ответе.
  return NextResponse.json({ likedPostIds: (data ?? []).map((r) => r.post_id as string) });
}
