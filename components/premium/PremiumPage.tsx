"use client";

// Страница «Премиум» — по утверждённому макету docs/premium/premium-page.dc.html.
// Цвета, размеры, тексты, порядок блоков и иконки взяты оттуда без изменений;
// отличия от макета ровно те, что перечислены в SPEC 2.4 (число подборов из
// настройки, живые даты, состояния «гость» и «уже Премиум»).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import {
  PREMIUM_PLANS,
  DEFAULT_PLAN_ID,
  formatPriceRub,
  type PremiumPlanId,
} from "@/lib/premiumPlans";
import { formatPremiumDate, payUntilText, pluralPodbor } from "@/lib/premiumPeriod";
import { useAuthModal } from "@/components/modals/useAuthModal";
import { usePremiumStatus } from "@/components/premium/usePremiumStatus";
import AuthModal from "@/components/modals/AuthModal";
import {
  PREMIUM_COLORS as C,
  premiumScreenStyle,
  premiumContentStyle,
} from "@/components/premium/premiumStyles";
import {
  BackIcon,
  PodborIcon,
  ShieldIcon,
  ReceiptIcon,
  CalendarIcon,
  RefundIcon,
} from "@/components/premium/PremiumIcons";

type Props = {
  /** Бесплатных подборов в неделю — из premium_settings, посчитано на сервере. */
  freePodbors: number;
  /** Время серверного рендера. Нужно, чтобы первый кадр клиента совпал с SSR. */
  nowIso: string;
  /**
   * Готова ли оплата: флаг включён И ключи Robokassa на месте. Считается на
   * сервере — браузеру про наличие ключей знать неоткуда.
   */
  paymentReady: boolean;
};

const PLAN_FEATURES = [
  {
    Icon: ShieldIcon,
    title: "Без автоплатежей",
    text: "Деньги спишутся, только когда вы сами нажмёте «Оплатить». Срок закончится — просто станет бесплатно.",
  },
  {
    Icon: ReceiptIcon,
    title: "Чек сразу",
    text: "После оплаты придёт чек самозанятого из «Мой налог».",
  },
  {
    Icon: CalendarIcon,
    title: "Всё видно в профиле",
    text: "До какого числа действует Премиум и история покупок.",
  },
  {
    Icon: RefundIcon,
    title: "Можно вернуть",
    text: "Передумали в течение 14 дней — вернём деньги полностью.",
  },
] as const;

