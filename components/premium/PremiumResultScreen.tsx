"use client";

// Экраны после Robokassa: /premium/success и /premium/fail.
//
// ГЛАВНОЕ: успех здесь НИЧЕГО НЕ ВЫДАЁТ. Премиум включает только ResultURL, куда
// приходит подписанное уведомление от сервера Robokassa. Этот экран лишь
// опрашивает статус заказа и показывает, что происходит. Иначе Премиум
// выдавался бы по адресу в адресной строке, который человек может набрать сам.
//
// Ждём до ~30 секунд: обычно уведомление приходит за секунду-две, но
// платёжные сети иногда задерживают. Не дождались — это НЕ ошибка, и текст
// именно об этом: «Премиум включится автоматически».

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { reachGoal } from "@/lib/metrika";
import { formatPremiumDate } from "@/lib/premiumPeriod";
import { useAuthModal } from "@/components/modals/useAuthModal";
import AuthModal from "@/components/modals/AuthModal";
import { notifyPremiumStatusChanged } from "@/components/premium/usePremiumStatus";
import {
  PREMIUM_COLORS as C,
  premiumScreenStyle,
  premiumContentStyle,
} from "@/components/premium/premiumStyles";

const POLL_TOTAL_MS = 30_000;
const POLL_EVERY_MS = 2_000;

type Phase = "checking" | "done" | "slow" | "failed" | "anon";

export function PremiumSuccessScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const invId = Number(params.get("InvId") || params.get("invId") || 0);

  // Начальное состояние выводится из адреса, а не ставится эффектом: без InvId
  // опрашивать нечего, и сразу показываем «оплата ещё обрабатывается».
  const [phase, setPhase] = useState<Phase>(() => (invId ? "checking" : "slow"));
  // Счётчик перезапускает опрос после входа: значение меняется — эффект ниже
  // стартует заново с новой сессией.
  const [attempt, setAttempt] = useState(0);
  const [until, setUntil] = useState<string | null>(null);
  const [isForever, setIsForever] = useState(false);
  // Цель premium_paid отправляем РОВНО ОДИН раз за экран: опрос повторяется
  // каждые две секунды, и без этой защёлки в Метрику ушло бы пятнадцать оплат.
  const reported = useRef(false);

  const check = useCallback(async (): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return false;

      const res = await fetch("/api/premium/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ invId }),
      });
      if (!res.ok) return false;
      const json = await res.json();

      if (json?.status === "paid" && json?.isPremium) {
        setUntil(json.premiumUntil ?? null);
        setIsForever(!!json.isForever);
        setPhase("done");
        if (!reported.current) {
          reported.current = true;
          reachGoal("premium_paid", { plan: json.plan, amount: json.amountRub });
          // Счётчик подборов и блок в профиле должны обновиться сами.
          notifyPremiumStatusChanged();
        }
        return true;
      }
    } catch {
      // Сеть моргнула — просто попробуем на следующем шаге опроса.
    }
    return false;
  }, [invId]);

  // Вход прямо с этого экрана. Робокасса возвращает человека по ссылке, и
  // попасть сюда гостем — обычное дело: приложения живут на другом домене,
  // сессия у каждого origin своя. После входа опрос начинается заново.
  const auth = useAuthModal({
    onFinished: () => {
      setPhase(invId ? "checking" : "slow");
      setAttempt((n) => n + 1);
    },
  });

  useEffect(() => {
    if (!invId) return;
    let stop = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (stop) return;

      // Гостю опрашивать нечего: /api/premium/order отдаёт заказ только по
      // проверенному JWT. Раньше это тонуло в общем «не удалось» и человек
      // тридцать секунд смотрел «проверяем оплату», а потом получал кнопку в
      // пустой профиль. Теперь говорим прямо, что надо войти.
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) {
        setPhase("anon");
        return;
      }

      if (await check()) return;
      if (Date.now() - startedAt >= POLL_TOTAL_MS) {
        setPhase("slow");
        return;
      }
      setTimeout(tick, POLL_EVERY_MS);
    };
    void tick();

    return () => {
      stop = true;
    };
  }, [invId, check, attempt]);

  return (
    <div style={premiumScreenStyle}>
      <div style={{ ...premiumContentStyle, paddingTop: 48, gap: 16 }}>
        {phase === "checking" && (
          <>
            <h1 style={titleStyle}>Проверяем оплату…</h1>
            <p style={textStyle}>Это займёт несколько секунд. Не закрывайте страницу.</p>
          </>
        )}

        {phase === "done" && (
          <>
            <h1 style={titleStyle}>
              Готово! Премиум{" "}
              {isForever || !until ? "навсегда" : `до ${formatPremiumDate(new Date(until))}`}
            </h1>
            <p style={textStyle}>Подборы больше не ограничены неделей.</p>
            <button type="button" onClick={() => router.push("/search")} style={primaryButtonStyle}>
              Сделать подбор
            </button>
          </>
        )}

        {phase === "anon" && (
          <>
            <h1 style={titleStyle}>Войдите в аккаунт, с которого платили</h1>
            <p style={textStyle}>Премиум уже там. Деньги ушли — платить второй раз не нужно.</p>
            <button
              type="button"
              onClick={() => auth.open("login")}
              style={primaryButtonStyle}
            >
              Войти
            </button>
          </>
        )}

        {phase === "slow" && (
          <>
            <h1 style={titleStyle}>Оплата ещё обрабатывается</h1>
            <p style={textStyle}>
              Премиум включится автоматически, обычно за минуту. Деньги уже ушли — платить
              второй раз не нужно.
            </p>
            <Link href="/profile" style={{ ...primaryButtonStyle, textDecoration: "none" }}>
              Открыть профиль
            </Link>
          </>
        )}
      </div>

      <AuthModal {...auth.authModalProps} />
    </div>
  );
}

export function PremiumFailScreen() {
  return (
    <div style={premiumScreenStyle}>
      <div style={{ ...premiumContentStyle, paddingTop: 48, gap: 16 }}>
        <h1 style={titleStyle}>Оплата не прошла</h1>
        <p style={textStyle}>Деньги не списаны.</p>
        <Link href="/premium" style={{ ...primaryButtonStyle, textDecoration: "none" }}>
          Попробовать ещё раз
        </Link>
      </div>
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 26,
  lineHeight: "32px",
  fontWeight: 800,
  letterSpacing: "-0.3px",
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: "22px",
  color: C.textSecondary,
};

const primaryButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 56,
  width: "100%",
  boxSizing: "border-box",
  border: "none",
  borderRadius: 16,
  background: C.accent,
  color: C.surface,
  fontSize: 18,
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
  marginTop: 8,
};
