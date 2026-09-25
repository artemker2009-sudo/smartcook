"use client";

// Состояние Премиума и остаток подборов на неделе — один хук на все экраны:
// страницу «Премиум», строку под кнопками подбора, блок в профиле и шторку.
//
// Почему хук, а не три копии fetch: числа обязаны совпадать везде, а собранные
// в трёх местах по-разному они разъезжаются при первой же правке правила.
// Данные приходят ТОЛЬКО с сервера (/api/premium/status): ни срок Премиума, ни
// счётчик подборов клиент не считает сам — он их только показывает.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COOK_USER_ID_KEY } from "@/lib/guestIdentity";

export type PremiumStatus = {
  isPremium: boolean;
  premiumUntil: string | null;
  isForever: boolean;
  featureEnabled: boolean;
  freePodborsPerWeek: number;
  /** Сколько подборов уже сделано на этой неделе. null — не смогли посчитать. */
  used: number | null;
  /** Сколько осталось. null — не смогли посчитать, показывать нечего. */
  remaining: number | null;
  resetsAt: string;
};

/** Событие «счётчик подборов изменился» — после удачного подбора и после оплаты. */
export const PREMIUM_STATUS_CHANGED_EVENT = "smartcook:premium-status-changed";

export function notifyPremiumStatusChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PREMIUM_STATUS_CHANGED_EVENT));
}

function readGuestSessionId(): string | null {
  try {
    return localStorage.getItem(COOK_USER_ID_KEY);
  } catch {
    return null;
  }
}

/** Запрос состояния. Отдельной функцией — её зовёт и хук, и разовые проверки. */
export async function fetchPremiumStatus(): Promise<PremiumStatus | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const res = await fetch("/api/premium/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // sessionId уходит ТЕЛОМ, а не в адресе: это фактический токен владения,
      // и в query-строке он попадал бы в логи, Referer и историю браузера.
      body: JSON.stringify({ sessionId: readGuestSessionId() }),
    });
    if (!res.ok) return null;
    return (await res.json()) as PremiumStatus;
  } catch {
    return null;
  }
}

/**
 * Состояние с автообновлением. null — ещё не загрузили или не смогли: экраны
 * в этом случае не показывают ничего, а не «осталось 0».
 */
export function usePremiumStatus(): { status: PremiumStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<PremiumStatus | null>(null);

  const refresh = useCallback(() => {
    void fetchPremiumStatus().then((s) => {
      if (s) setStatus(s);
    });
  }, []);

  useEffect(() => {
    refresh();

    // Вход/выход меняет владельца счётчика: у гостя свои подборы, у аккаунта
    // свои, и после входа строка «осталось N» обязана пересчитаться.
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    window.addEventListener(PREMIUM_STATUS_CHANGED_EVENT, refresh);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener(PREMIUM_STATUS_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return { status, refresh };
}