export default function PremiumPage({ freePodbors: freePodborsProp, nowIso, paymentReady }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<PremiumPlanId>(DEFAULT_PLAN_ID);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [paying, setPaying] = useState(false);

  // Срок Премиума и остаток подборов — общим хуком, тем же, что у строки под
  // кнопками подбора и у блока в профиле. Числа обязаны совпадать везде.
  const { status } = usePremiumStatus();

  // Серверный рендер страницы живёт 5 минут (revalidate), а статус приходит
  // свежим — поэтому, как только он пришёл, число берём из него.
  const freePodbors = status?.freePodborsPerWeek ?? freePodborsProp;

  // Даты («Премиум до 24 октября») считаются от НАСТОЯЩЕГО «сейчас», но первый
  // кадр обязан совпасть с серверной разметкой — иначе hydration mismatch.
  // Поэтому до монтирования берём момент серверного рендера, после — реальный.
  const [now, setNow] = useState(() => new Date(nowIso));
  useEffect(() => {
    setNow(new Date());
  }, []);

  const currentPlan = PREMIUM_PLANS.find((p) => p.id === picked) ?? PREMIUM_PLANS[0];

  useEffect(() => {
    reachGoal("premium_page_view");

    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data.user ?? null);
      setAuthChecked(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Оплата. Вызывается и напрямую (залогинен), и сразу после входа гостя.
  const startPayment = useCallback(
    async (planId: PremiumPlanId) => {
      reachGoal("premium_pay_click", { plan: planId });

      if (!paymentReady) {
        toast("Оплата заработает в ближайшие дни");
        return;
      }

      setPaying(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          toast.error("Войдите в аккаунт, чтобы оплатить");
          return;
        }
        const res = await fetch("/api/premium/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plan: planId }),
        });
        const payload = await res.json().catch(() => null);

        if (res.ok && payload?.paymentUrl) {
          window.location.href = payload.paymentUrl as string;
          return;
        }
        // 503 — «ключей нет»: это не поломка, а «ещё не включили».
        toast(payload?.error || "Оплата заработает в ближайшие дни");
      } catch {
        toast.error("Не удалось начать оплату. Попробуйте ещё раз.");
      } finally {
        setPaying(false);
      }
    },
    [paymentReady],
  );

  // Гость: вход → и сразу обратно к оплате выбранного тарифа (SPEC 0).
  const auth = useAuthModal({
    onFinished: () => {
      void startPayment(picked);
    },
  });

  const onPayClick = () => {
    if (!user) {
      auth.open("register");
      return;
    }
    void startPayment(picked);
  };

  // «Назад» — туда, откуда пришли; при прямом заходе по ссылке истории нет,
  // и router.back() увёл бы человека с сайта. Запасной выход — Главная.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  const isForeverPremium = !!status?.isPremium && status.isForever;
  const untilDate = status?.premiumUntil ? new Date(status.premiumUntil) : null;

  const payLabel = user || !authChecked
    ? `Оплатить ${formatPriceRub(currentPlan.priceRub)}`
    : `Войти и оплатить ${formatPriceRub(currentPlan.priceRub)}`;

  return (
    <div style={premiumScreenStyle}>
      <header
        style={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          position: "relative",
          // Вырез сверху держит шапка страницы (см. lib «Безопасные зоны»).
          paddingTop: "var(--safe-top, 0px)",
          boxSizing: "content-box",
        }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label="Назад"
          style={{
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.text,
            position: "relative",
            zIndex: 1,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <BackIcon />
        </button>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "var(--safe-top, 0px)",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 17,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          Премиум
        </div>
      </header>

      <div style={premiumContentStyle}>
        {/* Шапка: логотип, обещание, что такое «подбор». */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src="/icon-192.png"
              alt=""
              width={40}
              height={40}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: "block",
                boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
              }}
            />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.accent }}>
              SmartCook Премиум
            </span>
          </div>

          {/* Плашка «у вас уже Премиум» — только когда он правда есть. */}
          {status?.isPremium && (
            <div
              style={{
                background: C.accentSelectedBg,
                border: `1.5px solid ${C.accent}`,
                borderRadius: 16,
                padding: "14px 16px",
                fontSize: 16,
                lineHeight: "22px",
                fontWeight: 700,
                color: C.accent,
              }}
            >
              {isForeverPremium
                ? "У вас Премиум навсегда"
                : `У вас Премиум до ${untilDate ? formatPremiumDate(untilDate, now) : "—"}`}
            </div>
          )}

          <h1
            style={{
              margin: 0,
              fontSize: 32,
              lineHeight: "36px",
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}
          >
            Подборы без лимита
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: "22px", color: C.textSecondary }}>
            Бесплатно — {freePodbors} {pluralPodbor(freePodbors)} в неделю. С Премиумом —
            сколько нужно.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <span style={roundIconStyle}>
              <PodborIcon />
            </span>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: C.textSecondary }}>
              <b style={{ color: C.text }}>Подбор</b> — вы фотографируете продукты или пишете,
              что есть дома, и получаете рецепты.
            </p>
          </div>
        </section>

        {/* Тарифы. У «Премиума навсегда» покупать больше нечего — блок скрыт. */}
        {!isForeverPremium && (
          <>
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h2 style={sectionTitleStyle}>Выберите срок</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {PREMIUM_PLANS.map((plan) => {
                  const on = plan.id === picked;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setPicked(plan.id)}
                      aria-pressed={on}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        width: "100%",
                        boxSizing: "border-box",
                        minHeight: 76,
                        padding: "14px 16px",
                        borderRadius: 16,
                        border: on ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
                        background: on ? C.accentSelectedBg : C.surface,
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        color: C.text,
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          border: `2px solid ${on ? C.accent : C.ring}`,
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {on && (
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              background: C.accent,
                              display: "block",
                            }}
                          />
                        )}
                      </span>
                      <span
                        style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 3 }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span style={{ fontSize: 17, lineHeight: "22px", fontWeight: 700 }}>
                            {plan.name}
                          </span>
                          {plan.badge && (
                            <span
                              style={{
                                fontSize: 12,
                                lineHeight: "16px",
                                fontWeight: 700,
                                color: C.surface,
                                background: C.accent,
                                padding: "3px 8px",
                                borderRadius: 999,
                              }}
                            >
                              {plan.badge}
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 14, lineHeight: "18px", color: C.textMuted }}>
                          {plan.sub}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 20,
                          lineHeight: "24px",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatPriceRub(plan.priceRub)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -8 }}
            >
              <button
                type="button"
                onClick={onPayClick}
                disabled={paying}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 56,
                  width: "100%",
                  border: "none",
                  borderRadius: 16,
                  background: C.accent,
                  color: C.surface,
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  boxShadow: "0 6px 16px rgba(11,117,82,0.25)",
                  cursor: paying ? "progress" : "pointer",
                  opacity: paying ? 0.7 : 1,
                }}
              >
                {status?.isPremium ? "Продлить" : payLabel}
              </button>
              <p
                style={{
                  margin: 0,
                  textAlign: "center",
                  fontSize: 14,
                  lineHeight: "20px",
                  color: C.textSecondary,
                }}
              >
                {payUntilText(currentPlan, now)}
              </p>
              <p
                style={{
                  margin: "-6px 0 0 0",
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: "18px",
                  color: C.textMuted,
                }}
              >
                СБП или картой через Robokassa
              </p>
            </section>
          </>
        )}

        {/* Четыре обещания. */}
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 20,
            padding: "2px 16px",
          }}
        >
          {PLAN_FEATURES.map(({ Icon, title, text }, i) => (
            <div
              key={title}
              style={{
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                padding: "14px 0",
                borderBottom:
                  i === PLAN_FEATURES.length - 1 ? "none" : `1px solid ${C.borderSoft}`,
              }}
            >
              <span style={roundIconStyle}>
                <Icon />
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ fontSize: 16, lineHeight: "22px", fontWeight: 700 }}>{title}</div>
                <div style={{ fontSize: 14, lineHeight: "20px", color: C.textMuted }}>{text}</div>
              </div>
            </div>
          ))}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={sectionTitleStyle}>Бесплатно всегда</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              "Идеи",
              "Список покупок",
              "Избранное",
              "«Готовим!»",
              `${freePodbors} ${pluralPodbor(freePodbors)} в неделю`,
            ].map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: 15,
                  lineHeight: "20px",
                  fontWeight: 600,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 999,
                  padding: "8px 14px",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p
            style={{
              margin: 0,
              textAlign: "center",
              fontSize: 13,
              lineHeight: "18px",
              color: C.textMuted,
            }}
          >
            Нажимая «Оплатить», вы принимаете{" "}
            <a
              href="/oferta"
              style={{
                color: C.accent,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              условия оферты
            </a>
            .
          </p>
          <div
            style={{
              borderTop: `1px solid ${C.border}`,
              paddingTop: 14,
              textAlign: "center",
              fontSize: 12,
              lineHeight: "18px",
              color: C.textMuted,
            }}
          >
            Самозанятый Кернасовский Артём Сергеевич, ИНН 773128530191
            <br />
            smartcook.dev@inbox.ru · +7 925 777-11-75
          </div>
        </section>
      </div>

      <AuthModal {...auth.authModalProps} />
    </div>
  );
}

const roundIconStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 18,
  background: C.accentSoft,
  color: C.accent,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  lineHeight: "24px",
  fontWeight: 800,
  letterSpacing: "-0.2px",
};
