"use client";

import { useEffect } from "react";

/**
 * Доставка новых версий в УСТАНОВЛЕННОЕ PWA без переустановки.
 *
 * Проблема: SW собран с skipWaiting+clientsClaim, но браузер проверяет новый
 * sw.js только при навигации/раз в ~24ч. iOS в standalone при повторном открытии
 * ВОЗОБНОВЛЯЕТ замороженный старый документ (без навигации) — поэтому
 * установленное PWA может бесконечно жить на старом бандле (старый код Метрики →
 * 0 standalone-визитов).
 *
 * Решение: при загрузке и при каждом возврате в приложение (visibilitychange,
 * который на iOS срабатывает при resume) явно дёргаем registration.update().
 * Если приходит новая версия — благодаря skipWaiting она активируется и
 * захватывает клиента, срабатывает controllerchange, и мы один раз перезагружаем
 * страницу уже на новом бандле. Первую установку (когда контроллера ещё не было)
 * НЕ перезагружаем — иначе был бы лишний reload на первом визите.
 */
export default function PWAUpdater() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    // Был ли документ уже под управлением SW на момент монтирования. Если да —
    // последующий controllerchange означает РЕАЛЬНОЕ обновление (а не первый
    // claim при самой первой установке).
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloaded = false;

    const onControllerChange = () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const checkForUpdate = () => {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {
          /* офлайн/сеть — не критично, попробуем при следующем resume */
        });
    };

    checkForUpdate();

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
