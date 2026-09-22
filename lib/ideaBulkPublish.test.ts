import { describe, it, expect } from "vitest";
import {
  MAX_BULK_PUBLISH,
  bulkPublishConfirmText,
  canBulkPublish,
  parseBulkIds,
  planBulkPublish,
  type BulkPublishRow,
} from "./ideaBulkPublish";

const NOW = Date.parse("2026-09-22T12:00:00Z");

function row(id: string, over: Partial<BulkPublishRow> = {}): BulkPublishRow {
  return {
    id,
    slug: `slug-${id}`,
    title: `Рецепт ${id}`,
    is_published: false,
    image_status: "ready",
    image_url: `https://x/ideas/${id}.webp`,
    updated_at: "2026-09-22T11:00:00Z",
    published_at: null,
    ...over,
  };
}

describe("разбор списка id", () => {
  it("пустой список и не-массив — ошибка", () => {
    expect(parseBulkIds([]).ok).toBe(false);
    expect(parseBulkIds("a").ok).toBe(false);
    expect(parseBulkIds(undefined).ok).toBe(false);
  });
  it("мусор в списке — ошибка целиком, а не молчаливый пропуск", () => {
    expect(parseBulkIds(["a", 5]).ok).toBe(false);
    expect(parseBulkIds(["a", " "]).ok).toBe(false);
  });
  it("дубли схлопываются", () => {
    expect(parseBulkIds(["a", "b", "a"])).toEqual({ ok: true, ids: ["a", "b"] });
  });
  it(`больше ${MAX_BULK_PUBLISH} за раз — отказ`, () => {
    const ids = Array.from({ length: MAX_BULK_PUBLISH + 1 }, (_, i) => `id${i}`);
    expect(parseBulkIds(ids).ok).toBe(false);
    expect(parseBulkIds(ids.slice(0, MAX_BULK_PUBLISH)).ok).toBe(true);
  });
});

describe("план публикации", () => {
  it("черновик с картинкой впервые — с датой публикации", () => {
    const plan = planBulkPublish(["1"], [row("1")], NOW);
    expect(plan.firstTime.map((r) => r.id)).toEqual(["1"]);
    expect(plan.again).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it("снятый и возвращаемый — отдельно: дату не трогаем", () => {
    const plan = planBulkPublish(["1"], [row("1", { published_at: "2026-09-01T00:00:00Z" })], NOW);
    expect(plan.again.map((r) => r.id)).toEqual(["1"]);
    expect(plan.firstTime).toEqual([]);
  });

  it("пропуски с причинами, в порядке запроса", () => {
    const rows = [
      row("pub", { is_published: true }),
      row("draw", { image_status: "generating", updated_at: "2026-09-22T11:59:00Z" }),
      row("none", { image_status: "none", image_url: null }),
      row("failed", { image_status: "failed" }),
      row("nourl", { image_url: null }),
      row("ok"),
    ];
    const plan = planBulkPublish(["gone", "pub", "draw", "none", "failed", "nourl", "ok"], rows, NOW);
    expect(plan.skipped.map((s) => [s.id, s.reason])).toEqual([
      ["gone", "нет в каталоге (удалён?)"],
      ["pub", "уже опубликован"],
      ["draw", "картинка ещё рисуется"],
      ["none", "нет готовой картинки"],
      ["failed", "нет готовой картинки"],
      ["nourl", "нет готовой картинки"],
    ]);
    expect(plan.firstTime.map((r) => r.id)).toEqual(["ok"]);
  });

  it("зависшая генерация читается как неудача — как в одиночной публикации", () => {
    const stuck = row("s", { image_status: "generating", updated_at: "2026-09-21T00:00:00Z" });
    expect(planBulkPublish(["s"], [stuck], NOW).skipped[0].reason).toBe("нет готовой картинки");
  });

  it("чекбокс и план согласны", () => {
    const rows = [row("a"), row("b", { is_published: true }), row("c", { image_url: null })];
    const plan = planBulkPublish(["a", "b", "c"], rows, NOW);
    const eligible = rows.filter((r) => canBulkPublish(r, NOW)).map((r) => r.id);
    expect(eligible).toEqual(plan.firstTime.map((r) => r.id));
  });
});

describe("подтверждение", () => {
  it("число и склонение", () => {
    expect(bulkPublishConfirmText(12)).toBe("Опубликовать 12 рецептов? Они сразу появятся в ленте");
    expect(bulkPublishConfirmText(3)).toBe("Опубликовать 3 рецепта? Они сразу появятся в ленте");
    expect(bulkPublishConfirmText(21)).toBe("Опубликовать 21 рецепт? Они сразу появятся в ленте");
    expect(bulkPublishConfirmText(11)).toBe("Опубликовать 11 рецептов? Они сразу появятся в ленте");
    expect(bulkPublishConfirmText(1)).toBe("Опубликовать 1 рецепт? Он сразу появится в ленте");
  });
});
