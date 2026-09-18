"use client";

import { useEffect } from "react";

/**
 * АВАРИЙНЫЙ СБРОС КЭША (уровень B) — рубильник, до которого можно дотянуться
 * из админки, когда человек уже застрял на сломанной версии.
 *
 * ЗАЧЕМ. Сервис-воркер собран с skipWaiting: false — новая версия встаёт в
 * очередь и ждёт, пока закроется последний клиент на старой. Это осознанное
 * решение (PR #76: иначе воркер захватывает открытую страницу посреди
 * готовки), но у него есть цена: если в кэш уехала сломанная версия, починка
 * доезжает в лучшем случае через один запуск, а в standalone на iOS документ
 * замораживается вместо закрытия — и «следующий запуск» может не наступить
 * сутками. 5 сентября мы ровно это и получили.
 *
 * КАК РАБОТАЕТ. В админке жмут «Сбросить кэш у всех» — в site_settings
 * записывается новая метка. Каждый клиент при старте спрашивает /api/app-epoch
 * (этот маршрут NetworkOnly, воркер его не перехватывает) и, увидев незнакомую
 * метку, выбрасывает кэши и перерегистрирует воркер.
 *
 * ЧЕГО ЭТОТ КОД НЕ ДЕЛАЕТ — И ЭТО ГЛАВНОЕ. Он НЕ ТРОГАЕТ localStorage.
 * caches.delete() работает только с Cache API, registration.unregister() —c
 * регистрацией воркера; это отдельные хранилища. Списки покупок, закрепления,
 * вкусовой профиль анонима и сессия остаются на месте. Именно поэтому мы
 * сознательно НЕ используем Clear-Site-Data: "storage", который убил бы воркер
 * одной строкой на сервере, но вместе с ним стёр бы данные живых людей.
 *
 * ЧЕСТНОЕ ОГРАНИЧЕНИЕ. Этот код едет в бандле, а бандл тоже приходит из кэша:
 * если испорчен сам бандл, рубильник не выполнится. Спасает устройство
 * остальных кэшей — sc-static работает по StaleWhileRevalidate (фоновая
 * ревалидация чинит битый чанк со следующей загрузки), а sc-pages живёт всего
 * 30 минут. То есть «не выполнится никогда» не бывает, бывает «выполнится со
 * следующего захода». Третью линию на этот случай держит proxy.ts
 * (Clear-Site-Data: "cache").
 *
 * В нативной оболочке iOS сервис-воркера нет вовсе, кэшей Cache API тоже —
 * здесь этот компонент просто ничего не найдёт и тихо выйдет.
 */

// Метка, которую клиент видел в прошлый раз. Единственный ключ, который этот
// компонент пишет в localStorage, — и единственный, который он имеет право
// оттуда читать.
const EPOCH_KEY = "sc_cache_epoch";
// Страховка от петли перезагрузок: в пределах одной вкладки чистим максимум раз.
const DONE_KEY = "sc_cache_epoch_done";

async function purgeCaches(): Promise<void> {
  // 1. Выбрасываем ВСЕ кэши Cache API этого origin (sc-pages, sc-static,
  //    sc-images и precache воркера). Чужих здесь быть не может: Cache API
  //    изолирован по origin.
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }

  // 2. Снимаем регистрацию воркера. Открытую страницу он продолжит
  //    контролировать до перезагрузки — она идёт следующим шагом, и уже
  //    новый документ приедет из сети. Воркер зарегистрируется заново сам
  //    (скрипт регистрации next-pwa лежит в бандле) и соберёт чистый кэш.
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

export default function CacheKillSwitch() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const run = async () => {
      let stored: string | null = null;
      try {
        if (sessionStorage.getItem(DONE_KEY)) return;
        stored = localStorage.getItem(EPOCH_KEY);
      } catch {
        // Приватный режим/запрещённое хранилище — рубильник просто недоступен,
        // это не повод падать.
        return;
      }

      let epoch: string | null = null;
      try {
        const res = await fetch("/api/app-epoch", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        epoch = typeof data?.epoch === "string" && data.epoch ? data.epoch : null;
      } catch {
        // Офлайн или сбой сети. НИЧЕГО НЕ ДЕЛАЕМ: чистить кэш в момент, когда
        // сеть недоступна, — это оставить человека с пустым приложением.
        return;
      }

      if (cancelled || !epoch) return;

      // Первая встреча с меткой (новое устройство, только что почистили
      // браузер): запоминаем и НЕ чистим. Иначе каждый новый человек получал бы
      // лишнюю перезагрузку на ровном месте.
      if (stored === null) {
        try {
          localStorage.setItem(EPOCH_KEY, epoch);
        } catch {
          /* не смогли запомнить — спросим в следующий раз */
        }
        return;
      }

      if (stored === epoch) return;

      // Метку записываем ДО перезагрузки: иначе следующая загрузка снова
      // увидит расхождение и мы уйдём в петлю.
      try {
        localStorage.setItem(EPOCH_KEY, epoch);
        sessionStorage.setItem(DONE_KEY, "1");
      } catch {
        return;
      }

      await purgeCaches();
      if (!cancelled) window.location.reload();
    };

    // Откладываем до простоя: рубильник срабатывает в лучшем случае раз в
    // полгода, и занимать им первый кадр загрузки незачем.
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => void run(), { timeout: 4000 })
        : window.setTimeout(() => void run(), 2000);

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function" && typeof idle === "number") {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, []);

  return null;
}
