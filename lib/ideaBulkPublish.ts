// Массовая публикация каталога «Идеи»: чистая часть без базы.
//
// ЧИСТЫЙ модуль: его импортируют и админ-роут (разбор запроса, план), и
// админка (лимит, подпись в подтверждении), и тесты.
//
// Правила те же, что у одиночной публикации (op=setPublished), и держатся
// на сервере, а не в чекбоксах: запрос к роуту можно отправить мимо
// интерфейса.
//   • только черновик → опубликован; обратного направления здесь нет вовсе;
//   • только с готовой картинкой (effectiveImageStatus, как в админке);
//   • published_at ставится один раз — тем, у кого пусто.

import { effectiveImageStatus } from "./ideaRecipes";

/** Потолок за один запрос. Столько же, сколько рецептов в одном импорте. */
export const MAX_BULK_PUBLISH = 100;

/** Строка, которую роут читает перед публикацией. */
export type BulkPublishRow = {
  id: string;
  slug: string;
  title: string;
  is_published: boolean | null;
  image_status: string | null;
  image_url: string | null;
  updated_at: string | null;
  published_at: string | null;
};

export type BulkSkip = { id: string; slug: string | null; title: string | null; reason: string };

export type BulkPlan = {
  /** Первая публикация — ставим published_at. */
  firstTime: BulkPublishRow[];
  /** Уже публиковались раньше (сняли и возвращают) — дату не трогаем. */
  again: BulkPublishRow[];
  skipped: BulkSkip[];
};

/** Разбор списка id из тела запроса. Дубли схлопываем, мусор — ошибка. */
export function parseBulkIds(raw: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Не выбрано ни одного рецепта" };
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !value.trim() || value.length > 64) {
      return { ok: false, error: "Некорректный ID в списке" };
    }
    const id = value.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length > MAX_BULK_PUBLISH) {
    return { ok: false, error: `За раз можно опубликовать не больше ${MAX_BULK_PUBLISH} рецептов` };
  }
  return { ok: true, ids };
}

/**
 * Можно ли выбрать рецепт для массовой публикации: черновик с готовой
 * картинкой. Тот же расчёт, что в плане ниже, — чекбокс в админке и сервер
 * не должны расходиться.
 */
export function canBulkPublish(
  row: Pick<BulkPublishRow, "is_published" | "image_status" | "image_url" | "updated_at">,
  now: number = Date.now(),
): boolean {
  return (
    row.is_published !== true &&
    effectiveImageStatus(row.image_status, row.updated_at, now) === "ready" &&
    !!row.image_url
  );
}

/**
 * Кого публикуем, кого пропускаем и почему. Порядок пропусков — порядок
 * запроса: отчёт человек читает сверху вниз вместе со своим выбором.
 */
export function planBulkPublish(ids: string[], rows: BulkPublishRow[], now: number = Date.now()): BulkPlan {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const plan: BulkPlan = { firstTime: [], again: [], skipped: [] };

  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      plan.skipped.push({ id, slug: null, title: null, reason: "нет в каталоге (удалён?)" });
      continue;
    }
    const skip = (reason: string) => plan.skipped.push({ id, slug: row.slug, title: row.title, reason });

    if (row.is_published === true) {
      skip("уже опубликован");
      continue;
    }
    const status = effectiveImageStatus(row.image_status, row.updated_at, now);
    if (status === "generating") {
      skip("картинка ещё рисуется");
      continue;
    }
    if (status !== "ready" || !row.image_url) {
      skip("нет готовой картинки");
      continue;
    }
    (row.published_at ? plan.again : plan.firstTime).push(row);
  }
  return plan;
}

/** «1 рецепт», «3 рецепта», «12 рецептов». */
export function recipesWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "рецепт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "рецепта";
  return "рецептов";
}

/** Текст подтверждения перед публикацией. Один рецепт — «он», не «они». */
export function bulkPublishConfirmText(count: number): string {
  const tail = count === 1 ? "Он сразу появится в ленте" : "Они сразу появятся в ленте";
  return `Опубликовать ${count} ${recipesWord(count)}? ${tail}`;
}
