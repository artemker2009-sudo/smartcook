import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { IDEA_ADMIN_COLUMNS, effectiveImageStatus } from "@/lib/ideaRecipes";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_RECIPES,
  parseIdeaRecipe,
  parseIdeasImport,
  type ImportSkip,
  type IdeaImportRow,
} from "@/lib/ideaImport";
import {
  parseBulkIds,
  planBulkPublish,
  type BulkPublishRow,
  type BulkSkip,
} from "@/lib/ideaBulkPublish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// CRUD каталога «Идеи» (idea_recipes) — ТОЛЬКО через этот админ-роут на
// service_role. У таблицы нет ни INSERT/UPDATE/DELETE-политик для
// anon/authenticated, ни соответствующих привилегий (supabase_idea_recipes.sql),
// поэтому другого пути записи просто не существует.
//
// Операции: list (GET) / update / setPublished / setPublishedMany / delete /
// import (POST).
// Создание рецепта руками не предусмотрено намеренно: рецепты готовит директор
// файлом, а форма в админке — для вычитки и правки уже залитого.
//
// ПУБЛИКАЦИЯ ВСЕГДА ОТДЕЛЬНЫМ ДЕЙСТВИЕМ. Ни импорт, ни правка не могут
// выставить is_published: при импорте поле не входит в набор вставляемых
// колонок вовсе, при правке — вырезано из патча. Опубликовать можно только
// явным setPublished или setPublishedMany, то есть руками после вычитки.

/** PostgREST про отсутствующую таблицу отвечает PGRST205, а не 42P01. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST205" || /could not find the table/i.test(error.message || "");
}

/** Нарушение уникальности slug. */
function isDuplicateKey(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}


/**
 * Сбросить кэш ленты и экрана рецепта.
 *
 * /ideas — статическая страница с revalidate 300. Без явного сброса публикация
 * появлялась бы в ленте не сразу, а в пределах пяти минут: человек нажал
 * «Опубликовать», пошёл смотреть — и не увидел ничего. Пять минут тишины
 * выглядят как «не работает».
 *
 * Экран рецепта и карту сайта сбрасываем тоже: «Идеи» в карте сайта
 * (IDEAS_INDEXABLE), и без сброса новый рецепт появлялся бы там только через
 * час — а публикация редкая, сброс дешёвый.
 */
function revalidateIdeas(slugs?: string | null | readonly string[]): void {
  const list = slugs == null ? [] : typeof slugs === "string" ? [slugs] : slugs;
  try {
    revalidatePath("/ideas");
    revalidatePath("/sitemap.xml");
    for (const slug of list) revalidatePath(`/ideas/${slug}`);
  } catch {
    // Сброс кэша не должен ронять операцию: данные уже записаны.
  }
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

// ---------------------------------------------------------------------------
// GET — список для админки
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("idea_recipes")
    .select(IDEA_ADMIN_COLUMNS)
    .order("sort_weight", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    // Миграция ещё не прогнана — не роняем всю вкладку, а честно говорим об
    // этом. Так же мягко ведут себя остальные разделы админки.
    if (isMissingTable(error)) {
      return NextResponse.json({ recipes: [], migrationMissing: true });
    }
    return NextResponse.json({ error: "Не удалось загрузить каталог" }, { status: 500 });
  }

  return NextResponse.json({ recipes: data ?? [], migrationMissing: false });
}

// ---------------------------------------------------------------------------
// Импорт
// ---------------------------------------------------------------------------
type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

/**
 * Вставка проверенных строк.
 *
 * Сначала пачкой — это один запрос вместо ста. Если пачка падает (нарушен
 * констрейнт базы, гонка по уникальному slug), переходим на построчную
 * вставку: пачка сообщает только ПЕРВУЮ причину и не говорит, на каком
 * рецепте споткнулась, а человеку нужен список «что не приехало и почему».
 */
async function insertRows(
  supabase: SupabaseClient,
  rows: IdeaImportRow[],
): Promise<{ added: string[]; skipped: ImportSkip[] }> {
  if (rows.length === 0) return { added: [], skipped: [] };

  const { error } = await supabase.from("idea_recipes").insert(rows);
  if (!error) return { added: rows.map((r) => r.slug), skipped: [] };

  const added: string[] = [];
  const skipped: ImportSkip[] = [];
  for (const row of rows) {
    const { error: rowError } = await supabase.from("idea_recipes").insert(row);
    if (!rowError) {
      added.push(row.slug);
      continue;
    }
    skipped.push({
      slug: row.slug,
      reason: isDuplicateKey(rowError)
        ? "уже есть"
        : `база отклонила: ${rowError.message || "неизвестная ошибка"}`,
    });
  }
  return { added, skipped };
}

