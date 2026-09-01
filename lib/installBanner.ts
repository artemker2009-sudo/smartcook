// Логика умной плашки «Установите приложение». БЕЗ БД — только localStorage на
// устройстве. Вынесена из компонента, чтобы правила показа были проверяемы
// тестами: молчание после крестика легко сломать незаметно, а сломанное правило
// превращает плашку в назойливую.

export type InstallPlatform = "ios" | "android" | "other";

// Ключ паузы: храним МОМЕНТ, до которого молчим (timestamp в мс), а не факт
// закрытия. Так одна проверка `until > now` покрывает и «закрыл крестиком», и
// «ушёл в стор» — различаются они только длиной паузы.
export const SNOOZE_KEY = "sc_install_banner_snoozed_until";

/** Крестик: человек сказал «не сейчас» — молчим две недели. */
export const DISMISS_DAYS = 14;
/**
 * Клик по кнопке установки: человек ушёл в RuStore / читает инструкцию для
 * iOS. Скорее всего поставит, а если поставит — плашку убьёт уже проверка
 * standalone. Пауза длиннее, чтобы не звать снова того, кто как раз ставит.
 */
export const CLICK_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Платформа по userAgent. Ровно три исхода, потому что предложения у нас ровно
 * три: Android → RuStore, iOS → «на экран „Домой“», всё остальное (десктоп) →
 * ничего: приложения для десктопа нет, а iOS-инструкция там бессмысленна.
 *
 * iPad с iPadOS 13+ по умолчанию отдаёт десктопный UA («Macintosh»), поэтому
 * дополнительно проверяем тач: Mac с тачскрином не бывает, а iPad — бывает.
 */
export function detectPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return "ios";
  return "other";
}

/** Молчим ли сейчас: в ключе лежит момент, до которого плашку не показываем. */
export function isSnoozed(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const until = Number(raw);
  // Мусор в ключе (чужая запись, порча хранилища) не должен запирать плашку
  // навсегда — считаем, что паузы нет.
  if (!Number.isFinite(until)) return false;
  return until > now;
}

/** Значение для ключа паузы: «молчать до now + days». */
export function snoozeValue(now: number, days: number): string {
  return String(now + days * DAY_MS);
}

/** Читает паузу из localStorage. Приватный режим → считаем, что паузы нет. */
export function isSnoozedNow(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return isSnoozed(localStorage.getItem(SNOOZE_KEY), Date.now());
  } catch {
    return false;
  }
}

/** Ставит паузу на указанное число дней. */
export function snooze(days: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SNOOZE_KEY, snoozeValue(Date.now(), days));
  } catch {
    // Приватный режим / переполнение: пауза не сохранится, плашка появится в
    // следующий раз. Ломать интерфейс из-за этого нельзя.
  }
}

/** Платформа текущего устройства (только клиент). */
export function currentPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  return detectPlatform(navigator.userAgent, navigator.maxTouchPoints || 0);
}
