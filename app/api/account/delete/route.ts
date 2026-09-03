import { NextResponse } from "next/server";
import { getVerifiedUserId } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Удаление собственного аккаунта и всех связанных с ним данных.
//
// Это ЕДИНСТВЕННОЕ честное необратимое DELETE в проекте — и только по запросу
// самого владельца (личность из проверенного JWT, не из тела запроса). Требуется
// правилами App Store 5.1.1(v): раз есть регистрация, пользователь обязан иметь
// возможность удалить аккаунт внутри приложения, без «напишите нам».
//
// Всё чистится на service_role (обходит RLS), строго по auth.uid() владельца:
//   * community_post_likes — лайки пользователя в ленте;
//   * community_posts       — его посты ленты (+ файлы фото в бакете feed_photos);
//   * feed_photo_likes      — лайки на витрине;
//   * feed_photos           — его фото на витрине «приготовили сегодня» (+ файлы);
//   * recipes               — история/избранное (session_id = uid для залогина);
//   * game_progress         — прогресс мини-игры;
//   * аватар в бакете avatars (папка <uid>/);
//   * сам auth-пользователь  — admin.deleteUser (инвалидирует все его сессии).
//
// НЕ трогаем банкеты/общие списки: это разделяемые с другими людьми поверхности,
// они не принадлежат одному пользователю. Гостевые данные на устройстве
// (localStorage) чистит клиент после успешного ответа.
//
// Порядок: сперва собираем имена файлов (пока строки живы), потом удаляем строки,
// потом файлы (best-effort — осиротевший файл не должен ронять удаление аккаунта),
// в конце — самого пользователя. Факт удаления логируем БЕЗ каких-либо данных.

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const FEED_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/feed_photos/`;

// Достаёт имя файла в бакете feed_photos из публичного URL. Возвращает null для
// любого чужого/внешнего URL — удаляем только заведомо свои объекты.
function feedFileName(url: unknown): string | null {
  if (typeof url !== "string" || !url.startsWith(FEED_PREFIX)) return null;
  const name = url.slice(FEED_PREFIX.length).split("?")[0];
  return name && !name.includes("/") ? name : null;
}

export async function POST(req: Request) {
  const userId = await getVerifiedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
  }

  const admin = createServiceRoleClient();

  try {
    // 1) Собираем имена файлов из строк, пока они существуют.
    const [{ data: posts }, { data: showcase }] = await Promise.all([
      admin.from("community_posts").select("photo_url").eq("user_ref", userId),
      admin.from("feed_photos").select("photo_url").eq("user_ref", userId),
    ]);
    const feedFiles = [
      ...(posts ?? []).map((r) => feedFileName((r as { photo_url?: string }).photo_url)),
      ...(showcase ?? []).map((r) => feedFileName((r as { photo_url?: string }).photo_url)),
    ].filter((n): n is string => !!n);

    // 2) Удаляем строки БД. Лайки раньше постов (на случай внешних ссылок/FK нет,
    //    но порядок делает намерение явным). Всё по владельцу = uid.
    await admin.from("community_post_likes").delete().eq("user_ref", userId);
    await admin.from("community_posts").delete().eq("user_ref", userId);
    await admin.from("feed_photo_likes").delete().eq("user_ref", userId);
    await admin.from("feed_photos").delete().eq("user_ref", userId);
    await admin.from("recipes").delete().eq("session_id", userId);
    await admin.from("game_progress").delete().eq("user_id", userId);

    // 3) Файлы в storage — best-effort.
    if (feedFiles.length > 0) {
      await admin.storage.from("feed_photos").remove(feedFiles).catch(() => {});
    }
    // Аватары лежат под префиксом <uid>/ — перечисляем и сносим папку.
    const { data: avatarList } = await admin.storage.from("avatars").list(userId);
    if (avatarList && avatarList.length > 0) {
      await admin.storage
        .from("avatars")
        .remove(avatarList.map((f) => `${userId}/${f.name}`))
        .catch(() => {});
    }

    // 4) Сам пользователь. После этого все его JWT недействительны.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error("[account/delete] deleteUser failed", delErr.message);
      return NextResponse.json(
        { error: "Не удалось удалить аккаунт. Попробуйте позже." },
        { status: 500 },
      );
    }

    // Только факт, без идентификатора/данных — для статистики в логах.
    console.info("[account/delete] account deleted");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[account/delete] unexpected", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "Не удалось удалить аккаунт. Попробуйте позже." },
      { status: 500 },
    );
  }
}
