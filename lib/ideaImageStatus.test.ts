import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import { IDEA_IMAGE_STUCK_MS, effectiveImageStatus, spentAtMostLabel } from "./ideaRecipes";

// Зависшая генерация. Статус ставится ПЕРЕД вызовом модели, и если функцию
// убили по таймауту (а одна картинка идёт около минуты), в базе навсегда
// остаётся generating. Такой рецепт становится неремонтируемым: кнопки
// «Сгенерировать» у него уже нет, а гейт публикации не пускает без ready.
describe("effectiveImageStatus", () => {
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("свежий generating остаётся generating", () => {
    expect(effectiveImageStatus("generating", ago(60_000), now)).toBe("generating");
  });

  it("generating старше пяти минут читается как failed", () => {
    expect(effectiveImageStatus("generating", ago(IDEA_IMAGE_STUCK_MS + 1000), now)).toBe("failed");
  });

  it("ровно на границе ещё generating — не отбираем последнюю секунду", () => {
    expect(effectiveImageStatus("generating", ago(IDEA_IMAGE_STUCK_MS), now)).toBe("generating");
  });

  it("остальные статусы не трогает, как бы стары они ни были", () => {
    for (const status of ["ready", "failed", "none"] as const) {
      expect(effectiveImageStatus(status, ago(10 * IDEA_IMAGE_STUCK_MS), now)).toBe(status);
    }
  });

  it("неизвестное значение и пустота — none", () => {
    expect(effectiveImageStatus("что-то", ago(0), now)).toBe("none");
    expect(effectiveImageStatus(null, null, now)).toBe("none");
  });

  it("неразобранная дата оставляет generating: лучше подождать, чем заплатить дважды", () => {
    expect(effectiveImageStatus("generating", "не дата", now)).toBe("generating");
    expect(effectiveImageStatus("generating", null, now)).toBe("generating");
  });
});

// Подпись расходов. Счётчик знает только число зарезервированных слотов, а
// слот резервируется ДО вызова модели — значит неудачные попытки в него тоже
// попадают. На приёмке каталога из-за этого оценка разошлась с фактом вдвое.
// Миграцию под фактическую сумму решили не делать, поэтому подпись обязана
// говорить, что это оценка СВЕРХУ.
describe("spentAtMostLabel", () => {
  it("говорит «не больше» и не выдаёт оценку за факт", () => {
    const label = spentAtMostLabel(19, 0.054);
    expect(label).toContain("не больше $1.03");
    expect(label).toContain("оценка сверху");
    expect(label).toContain("с учётом неудачных попыток");
    expect(label).not.toContain("потрачено");
    expect(label).not.toContain("примерно");
  });

  it("ноль генераций — ноль, без «примерно»", () => {
    expect(spentAtMostLabel(0, 0.054)).toContain("не больше $0.00");
  });

  it("округляет до копеек", () => {
    expect(spentAtMostLabel(3, 0.0429)).toContain("$0.13");
  });
});