async function handleImport(supabase: SupabaseClient, b: Record<string, unknown>) {
  const file = b.file;
  if (typeof file !== "string" || !file.trim()) {
    return badRequest("Пустой файл");
  }

  // Размер считаем в БАЙТАХ: кириллица в UTF-8 двухбайтовая, и проверка по
  // длине строки пропустила бы файл вдвое больше заявленного потолка.
  const bytes = Buffer.byteLength(file, "utf8");
  if (bytes > MAX_IMPORT_BYTES) {
    return badRequest(
      `Файл ${Math.round(bytes / 1024)} КБ, максимум ${Math.round(MAX_IMPORT_BYTES / 1024)} КБ`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(file);
  } catch {
    // Ошибку разбора JSON отделяем от ошибок проверки: это опечатка в файле
    // (запятая, кавычка), а не «рецепт не прошёл правила».
    return badRequest("Файл не читается как JSON — проверьте запятые и кавычки");
  }

  const result = parseIdeasImport(parsed);
  if (result.fatal) return badRequest(result.fatal);

  const skipped: ImportSkip[] = [...result.skipped];

  // Какие slug уже в каталоге. Один запрос вместо запроса на рецепт.
  let existing = new Set<string>();
  if (result.rows.length > 0) {
    const { data, error } = await supabase
      .from("idea_recipes")
      .select("slug")
      .in("slug", result.rows.map((r) => r.slug));
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json(
          { error: "Таблица каталога не найдена — прогнана ли миграция supabase_idea_recipes.sql?" },
          { status: 500 },
        );
      }
      return NextResponse.json({ error: "Не удалось проверить существующие рецепты" }, { status: 500 });
    }
    existing = new Set((data ?? []).map((r) => (r as { slug: string }).slug));
  }

  const fresh: IdeaImportRow[] = [];
  for (const row of result.rows) {
    // ПРАВИЛО: существующий рецепт не перезаписываем. Директор мог залить тот
    // же файл повторно, а рецепт уже вычитан и, возможно, опубликован —
    // молчаливая перезапись стёрла бы эту работу.
    if (existing.has(row.slug)) {
      skipped.push({ slug: row.slug, reason: "уже есть" });
      continue;
    }
    fresh.push(row);
  }

  const inserted = await insertRows(supabase, fresh);
  skipped.push(...inserted.skipped);

  // Названия добавленных — для отчёта: slug человеку ничего не говорит.
  const titleBySlug = new Map(result.rows.map((r) => [r.slug, r.title]));

  return NextResponse.json({
    success: true,
    added: inserted.added.map((slug) => ({ slug, title: titleBySlug.get(slug) ?? slug })),
    skipped,
    warnings: result.warnings,
    limits: { maxRecipes: MAX_IMPORT_RECIPES, maxBytes: MAX_IMPORT_BYTES },
  });
}

// ---------------------------------------------------------------------------
// Массовая публикация
// ---------------------------------------------------------------------------

/**
 * Опубликовать выбранные черновики. План (кого можно) — в
 * lib/ideaBulkPublish.ts; здесь чтение, запись и отчёт.
 *
 * Условия плана ПОВТОРЕНЫ в самом UPDATE (is_published=false, картинка
 * готова, published_at пуст — для первой публикации). Между чтением и
 * записью кто-то мог перерисовать картинку или опубликовать рецепт с другой
 * вкладки; тогда строка просто не попадёт под фильтр. Какие строки реально
 * изменились — берём из ответа UPDATE, а не из плана: запись, которую не
 * пропустил фильтр, выглядит как успех (CLAUDE.md, 3.2).
 */
async function handlePublishMany(supabase: SupabaseClient, b: Record<string, unknown>) {
  const parsedIds = parseBulkIds(b.ids);
  if (!parsedIds.ok) return badRequest(parsedIds.error);
  const ids = parsedIds.ids;

  const { data: rows, error: readError } = await supabase
    .from("idea_recipes")
    .select("id, slug, title, is_published, image_status, image_url, updated_at, published_at")
    .in("id", ids);
  if (readError) {
    return NextResponse.json({ error: "Не удалось прочитать выбранные рецепты" }, { status: 500 });
  }

  const plan = planBulkPublish(ids, (rows ?? []) as BulkPublishRow[]);
  const skipped: BulkSkip[] = [...plan.skipped];
  const published: { id: string; slug: string; title: string }[] = [];
  let writeFailed = false;

  const write = async (group: BulkPublishRow[], firstTime: boolean) => {
    if (group.length === 0) return;
    const patch: Record<string, unknown> = { is_published: true };
    let query = supabase
      .from("idea_recipes")
      .update(firstTime ? { ...patch, published_at: new Date().toISOString() } : patch)
      .in("id", group.map((r) => r.id))
      .eq("is_published", false)
      .eq("image_status", "ready")
      .not("image_url", "is", null);
    // Дата публикации — один раз, как у одиночной публикации: по ней
    // сортируется лента, и «снял → поправил → вернул» не должно поднимать
    // рецепт наверх как новый.
    query = firstTime ? query.is("published_at", null) : query.not("published_at", "is", null);
    const { data, error } = await query.select("id, slug, title");
    if (error) {
      writeFailed = true;
      for (const row of group) {
        skipped.push({ id: row.id, slug: row.slug, title: row.title, reason: "база отклонила запись" });
      }
      return;
    }
    const done = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
    for (const row of group) {
      if (done.has(row.id)) {
        published.push({ id: row.id, slug: row.slug, title: row.title });
      } else {
        skipped.push({
          id: row.id,
          slug: row.slug,
          title: row.title,
          reason: "изменился во время публикации — обновите список",
        });
      }
    }
  };

  await write(plan.firstTime, true);
  await write(plan.again, false);

  if (published.length > 0) revalidateIdeas(published.map((r) => r.slug));

  return NextResponse.json(
    {
      success: !writeFailed,
      published: published.map(({ slug, title }) => ({ slug, title })),
      skipped,
    },
    // Частичный успех — всё равно 200 с отчётом: часть рецептов уже в ленте,
    // и человеку нужен список, а не общая ошибка.
    { status: writeFailed && published.length === 0 ? 500 : 200 },
  );
}

