"use client";

import { useEffect, useState } from "react";
import { Activity, BarChart3, CircleDollarSign, Shield, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AnalyticsEvent = {
  party_id?: string | null;
  user_name?: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

type DashboardStats = {
  totalParties: number;
  paidParties: number;
  paywallViews: number;
  paymentSuccesses: number;
  recentEvents: AnalyticsEvent[];
};

const EMPTY_STATS: DashboardStats = {
  totalParties: 0,
  paidParties: 0,
  paywallViews: 0,
  paymentSuccesses: 0,
  recentEvents: [],
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "Нет даты";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Нет даты";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const shortenPartyId = (value?: string | null) => {
  if (!value) {
    return "Нет ID";
  }

  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
};

const getEventMeta = (eventType?: string | null) => {
  switch (eventType) {
    case "paywall_view_from_ai":
      return {
        label: "Открыл пейволл (ИИ)",
        className: "bg-amber-50 text-amber-700 ring-amber-200",
      };
    case "paywall_view_from_cart":
      return {
        label: "Открыл пейволл (список)",
        className: "bg-orange-50 text-orange-700 ring-orange-200",
      };
    case "paywall_payment_success":
      return {
        label: "Оплата успешна",
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      };
    case "shopping_list_opened":
      return {
        label: "Открыл список покупок",
        className: "bg-sky-50 text-sky-700 ring-sky-200",
      };
    case "ai_menu_generated_success":
      return {
        label: "Сгенерировал меню",
        className: "bg-violet-50 text-violet-700 ring-violet-200",
      };
    case "paywall_cancelled":
      return {
        label: "Закрыл пейволл",
        className: "bg-zinc-100 text-zinc-700 ring-zinc-200",
      };
    default:
      return {
        label: eventType ? eventType.replaceAll("_", " ") : "Неизвестное событие",
        className: "bg-zinc-100 text-zinc-700 ring-zinc-200",
      };
  }
};

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadMaintenanceStatus = async () => {
      setIsLoading(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("site_settings")
        .select("is_maintenance")
        .eq("id", 1)
        .single();

      if (error) {
        setErrorMessage("Не удалось загрузить статус режима обслуживания.");
        setIsLoading(false);
        return;
      }

      setIsMaintenance(Boolean(data?.is_maintenance));
      setIsLoading(false);
    };

    loadMaintenanceStatus();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadAnalytics = async () => {
      setIsAnalyticsLoading(true);
      setAnalyticsError("");

      const [
        partiesResult,
        recentEventsResult,
        paywallViewsResult,
        paymentSuccessResult,
      ] = await Promise.all([
        supabase.from("parties").select("is_paid"),
        supabase
          .from("analytics_events")
          .select("party_id, user_name, event_type, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .like("event_type", "paywall_view%"),
        supabase
          .from("analytics_events")
          .select("*", { count: "exact", head: true })
          .eq("event_type", "paywall_payment_success"),
      ]);

      if (
        partiesResult.error ||
        recentEventsResult.error ||
        paywallViewsResult.error ||
        paymentSuccessResult.error
      ) {
        setAnalyticsError("Не удалось загрузить аналитику.");
        setIsAnalyticsLoading(false);
        return;
      }

      const parties = partiesResult.data ?? [];
      const recentEvents = (recentEventsResult.data as AnalyticsEvent[] | null) ?? [];
      const paidParties = parties.filter((party) => Boolean(party.is_paid)).length;

      setStats({
        totalParties: parties.length,
        paidParties,
        paywallViews: paywallViewsResult.count ?? 0,
        paymentSuccesses: paymentSuccessResult.count ?? 0,
        recentEvents,
      });
      setIsAnalyticsLoading(false);
    };

    void loadAnalytics();
  }, [isAuthenticated]);

  const handleLogin = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password === "Artem.ker.09") {
      setIsAuthenticated(true);
      setPassword("");
      setErrorMessage("");
      return;
    }

    setErrorMessage("Неверный пароль.");
  };

  const handleToggleMaintenance = async () => {
    const nextValue = !isMaintenance;

    setIsUpdating(true);
    setErrorMessage("");

    const { error } = await supabase
      .from("site_settings")
      .update({ is_maintenance: nextValue })
      .eq("id", 1);

    if (error) {
      setErrorMessage("Не удалось обновить режим обслуживания.");
      setIsUpdating(false);
      return;
    }

    setIsMaintenance(nextValue);
    setIsUpdating(false);
  };

  const paymentConversion =
    stats.totalParties > 0 ? Math.round((stats.paidParties / stats.totalParties) * 100) : 0;
  const paywallConversion =
    stats.paywallViews > 0 ? Math.round((stats.paymentSuccesses / stats.paywallViews) * 100) : 0;

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10 text-zinc-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-[32px] border border-zinc-200 bg-white p-8 shadow-sm"
        >
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <Shield className="h-5 w-5 text-zinc-700" />
            </div>
            <div>
              <p className="text-sm tracking-[0.18em] text-zinc-500 uppercase">Admin</p>
              <h1 className="text-2xl font-semibold tracking-tight">Секретный вход</h1>
            </div>
          </div>

          <label className="mb-3 block text-sm font-medium text-zinc-600">
            Пароль разработчика
          </label>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Введите пароль"
            className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-base text-zinc-900 outline-none transition focus:border-transparent focus:bg-white focus:ring-2 focus:ring-black"
          />

          {errorMessage ? (
            <p className="mt-3 text-sm tracking-tight text-red-500">{errorMessage}</p>
          ) : null}

          <button
            type="submit"
            className="mt-6 w-full rounded-2xl bg-black py-4 text-base font-medium text-white transition hover:bg-zinc-800 active:scale-[0.99]"
          >
            Войти
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-7xl p-8">
        <header className="mb-8 rounded-[32px] border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Admin Dashboard</p>
              <h1 className="text-4xl font-semibold tracking-tight">Панель управления</h1>
              <p className="text-base leading-7 tracking-tight text-zinc-600">
                Следите за оплатами и активностью пользователей, не теряя быстрый доступ к
                глобальному режиму обслуживания.
              </p>
            </div>

            <div className="rounded-[28px] bg-zinc-50 p-4 xl:min-w-[420px]">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Wrench className="h-6 w-6 text-zinc-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-zinc-500">Сайт</p>
                  <h2 className="text-2xl font-semibold tracking-tight">Режим обслуживания</h2>
                  <p className="text-sm leading-6 tracking-tight text-zinc-600">
                    {isMaintenance
                      ? "Сайт сейчас работает в режиме обслуживания."
                      : "Сайт доступен для пользователей без ограничений."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleMaintenance}
                disabled={isLoading || isUpdating}
                className={`group inline-flex w-full items-center justify-between rounded-full px-4 py-4 text-left text-white shadow-lg transition ${
                  isMaintenance
                    ? "bg-emerald-500 hover:bg-emerald-400"
                    : "bg-red-500 hover:bg-red-400"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className="px-2">
                  <span className="block text-xs uppercase tracking-[0.18em] text-white/70">
                    {isMaintenance ? "Включено" : "Выключено"}
                  </span>
                  <span className="block text-lg font-semibold tracking-tight">
                    {isUpdating
                      ? "Сохраняем..."
                      : isMaintenance
                        ? "Перерыв активен"
                        : "Готовность к бою"}
                  </span>
                </span>
                <span
                  className={`relative h-10 w-[72px] rounded-full bg-white/25 p-1 transition ${
                    isMaintenance ? "bg-white/30" : "bg-black/15"
                  }`}
                >
                  <span
                    className={`block h-8 w-8 rounded-full bg-white shadow-md transition-transform ${
                      isMaintenance ? "translate-x-8" : "translate-x-0"
                    }`}
                  />
                </span>
              </button>

              {errorMessage ? (
                <p className="mt-4 text-sm tracking-tight text-red-500">{errorMessage}</p>
              ) : null}
            </div>
          </div>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <article className="rounded-[32px] border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <BarChart3 className="h-5 w-5 text-zinc-700" />
            </div>
            <p className="text-sm font-medium text-zinc-500">Банкеты</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold tracking-tight">
                {isAnalyticsLoading ? "..." : stats.totalParties}
              </span>
              <span className="pb-1 text-sm text-zinc-500">
                Оплаченных: {isAnalyticsLoading ? "..." : stats.paidParties}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              Общее число созданных банкетов и количество активированных оплат.
            </p>
          </article>

          <article className="rounded-[32px] border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <CircleDollarSign className="h-5 w-5 text-zinc-700" />
            </div>
            <p className="text-sm font-medium text-zinc-500">Конверсия в оплату</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold tracking-tight">
                {isAnalyticsLoading ? "..." : `${paymentConversion}%`}
              </span>
              <span className="pb-1 text-sm text-zinc-500">
                {stats.paidParties} из {stats.totalParties}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              Доля банкетов, которые были доведены до платного статуса.
            </p>
          </article>

          <article className="rounded-[32px] border border-zinc-200 bg-white p-7 shadow-sm">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
              <Activity className="h-5 w-5 text-zinc-700" />
            </div>
            <p className="text-sm font-medium text-zinc-500">Воронка пейволла</p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-4xl font-semibold tracking-tight">
                {isAnalyticsLoading ? "..." : stats.paywallViews}
              </span>
              <span className="pb-1 text-sm text-zinc-500">
                Оплаты: {isAnalyticsLoading ? "..." : stats.paymentSuccesses}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-zinc-600">
              Конверсия из открытия пейволла в успешную оплату: {paywallConversion}%.
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-[32px] border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-200 px-8 py-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Analytics</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Последние события</h2>
            </div>
            <p className="text-sm text-zinc-500">Показаны последние 50 записей из `analytics_events`.</p>
          </div>

          {analyticsError ? (
            <p className="px-8 py-6 text-sm tracking-tight text-red-500">{analyticsError}</p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50/80">
                <tr className="text-left text-sm text-zinc-500">
                  <th className="px-8 py-4 font-medium">Дата и время</th>
                  <th className="px-8 py-4 font-medium">ID банкета</th>
                  <th className="px-8 py-4 font-medium">Пользователь</th>
                  <th className="px-8 py-4 font-medium">Событие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {stats.recentEvents.length === 0 && !isAnalyticsLoading ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-10 text-center text-sm text-zinc-500">
                      Событий пока нет.
                    </td>
                  </tr>
                ) : null}

                {isAnalyticsLoading && stats.recentEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-8 py-10 text-center text-sm text-zinc-500">
                      Загружаем аналитику...
                    </td>
                  </tr>
                ) : null}

                {stats.recentEvents.map((event, index) => {
                  const meta = getEventMeta(event.event_type);

                  return (
                    <tr key={`${event.created_at ?? "event"}-${event.party_id ?? index}-${index}`}>
                      <td className="whitespace-nowrap px-8 py-5 text-sm text-zinc-600">
                        {formatDateTime(event.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-8 py-5 text-sm font-medium text-zinc-900">
                        {shortenPartyId(event.party_id)}
                      </td>
                      <td className="whitespace-nowrap px-8 py-5 text-sm text-zinc-600">
                        {event.user_name?.trim() || "anonymous"}
                      </td>
                      <td className="px-8 py-5 text-sm text-zinc-900">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
