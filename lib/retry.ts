// Повторные попытки для операций, сбой которых стоит денег.
//
// ЧИСТЫЙ модуль без "server-only" и без сети: задержку и саму операцию
// подставляет вызывающий, поэтому поведение проверяется тестами мгновенно, а
// не ожиданием реальных пауз.
//
// ЗАЧЕМ. На приёмке каталога четыре генерации из двадцати упали на
// `storage upload: fetch failed`: картинка была уже создана моделью и
// оплачена, а положить её в бакет не удалось из-за мигнувшей сети. Одна такая
// осечка стоит целой генерации — а повторить загрузку той же картинки стоит
// ноль. Поэтому повторяем ИМЕННО ЗАГРУЗКУ, держа готовый файл в памяти, и
// никогда не перегенерируем.

/** Сколько раз пытаемся положить файл в бакет. */
export const UPLOAD_ATTEMPTS = 3;

/** Паузы между попытками: короткие — сбой сети обычно проходит за секунду. */
export const UPLOAD_DELAYS_MS = [400, 1200];

/**
 * Пометка для error_reports. Важно, чтобы в логе было видно РАЗНИЦУ между
 * «не смогли нарисовать» и «нарисовали, заплатили и потеряли»: это разные
 * поломки с разной ценой, и чинить их надо по-разному.
 */
export const PAID_AND_LOST_NOTE = "генерация УЖЕ ОПЛАЧЕНА, картинка потеряна";

export function uploadFailureMessage(attempts: number, lastError: string): string {
  return `storage upload: не удалось за ${attempts} попыт(ки) — ${PAID_AND_LOST_NOTE}. Последняя ошибка: ${lastError}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Выполняет операцию, повторяя её при ошибке.
 *
 * Возвращает результат первой удачной попытки. Если не удалась ни одна —
 * бросает ошибку с текстом от `describeFailure`, чтобы вызывающий не собирал
 * сообщение сам и не терял контекст.
 */
export async function retryAsync<T>(
  operation: (attempt: number) => Promise<T>,
  opts: {
    attempts: number;
    delaysMs: number[];
    describeFailure: (attempts: number, lastError: string) => string;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep;
  let lastError = "неизвестная ошибка";

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = String(err?.message || err);
    }
    // После последней попытки не спим: ждать уже нечего.
    if (attempt < opts.attempts) {
      await sleep(opts.delaysMs[attempt - 1] ?? opts.delaysMs[opts.delaysMs.length - 1] ?? 0);
    }
  }

  throw new Error(opts.describeFailure(opts.attempts, lastError));
}
