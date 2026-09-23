"use client";

import { useEffect, useRef } from "react";

import { useInstallEnv } from "@/lib/installEnv";
import { reachGoal } from "@/lib/metrika";
import { platformFromEnv, type VisitorKind } from "@/lib/platform";

/**
 * Отметка о заходе: с какой платформы и впервые ли.
 *
 * ОДИН РАЗ ЗА СЕАНС, а не на каждый экран. Живёт в root-layout, то есть
 * монтируется на любой странице, но пишет отметку только если её ещё не было в
 * этой вкладке (sessionStorage). Иначе человек, потыкавший пять вкладок
 * таб-бара, давал бы пять «визитов» и перекашивал долю платформ в пользу тех,
 * кто листает дольше.
 *
 * НОВЫЙ ИЛИ ВЕРНУВШИЙСЯ определяется ОТМЕТКОЙ НА УСТРОЙСТВЕ, а не
 * идентификатором на сервере. Это сознательный размен: мы не заводим ещё один
 * сквозной идентификатор ради статистики (его пришлось бы честно описывать в
 * политике и хранить), а взамен соглашаемся, что человек с очищенным
 * хранилищем посчитается новым ещё раз. Для вопроса «растёт ли доля
 * приложений» этой точности достаточно.
 *
 * СРЕДУ ЖДЁМ. До опроса Capacitor среда приходит как "unknown", и платформа —
 * null. Записать такой заход как «сайт» значит систематически занижать долю
 * приложений, поэтому просто ждём следующего рендера: useInstallEnv
 * пересчитывается сразу после гидрации.
 *
 * СБОЙ ЗАПИСИ НИЧЕГО НЕ ЛОМАЕТ. Статистика — не пользовательский сценарий:
 * ошибку сети глотаем молча и вторую попытку не делаем.
 */

// Отметка «в этой вкладке уже посчитали».
const SESSION_KEY = "sc_platform_hit";
// Отметка «это устройство здесь уже было». Ставится один раз навсегда.
const SEEN_KEY = "sc_platform_seen";

function visitorKind(): VisitorKind {
  try {
    if (localStorage.getItem(SEEN_KEY) === "1") return "returning";
    localStorage.setItem(SEEN_KEY, "1");
    return "new";
  } catch {
    // Приватный режим: отметку не сохранить, и каждый заход выглядит первым.
    // Честнее считать такого человека новым, чем не считать вовсе.
    return "new";
  }
}

export default function PlatformHit() {
  const env = useInstallEnv();
  // Защита от второй записи внутри одной жизни страницы: sessionStorage может
  // быть недоступен, и тогда единственным заслоном остаётся этот ref.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const platform = platformFromEnv(env);
    if (!platform) return; // среда ещё неизвестна — ждём следующего рендера

    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        sent.current = true;
        return;
      }
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // Хранилище недоступно — полагаемся на ref выше.
    }
    sent.current = true;

    const visitor = visitorKind();

    // В Метрику — параметром цели, чтобы разрез по платформам был виден и там,
    // без похода в админку.
    reachGoal("platform_visit", { platform, visitor });

    // В свою статистику — через собственный роут. Прямая вставка анонимным
    // ключом была бы короче, но она расширяет и без того открытую на запись
    // таблицу: подделать статистику платформ смог бы кто угодно с ключом из
    // бандла. Роут пишет сервис-ролью и проверяет значения.
    void fetch("/api/platform-hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, visitor }),
      keepalive: true,
    }).catch(() => {
      /* статистика не должна мешать работе сайта */
    });
  }, [env]);

  return null;
}
