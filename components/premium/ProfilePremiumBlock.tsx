"use client";

// Блок «Премиум» в личном кабинете: срок (или остаток бесплатных подборов) и
// история покупок.
//
// Правило App Store 3.1.1 действует и здесь: в нативном iOS у человека с
// Премиумом видно «Премиум до …», но кнопки «Продлить» нет, а у человека без
// Премиума нет ссылки «Что даёт Премиум». Счётчик подборов остаётся — это не
// призыв к оплате (SPEC 1). История покупок остаётся тоже: это отчёт о том,
// что уже оплачено, а не предложение платить.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Crown } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { FEATURE_PREMIUM } from "@/lib/features";
import { useInstallEnv } from "@/lib/installEnv";
import { isPaymentUiBlocked } from "@/lib/premiumIos";
import { formatPremiumDate, pluralPodbor } from "@/lib/premiumPeriod";
import { PREMIUM_PLANS } from "@/lib/premiumPlans";
import { usePremiumStatus } from "@/components/premium/usePremiumStatus";
import type { PremiumHistoryItem } from "@/app/api/premium/history/route";

const PLAN_NAMES: Record<string, string> = Object.fromEntries(
  PREMIUM_PLANS.map((p) => [p.id, p.name]),
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function ProfilePremiumBlock() {
  const { status } = usePremiumStatus();
  const hidePayLinks = isPaymentUiBlocked(useInstallEnv());
  const [history, setHistory] = useState<PremiumHistoryItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/premium/history", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        const json = res.ok ? await res.json() : null;
        // Пустой список И при сбое: иначе заголовок «История покупок» висит без
        // единой строки под ним — именно это и было видно на превью, когда
        // запрос отвечал 401. Лучше честное «Покупок пока нет», чем пустота.
        if (alive) setHistory(Array.isArray(json?.items) ? json.items : []);
      } catch {
        if (alive) setHistory([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [status?.isPremium]);

  // Флаг выключен — блока нет вовсе: продавать нечего, а счётчик подборов без
  // лимита ничего не значит.
  if (!FEATURE_PREMIUM) return null;
  if (!status) return null;

  const until = status.premiumUntil ? new Date(status.premiumUntil) : null;

  return (
    <div className="card" style={{ padding: "var(--space-4)", marginBottom: "var(--space-3)" }}>
      <h2
        style={{
          margin: "0 0 var(--space-2) 0",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <Crown size={18} style={{ color: "var(--color-accent)" }} aria-hidden /> Премиум
      </h2>

      {status.isPremium ? (
        <>
          <p
            style={{
              margin: "0 0 var(--space-1) 0",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-semibold)",
              color: "var(--color-text)",
            }}
          >
            {status.isForever || !until
              ? "Премиум навсегда"
              : `Премиум до ${formatPremiumDate(until)}`}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-caption)",
              color: "var(--color-text-muted)",
            }}
          >
            Автоплатежей нет. Продлите вручную, когда захотите.
          </p>
          {!hidePayLinks && !status.isForever && (
            <Link
              href="/premium"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                marginTop: "var(--space-3)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-accent)",
                textDecoration: "none",
              }}
            >
              Продлить <ChevronRight size={16} aria-hidden />
            </Link>
          )}
        </>
      ) : (
        <>
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-body)",
              color: "var(--color-text-secondary)",
            }}
          >
            {/* Склонение по ОСТАТКУ, а не по лимиту: «осталось 1 из 1 подбор»
                получалось, когда слово согласовывали с числом после «из».
                «осталось 2 подбора из 3» читается верно при любых числах. */}
            {status.remaining === null
              ? `Бесплатно: ${status.freePodborsPerWeek} ${pluralPodbor(status.freePodborsPerWeek)} в неделю`
              : `Бесплатно: осталось ${status.remaining} ${pluralPodbor(status.remaining)} из ${status.freePodborsPerWeek} на этой неделе`}
          </p>
          {!hidePayLinks && (
            <Link
              href="/premium"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                marginTop: "var(--space-3)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-semibold)",
                color: "var(--color-accent)",
                textDecoration: "none",
              }}
            >
              Что даёт Премиум <ChevronRight size={16} aria-hidden />
            </Link>
          )}
        </>
      )}

      {/* Заголовок появляется вместе с содержимым: пустая «История покупок»
          на кадр загрузки выглядит как сломанный блок. */}
      {history !== null ? (
      <div
        style={{
          marginTop: "var(--space-4)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        <h3
          style={{
            margin: "0 0 var(--space-2) 0",
            fontSize: "var(--font-size-caption)",
            fontWeight: "var(--font-weight-semibold)",
            color: "var(--color-text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
          }}
        >
          История покупок
        </h3>

        {history.length === 0 ? (
          <p
            style={{
              margin: 0,
              fontSize: "var(--font-size-caption)",
              color: "var(--color-text-muted)",
            }}
          >
            Покупок пока нет
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {history.map((item) => (
              <li
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "var(--space-2)",
                  padding: "var(--space-1) 0",
                  fontSize: "var(--font-size-caption)",
                }}
              >
                <span style={{ color: "var(--color-text-muted)" }}>{formatDate(item.date)}</span>
                <span style={{ flexGrow: 1, color: "var(--color-text)" }}>
                  {item.status === "gift"
                    ? `Подарок от SmartCook${item.label ? ` · ${item.label}` : ""}`
                    : PLAN_NAMES[item.kind] || item.kind}
                </span>
                <span style={{ whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                  {item.status === "gift"
                    ? "—"
                    : `${item.amountRub} ₽ · ${item.status === "refunded" ? "Возврат" : "Оплачено"}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      ) : null}
    </div>
  );
}
