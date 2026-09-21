/* eslint-disable no-console */
// Досоздание миниатюр 540 px для уже сгенерированных картинок «Идей».
//
// ЗАПУСК (из корня репозитория, ключи из .env.local — это БОЕВАЯ база):
//   set -a; . ./.env.local; set +a
//   npx jiti scripts/backfill-idea-thumbs.ts            # показать, что сделаю
//   npx jiti scripts/backfill-idea-thumbs.ts --apply    # сделать
//
// OpenAI НЕ вызывается: миниатюра пережимается из уже лежащего оригинала.
// Пишет ТОЛЬКО файл ideas/thumb/…webp и колонку thumb_url. is_published,
// image_url, image_status не трогает.
//
// ИДЕМПОТЕНТНОСТЬ И ОБРЫВ. Каждая строка — отдельная законченная операция:
// загрузка файла (upsert — повтор безопасен) → условная запись в базу →
// чтение обратно. Упал на середине — следующий запуск возьмёт только то, что
// ещё не сделано. «Сделано» определяется не наличием thumb_url, а тем, что
// миниатюра от ЭТОЙ картинки (thumbMatchesImage).
//
// ПАРАЛЛЕЛЬНАЯ ГЕНЕРАЦИЯ. Пока картинки рисует старый код, он меняет
// image_url и не трогает thumb_url. Поэтому:
//   - строки в статусе generating пропускаем;
//   - запись в базу условная: только если image_url и thumb_url те же, что
//     мы прочитали. Картинку перегенерировали на ходу — строка не пишется и
//     достанется следующему запуску;
//   - миниатюра от прежней картинки считается несделанной и переделывается.

import { createClient } from "@supabase/supabase-js";
import { bucketPathFromUrl, makeThumb, thumbPathFor } from "../lib/ideaThumb";
import { thumbMatchesImage } from "../lib/ideaThumbPath";

const APPLY = process.argv.includes("--apply");
const BUCKET = "recipe-images";
const UPLOAD_ATTEMPTS = 3;

type Row = {
  id: string;
  slug: string;
  image_url: string | null;
  thumb_url: string | null;
  image_status: string;
  image_aspect: string;
};

