"use client";

import { useIsNative } from "@/lib/native";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Проверка обновлений установленного PWA и ПРЕДЛОЖЕНИЕ обновиться.
 *
 * Зачем компонент вообще нужен. Браузер сам ходит за новым sw.js только при
 * навигации или примерно раз в сутки. iOS в standalone при повторном открытии
 * ВОЗОБНОВЛЯЕТ замороженный документ, навигации не происходит — и установленное
 * приложение может очень долго жить на старом бандле. Поэтому при загрузке и при
 * каждом возврате в приложение мы явно просим браузер сходить и проверить.
 *
 * ИСТОРИЯ, КОТОРУЮ ЗДЕСЬ НЕЛЬЗЯ ПОВТОРИТЬ. Раньше в этом файле стоял
 * `window.location.reload()` по событию controllerchange, а воркер собирался с
 * `skipWaiting`. Вместе это давало жалобу «зашёл на сайт — через десять секунд
 * он сам обновился»: десять секунд — время скачать и разложить precache новой
 * версии, после чего она захватывала открытую страницу, а мы её перезагружали.
 * Посреди режима «Готовим!» или наполовину набранного списка это просто потеря
 * того, что человек делал. Перезагрузка по событию убрана в PR #76.
 *
 * ЧТО ДОБАВЛЕНО СЕЙЧАС. `skipWaiting: false` в next.config.ts оставлен как был —
 * новая версия скачивается и ВСТАЁТ В ОЧЕРЕДЬ. Но раньше выйти из очереди она
 * могла только сама, когда закроется последний клиент на старой версии. В
 * standalone на iOS документ замораживается, а не закрывается, и «последний
 * клиент» может не наступать сутками — ровно так люди и застревали на старой
 * версии, когда нужно было доставить починку.
 *
 * Теперь у очереди есть выход, и открывает его ЧЕЛОВЕК. В собранном sw.js уже
 * есть обработчик сообщения SKIP_WAITING (его кладёт next-pwa) — не хватало
 * только отправителя. Если в очереди стоит новая версия, показываем спокойное
 * предложение с кнопкой «Обновить»; по нажатию шлём воркеру SKIP_WAITING и
 * перезагружаем страницу.
 *
 * ГРАНИЦА, КОТОРУЮ НЕЛЬЗЯ ПЕРЕХОДИТЬ: слушатель controllerchange вешается
 * ТОЛЬКО ВНУТРИ обработчика нажатия. Повесить его заранее — значит вернуть
 * ровно тот баг из PR #76: воркер может активироваться и сам (закрылась
 * последняя вкладка), и тогда страница перезагрузилась бы без спроса. Ни одной
 * перезагрузки, которую не запросил человек, отсюда не уходит.
 *
 * Сам сервис-воркер этот файл НЕ ТРОГАЕТ: ни одной настройки workbox, ни строки
 * в public/sw.js. Здесь только отправка сообщения уже существующему воркеру.
 *
 * КОГДА ПЛАШКА ПОЯВЛЯЕТСЯ — И ТОЛЬКО ТОГДА:
 *   1. в очереди реально стоит новый воркер (reg.waiting либо только что
 *      доустановившийся installing), И
 *   2. страницу уже контролирует воркер (controller !== null) — иначе это
 *      первая установка, и обновлять нечего, И
 *   3. про эту версию человеку ещё не говорили (см. OFFERED_KEY ниже).
 * В нативной оболочке не появляется никогда: воркера в WKWebView нет вовсе, да
 * и компонент до этого места не доходит (обёртка внизу файла).
 */

// Один и тот же id — sonner не покажет два предложения, если обновление
// заметили и на загрузке, и при возврате в приложение.
const TOAST_ID = "sw-update-available";

// ПОЧЕМУ ПЛАШКА ПОЯВЛЯЛАСЬ СЛИШКОМ ЧАСТО.
//
// Флаг «уже предлагали» был обычным ref — он живёт ровно столько, сколько живёт
// страница. А новая версия с skipWaiting: false стоит в очереди до тех пор,
// пока не закроется ПОСЛЕДНИЙ клиент на старой; в установленном приложении
// документ замораживается, а не закрывается, и очередь может стоять сутками.
// Получалось: человек закрыл предложение — и видел его снова при каждом
// открытии и каждой перезагрузке, про одну и ту же версию.
//
// Теперь отметка о показе переживает перезагрузку и привязана к ВЕРСИИ, на
// которой человек сидит: сказали про обновление один раз — и молчим, пока он не
// обновится. После обновления метка сборки другая, и о следующей версии снова
// можно сказать. Отметку ставим в момент показа: и «Обновить», и закрытие
// крестиком одинаково означают, что человек про обновление уже знает.
const OFFERED_KEY = "sc_sw_update_offered";
// Метку подставляет сборка (next.config.ts → env.NEXT_PUBLIC_BUILD_ID): на
// Vercel это SHA коммита.
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

