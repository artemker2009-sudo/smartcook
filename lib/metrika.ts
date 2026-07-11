import { YANDEX_METRIKA_ID } from "@/components/YandexMetrika";

/**
 * Безопасно отправляет цель в Яндекс.Метрику.
 *
 * Счётчик может быть не загружен (медленная сеть, блокировщик рекламы,
 * приватный режим). Поэтому проверяем наличие window.ym и глотаем любые
 * ошибки — вызов reachGoal никогда не должен ломать пользовательский сценарий
 * (переход по кнопке, открытие камеры и т.п.).
 */
export function reachGoal(goal: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    // @ts-ignore — ym инициализируется скриптом Метрики в рантайме
    if (typeof window.ym === "function") {
      // Необязательные параметры цели (напр. { chip: "гречка с курицей" } у
      // demo_chip_click) — Метрика принимает объект параметров 4-м аргументом.
      if (params) {
        // @ts-ignore
        window.ym(YANDEX_METRIKA_ID, "reachGoal", goal, params);
      } else {
        // @ts-ignore
        window.ym(YANDEX_METRIKA_ID, "reachGoal", goal);
      }
    }
  } catch {
    // Метрика не должна влиять на работу интерфейса — молча игнорируем.
  }
}
