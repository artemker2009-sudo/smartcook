"use client";

// Правило Apple 3.1.1: в iOS-приложении не должно быть ни кнопок, ни ссылок,
// ни цен, ведущих к оплате мимо Apple. /premium и /oferta — это именно они,
// поэтому внутри нативной оболочки iOS обе страницы не показываются:
// человека сразу возвращает на Главную.
//
// Почему проверка КЛИЕНТСКАЯ, а не редирект в middleware: среду определяет
// глобал Capacitor внутри WebView, серверу он недоступен в принципе. Отличить
// запрос из приложения от запроса из Safari на том же телефоне нечем —
// нативная сборка ходит на тот же origin и своего User-Agent не добавляет.
//
// ПОЧЕМУ НЕ ПРЯЧЕМ НА КАДР ГИДРАЦИИ ("unknown"). Соблазн был: не рисовать
// страницу, пока среда неизвестна. Но тогда в HTML первого ответа нет ничего —
// а /premium обязана индексироваться (SPEC 2.4) и её открывает робот
// Robokassa. Платим одним кадром: в приложении страница успевает мелькнуть до
// гидрации, после чего мгновенно сменяется Главной. Это тот же приём, которым
// в приложении убран футер (components/Footer.tsx).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useInstallEnv } from "@/lib/installEnv";
import { isPaymentUiBlocked } from "@/lib/premiumIos";

/** true — мы внутри iOS-приложения, платёжный экран показывать нельзя. */
export function useIosPaymentBlocked(): boolean {
  const env = useInstallEnv();
  const router = useRouter();
  const blocked = isPaymentUiBlocked(env);

  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  return blocked;
}

/** Обёртка: детей рисуем везде, кроме нативного iOS. */
export default function NativeIosGuard({ children }: { children: React.ReactNode }) {
  return useIosPaymentBlocked() ? null : <>{children}</>;
}