type Outcome =
  | { kind: "done" | "would"; slug: string; aspect: string; bytes: number; quality: number }
  | { kind: "skipped"; slug: string; reason: string }
  | { kind: "failed"; slug: string; reason: string };

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} КБ`;
}

async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt++) {
    try {
      return await run();
    } catch (error) {
      last = error;
      if (attempt < UPLOAD_ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
}

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — загрузите .env.local");
    return 2;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await sb
    .from("idea_recipes")
    .select("id, slug, image_url, thumb_url, image_status, image_aspect")
    .order("slug", { ascending: true });
  if (error) {
    console.error(`Не прочитал idea_recipes: ${error.message}`);
    if (/thumb_url/.test(error.message)) console.error("Похоже, миграция supabase_idea_recipes_thumb.sql не прогнана.");
    return 2;
  }
  const rows = (data ?? []) as Row[];
  const withImage = rows.filter((r) => r.image_url);
  const ready = withImage.filter((r) => thumbMatchesImage(r.image_url, r.thumb_url));
  const todo = withImage.filter((r) => !thumbMatchesImage(r.image_url, r.thumb_url));
  const stale = todo.filter((r) => r.thumb_url);

  console.log(APPLY ? "РЕЖИМ: ДЕЛАЮ (--apply)" : "РЕЖИМ: ПОКАЗЫВАЮ, ЧТО СДЕЛАЮ (без записи)");
  console.log(
    `рецептов ${rows.length} · с картинкой ${withImage.length} · миниатюра уже есть ${ready.length} · ` +
      `нужно сделать ${todo.length}${stale.length ? ` (из них ${stale.length} от прежней картинки)` : ""}`,
  );

  const outcomes: Outcome[] = [];
  for (const [index, row] of todo.entries()) {
    const tag = `[${index + 1}/${todo.length}] ${row.slug}`;
    const skip = (reason: string) => {
      outcomes.push({ kind: "skipped", slug: row.slug, reason });
      console.log(`${tag} — пропуск: ${reason}`);
    };

    if (row.image_status === "generating") {
      skip("картинка сейчас генерируется — возьмёт следующий запуск");
      continue;
    }
    const originalPath = bucketPathFromUrl(row.image_url);
    const thumbPath = thumbPathFor(originalPath);
    if (!originalPath || !thumbPath) {
      skip(`адрес картинки не по шаблону ideas/<slug>-<метка>.webp: ${row.image_url}`);
      continue;
    }

    try {
      const original = await withRetry("скачивание оригинала", async () => {
        const { data: blob, error: downloadError } = await sb.storage.from(BUCKET).download(originalPath);
        if (downloadError || !blob) throw new Error(downloadError?.message || "пустой ответ");
        return Buffer.from(await blob.arrayBuffer());
      });
      const aspect = row.image_aspect === "portrait" ? "portrait" : "square";
      const thumb = await makeThumb(original, aspect);

      if (!APPLY) {
        outcomes.push({ kind: "would", slug: row.slug, aspect, bytes: thumb.buffer.byteLength, quality: thumb.quality });
        console.log(`${tag} — сделаю ${thumbPath}: ${thumb.width}×${thumb.height}, q${thumb.quality}, ${kb(thumb.buffer.byteLength)} (оригинал ${kb(original.byteLength)})`);
        continue;
      }

      await withRetry("загрузка миниатюры", async () => {
        const { error: uploadError } = await sb.storage
          .from(BUCKET)
          .upload(thumbPath, thumb.buffer, { contentType: "image/webp", upsert: true });
        if (uploadError) throw new Error(uploadError.message);
      });
      const thumbUrl = sb.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl;

      // Условная запись: картинку не перегенерировали и миниатюру никто не
      // записал, пока мы её делали.
      let update = sb
        .from("idea_recipes")
        .update({ thumb_url: thumbUrl })
        .eq("id", row.id)
        .eq("image_url", row.image_url as string);
      update = row.thumb_url === null ? update.is("thumb_url", null) : update.eq("thumb_url", row.thumb_url);
      const { data: updated, error: updateError } = await update.select("id");
      if (updateError) throw new Error(`запись в базу: ${updateError.message}`);
      if (!updated || updated.length === 0) {
        skip("строка изменилась на ходу (перегенерация?) — возьмёт следующий запуск");
        continue;
      }

      // Заблокированная запись выглядит как успешная — читаем обратно.
      const { data: back, error: backError } = await sb
        .from("idea_recipes")
        .select("image_url, thumb_url")
        .eq("id", row.id)
        .single<{ image_url: string | null; thumb_url: string | null }>();
      if (backError || !back || back.thumb_url !== thumbUrl || !thumbMatchesImage(back.image_url, back.thumb_url)) {
        throw new Error("чтение обратно не совпало");
      }

      outcomes.push({ kind: "done", slug: row.slug, aspect, bytes: thumb.buffer.byteLength, quality: thumb.quality });
      console.log(`${tag} — готово: ${kb(thumb.buffer.byteLength)}, q${thumb.quality}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      outcomes.push({ kind: "failed", slug: row.slug, reason });
      console.log(`${tag} — ОШИБКА: ${reason}`);
    }
  }

  const made = outcomes.filter((o): o is Extract<Outcome, { bytes: number }> => o.kind === "done" || o.kind === "would");
  const failed = outcomes.filter((o) => o.kind === "failed");
  const skipped = outcomes.filter((o) => o.kind === "skipped");
  const avg = (list: typeof made) => (list.length ? kb(list.reduce((s, o) => s + o.bytes, 0) / list.length) : "—");
  const squares = made.filter((o) => o.aspect === "square");
  const portraits = made.filter((o) => o.aspect === "portrait");
  const lowered = made.filter((o) => o.quality < 75);

  console.log("──────────────────────────────");
  console.log(`${APPLY ? "сделано" : "будет сделано"}: ${made.length} · пропущено: ${skipped.length} · ошибок: ${failed.length}`);
  if (made.length) {
    console.log(
      `вес: в среднем ${avg(made)} (квадрат ${avg(squares)}, вертикаль ${avg(portraits)}), ` +
        `максимум ${kb(Math.max(...made.map((o) => o.bytes)))}; качество снижено у ${lowered.length}`,
    );
  }
  return failed.length > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