function alreadyOfferedForThisVersion(): boolean {
  try {
    return localStorage.getItem(OFFERED_KEY) === BUILD_ID;
  } catch {
    // Приватный режим — отметку не сохранить. Тогда работает хотя бы ref в
    // пределах страницы: предложим один раз за заход, а не ни разу.
    return false;
  }
}

function rememberOffered(): void {
  try {
    localStorage.setItem(OFFERED_KEY, BUILD_ID);
  } catch {
    /* см. выше */
  }
}

// Как часто вообще спрашивать сервер про новую версию. Проверка висела на
// КАЖДОМ возврате в приложение — то есть на каждом переключении между
// приложениями уходил запрос за sw.js. Пятнадцати минут хватает, чтобы
// починка доехала за тот же заход, и достаточно, чтобы перестать дёргать сеть
// на каждое пробуждение экрана.
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function PWAUpdaterInner() {
  // Предложение показываем один раз за жизнь страницы: человек либо нажал, либо
  // сознательно закрыл, и навязываться второй раз — это уже мигание. Второй
  // заслон, переживающий перезагрузку, — отметка в localStorage (OFFERED_KEY).
  const offered = useRef(false);
  // Защита от двойной перезагрузки: controllerchange и страховочный таймер
  // могут сработать оба.
  const reloading = useRef(false);
  // checkForUpdate зовётся при каждом возврате в приложение, а слушатель
  // updatefound нужен ровно один: иначе на пятый возврат их висело бы пять.
  const watched = useRef(false);

  const applyUpdate = useCallback((waiting: ServiceWorker) => {
    if (reloading.current) return;

    const reload = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };

    // Вешаем ЗДЕСЬ, а не при монтировании — см. «ГРАНИЦА» в шапке файла.
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });

    // Страховка. clientsClaim: true в конфиге означает, что активировавшийся
    // воркер заберёт управление и controllerchange придёт. Но если он почему-то
    // не придёт (воркер уже контролировал страницу, гонка при активации),
    // человек не должен остаться с нажатой кнопкой и ничем в ответ.
    window.setTimeout(reload, 3000);

    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  const offerUpdate = useCallback(
    (waiting: ServiceWorker) => {
      if (offered.current || alreadyOfferedForThisVersion()) return;
      offered.current = true;
      rememberOffered();

      toast("Доступна новая версия", {
        id: TOAST_ID,
        description: "Обновление применится после перезагрузки страницы.",
        // Не исчезает сама: это не отчёт о событии, а предложение, на которое
        // человек отвечает, когда ему удобно. Крестик у тостов включён глобально
        // (components/ui/AppToaster), так что отказаться можно.
        duration: Infinity,
        action: {
          label: "Обновить",
          onClick: () => applyUpdate(waiting),
        },
      });
    },
    [applyUpdate],
  );

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const watchRegistration = (reg: ServiceWorkerRegistration) => {
      // Версия уже стоит в очереди — например, доехала в прошлый заход и так и
      // не активировалась, потому что вкладку не закрывали.
      if (reg.waiting && navigator.serviceWorker.controller) {
        offerUpdate(reg.waiting);
      }

      // Версия приезжает прямо сейчас. Подписываемся один раз на регистрацию,
      // а не на каждый вызов checkForUpdate.
      if (watched.current) return;
      watched.current = true;

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // controller !== null отличает ОБНОВЛЕНИЕ от первой установки воркера:
          // при первой установке предлагать нечего, страница и так свежая.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            offerUpdate(installing);
          }
        });
      });
    };

    // Время последнего похода за sw.js. Ноль — ещё не ходили.
    let lastCheck = 0;

    const checkForUpdate = (force: boolean) => {
      const now = Date.now();
      if (!force && now - lastCheck < CHECK_INTERVAL_MS) return;
      lastCheck = now;
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (!reg || cancelled) return;
          watchRegistration(reg);
          return reg.update();
        })
        .catch(() => {
          /* офлайн/сеть — не критично, попробуем при следующем возврате */
        });
    };

    checkForUpdate(true);

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate(false);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [offerUpdate]);

  return null;
}

// В нативной оболочке звать «установить приложение» бессмысленно — мы уже внутри
// приложения. Обёртка вынесена отдельным компонентом намеренно: ранний return
// внутри PWAUpdaterInner менял бы число вызванных хуков между первым рендером
// (флаг ещё false) и следующим, а это ошибка React. Здесь хук ровно один и
// вызывается всегда. В вебе флаг всегда false — поведение не меняется.
//
// В нативном iOS сервис-воркера нет в принципе (см. шапку next.config.ts),
// поэтому и предлагать там нечего: приложение обновляется через App Store.
export default function PWAUpdater() {
  const isNative = useIsNative();
  if (isNative) return null;
  return <PWAUpdaterInner />;
}
