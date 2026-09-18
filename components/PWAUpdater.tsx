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
 */

// Один и тот же id — sonner не покажет два предложения, если обновление
// заметили и на загрузке, и при возврате в приложение.
const TOAST_ID = "sw-update-available";

function PWAUpdaterInner() {
  // Предложение показываем один раз за жизнь страницы: человек либо нажал, либо
  // сознательно закрыл, и навязываться второй раз — это уже мигание.
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
      if (offered.current) return;
      offered.current = true;

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

    const checkForUpdate = () => {
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

    checkForUpdate();

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkForUpdate();
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