// ---------------------------------------------------------------------------
// POST — update / setPublished / setPublishedMany / delete / import
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Некорректный запрос");

  const b = body as Record<string, unknown>;
  const op = b.op;
  const supabase = createServiceRoleClient();

  if (op === "import") return handleImport(supabase, b);
  if (op === "setPublishedMany") return handlePublishMany(supabase, b);

  const id = b.id;
  if (typeof id !== "string" || !id.trim()) return badRequest("Не хватает ID");

  if (op === "update") {
    // Проверяем ТЕМ ЖЕ кодом, что и импорт: правка не должна принимать то, что
    // не принял бы файл, и наоборот.
    const parsed = parseIdeaRecipe(b.recipe);
    if (!parsed.ok) return badRequest(parsed.error);

    // is_published и published_at в набор не входят — публикацией распоряжается
    // только setPublished. Картинкой — PR 5, здесь её тоже не трогаем.
    const { error } = await supabase.from("idea_recipes").update(parsed.row).eq("id", id);
    if (error) {
      if (isDuplicateKey(error)) return badRequest("Такой slug уже занят другим рецептом");
      return NextResponse.json({ error: "Не удалось сохранить рецепт" }, { status: 500 });
    }
    revalidateIdeas(parsed.row.slug);
    return NextResponse.json({ success: true });
  }

  if (op === "setPublished") {
    const published = b.published === true;
    const patch: Record<string, unknown> = { is_published: published };
    // Нужен для сброса кэша экрана рецепта; заполняется, когда мы и так
    // читаем строку ради гейта публикации.
    let publishedSlug: string | null = null;

    if (published) {
      // ГЕЙТ: публикуем только рецепт с готовой картинкой.
      //
      // Проверка здесь, на сервере, а не только в кнопке. Кнопка — это
      // подсказка человеку, а правило должно держаться само: запрос к роуту
      // можно отправить и мимо интерфейса.
      //
      // Зависший `generating` читаем тем же effectiveImageStatus, что и
      // админка: иначе рецепт с убитой по таймауту генерацией навсегда
      // застрял бы между «нельзя публиковать» и «нельзя перегенерировать».
      const { data: current } = await supabase
        .from("idea_recipes")
        .select("image_status, image_url, updated_at, slug")
        .eq("id", id)
        .maybeSingle<{
          image_status: string;
          image_url: string | null;
          updated_at: string;
          slug: string;
        }>();

      publishedSlug = current?.slug ?? null;

      const status = current
        ? effectiveImageStatus(current.image_status, current.updated_at)
        : "none";

      if (status !== "ready" || !current?.image_url) {
        return badRequest(
          status === "generating"
            ? "Картинка ещё рисуется — опубликуйте, когда будет готова"
            : "Нельзя опубликовать рецепт без картинки: сначала сгенерируйте её",
        );
      }

      // Дата публикации проставляется ОДИН раз, при первой публикации: по ней
      // сортируется лента. Снятие с публикации дату не трогает (и констрейнт
      // idea_recipes_published_at_set это разрешает), поэтому «снял → поправил
      // опечатку → вернул» не поднимает рецепт наверх как новый.
      const { data: existing } = await supabase
        .from("idea_recipes")
        .select("published_at")
        .eq("id", id)
        .maybeSingle();
      if (existing && !(existing as { published_at: string | null }).published_at) {
        patch.published_at = new Date().toISOString();
      }
    }

    const { error } = await supabase.from("idea_recipes").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось обновить статус" }, { status: 500 });
    revalidateIdeas(publishedSlug);
    return NextResponse.json({ success: true });
  }

  if (op === "delete") {
    // Slug читаем ДО удаления — после строки уже нет, а сбросить кэш её
    // страницы надо.
    const { data: doomed } = await supabase
      .from("idea_recipes")
      .select("slug")
      .eq("id", id)
      .maybeSingle<{ slug: string }>();

    const { error } = await supabase.from("idea_recipes").delete().eq("id", id);
    if (error) return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
    revalidateIdeas(doomed?.slug ?? null);
    return NextResponse.json({ success: true });
  }

  return badRequest("Неизвестная операция");
}
