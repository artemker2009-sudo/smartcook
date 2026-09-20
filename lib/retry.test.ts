import { describe, expect, it, vi } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import {
  PAID_AND_LOST_NOTE,
  UPLOAD_ATTEMPTS,
  UPLOAD_DELAYS_MS,
  retryAsync,
  uploadFailureMessage,
} from "./retry";

// Повтор загрузки в бакет. На приёмке каталога четыре вызова из двадцати
// упали именно здесь: картинка была уже создана моделью и оплачена, а
// положить её не удалось из-за мигнувшей сети. Повтор той же загрузки стоит
// ноль, потеря — целой генерации.

// Пауз в тестах нет: сон подставляем заглушкой, иначе набор ждал бы реальные
// секунды ради проверки арифметики.
const noSleep = async () => {};

describe("retryAsync", () => {
  it("успех с первой попытки — повторов нет", async () => {
    const op = vi.fn(async () => "ok");
    const result = await retryAsync(op, {
      attempts: 3,
      delaysMs: [10, 20],
      describeFailure: uploadFailureMessage,
      sleep: noSleep,
    });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("сбой и успех со второй — возвращает результат, не бросает", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce("ok");
    const result = await retryAsync(op, {
      attempts: 3,
      delaysMs: [10, 20],
      describeFailure: uploadFailureMessage,
      sleep: noSleep,
    });
    expect(result).toBe("ok");
    expect(op).toHaveBeenCalledTimes(2);
  });

  it("три сбоя — ровно три попытки и отказ", async () => {
    const op = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    await expect(
      retryAsync(op, {
        attempts: UPLOAD_ATTEMPTS,
        delaysMs: UPLOAD_DELAYS_MS,
        describeFailure: uploadFailureMessage,
        sleep: noSleep,
      }),
    ).rejects.toThrow(PAID_AND_LOST_NOTE);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("между попытками спит, после последней — нет", async () => {
    const sleeps: number[] = [];
    const op = vi.fn(async () => {
      throw new Error("нет сети");
    });
    await expect(
      retryAsync(op, {
        attempts: 3,
        delaysMs: [400, 1200],
        describeFailure: uploadFailureMessage,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      }),
    ).rejects.toThrow();
    // Три попытки — две паузы. Ждать после последней нечего.
    expect(sleeps).toEqual([400, 1200]);
  });

  it("в отказ попадает ПОСЛЕДНЯЯ ошибка — по ней и чинят", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new Error("первая"))
      .mockRejectedValueOnce(new Error("вторая"))
      .mockRejectedValueOnce(new Error("третья"));
    await expect(
      retryAsync(op, {
        attempts: 3,
        delaysMs: [1, 1],
        describeFailure: uploadFailureMessage,
        sleep: noSleep,
      }),
    ).rejects.toThrow("третья");
  });

  it("не-Error тоже переживает: строка вместо исключения не роняет повтор", async () => {
    const op = vi.fn(async () => {
      // eslint-disable-next-line no-throw-literal
      throw "строка вместо ошибки";
    });
    await expect(
      retryAsync(op, {
        attempts: 2,
        delaysMs: [1],
        describeFailure: uploadFailureMessage,
        sleep: noSleep,
      }),
    ).rejects.toThrow("строка вместо ошибки");
    expect(op).toHaveBeenCalledTimes(2);
  });
});

describe("uploadFailureMessage", () => {
  // Сообщение уходит в error_reports, и по нему человек решает, что чинить.
  // «Не смогли нарисовать» и «нарисовали, заплатили и потеряли» — разные
  // поломки с разной ценой.
  it("прямо говорит, что генерация оплачена", () => {
    const msg = uploadFailureMessage(3, "fetch failed");
    expect(msg).toContain(PAID_AND_LOST_NOTE);
    expect(msg).toContain("ОПЛАЧЕНА");
  });

  it("называет число попыток и последнюю ошибку", () => {
    const msg = uploadFailureMessage(3, "TypeError: fetch failed");
    expect(msg).toContain("3");
    expect(msg).toContain("TypeError: fetch failed");
  });
});
