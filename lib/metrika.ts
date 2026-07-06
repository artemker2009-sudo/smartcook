import { YANDEX_METRIKA_ID } from "@/components/YandexMetrika";

/**
 * Безопасно отправляет цель в Яндекс.Метрику.
 *
 * Счётчик может быть не загружен (медленная сеть, блокировщик рекламы,
 * приватный режим). Поэтому проверяем наличие window.ym и глотаем любые
 * ошибки — вызов reachGoal никогда не должен ломать пользовательский сценарий
 * (переход по кнопке, открытие камеры и т.п.).
 */
export function reachGoal(goal: string): void {
  if (typeof window === "undefined") return;
  try {
    // @ts-ignore — ym инициализируется скриптом Метрики в рантайме
    if (typeof window.ym === "function") {
      // @ts-ignore
      window.ym(YANDEX_METRIKA_ID, "reachGoal", goal);
    }
  } catch {
    // Метрика не должна влиять на работу интерфейса — молча игнорируем.
  }
}
