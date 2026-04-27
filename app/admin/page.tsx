"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Activity, BarChart3, CircleDollarSign, Shield, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AnalyticsEvent = {
  party_id?: string | null;
  user_name?: string | null;
  event_type?: string | null;
  created_at?: string | null;
};

type PartyRecord = {
  id?: string | null;
  created_at?: string | null;
  is_paid?: boolean | null;
  user_name?: string | null;
  name?: string | null;
  creator_name?: string | null;
  organizer_name?: string | null;
  created_by?: string | null;
  owner_name?: string | null;
  host_name?: string | null;
};

type DashboardStats = {
  parties: PartyRecord[];
  recentEvents: AnalyticsEvent[];
};

const EMPTY_STATS: DashboardStats = {
  parties: [],
  recentEvents: [],
};

const TABS = [
  { id: "management", label: "Управление" },
  { id: "analytics", label: "Аналитика" },
  { id: "purchases", label: "История покупок" },
] as const;

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

const getPartyCreatorName = (party: PartyRecord) => {
  const candidates = [
    party.creator_name,
    party.organizer_name,
    party.owner_name,
    party.host_name,
    party.user_name,
    party.name,
    party.created_by,
  ];

  return candidates.find((value) => value?.trim())?.trim() ?? null;
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
  const [activeTab, setActiveTab] = useState("management");
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

      const [partiesResult, recentEventsResult] = await Promise.all([
        supabase.from("parties").select("*"),
        supabase
          .from("analytics_events")
          .select("party_id, user_name, event_type, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (partiesResult.error || recentEventsResult.error) {
        setAnalyticsError("Не удалось загрузить аналитику.");
        setIsAnalyticsLoading(false);
        return;
      }

      const parties = (partiesResult.data as PartyRecord[] | null) ?? [];
      const recentEvents = (recentEventsResult.data as AnalyticsEvent[] | null) ?? [];

      setStats({
        parties,
        recentEvents,
      });
      setIsAnalyticsLoading(false);
    };

    void loadAnalytics();
  }, [isAuthenticated]);

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
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

  const totalParties = stats.parties.length;
  const paidParties = stats.parties.filter((party) => Boolean(party.is_paid)).length;
  const paymentConversion = totalParties > 0 ? Math.round((paidParties / totalParties) * 100) : 0;
  const paidPartyHistory = stats.parties.filter((party) => Boolean(party.is_paid));

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-10 text-zinc-900">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-8 shadow-sm"
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
            className="w-full rounded-2xl border border-zinc-100 bg-zinc-50 px-5 py-4 text-base text-zinc-900 outline-none transition focus:border-transparent focus:bg-white focus:ring-2 focus:ring-black"
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
      <div className="mx-auto max-w-7xl px-6 py-8 md:px-8">
        <header className="mb-8 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-3">
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Admin Dashboard</p>
              <h1 className="text-4xl font-semibold tracking-tight">Панель управления</h1>
              <p className="text-base leading-7 tracking-tight text-zinc-600">
                Строгий обзор состояния проекта: управление доступностью сайта, реальные метрики
                по банкетам и история оплаченных заказов.
              </p>
            </div>

            <nav className="inline-flex w-full rounded-2xl bg-zinc-50 p-1 xl:w-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium transition md:px-5 xl:flex-none ${
                    activeTab === tab.id
                      ? "bg-black text-white shadow-sm"
                      : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        {activeTab === "management" ? (
          <section className="flex min-h-[420px] items-center justify-center">
            <div className="w-full max-w-3xl rounded-2xl border border-zinc-100 bg-white p-8 shadow-sm md:p-10">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-50">
                  <Wrench className="h-7 w-7 text-zinc-700" />
                </div>
                <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Управление сайтом</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Режим обслуживания</h2>
                <p className="mt-4 text-base leading-7 text-zinc-600">
                  Используйте этот переключатель, чтобы временно закрыть сайт для пользователей
                  во время обновлений, исправлений или технических работ.
                </p>

                <div className="mt-8 rounded-2xl border border-zinc-100 bg-zinc-50 p-6">
                  <p className="text-sm font-medium text-zinc-500">Текущий статус</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                    {isLoading
                      ? "Загружаем..."
                      : isMaintenance
                        ? "Сайт в режиме обслуживания"
                        : "Сайт доступен пользователям"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleMaintenance}
                  disabled={isLoading || isUpdating}
                  className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-medium text-white transition ${
                    isMaintenance ? "bg-zinc-900 hover:bg-zinc-800" : "bg-black hover:bg-zinc-800"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {isUpdating
                    ? "Сохраняем..."
                    : isMaintenance
                      ? "Выключить режим обслуживания"
                      : "Включить режим обслуживания"}
                </button>

                {errorMessage ? (
                  <p className="mt-4 text-sm tracking-tight text-red-500">{errorMessage}</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "analytics" ? (
          <>
            <section className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              <article className="rounded-2xl border border-zinc-100 bg-white p-7 shadow-sm">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-50">
                  <BarChart3 className="h-5 w-5 text-zinc-700" />
                </div>
                <p className="text-sm font-medium text-zinc-500">Всего банкетов</p>
                <div className="mt-3 text-4xl font-semibold tracking-tight">
                  {isAnalyticsLoading ? "..." : totalParties}
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Количество записей, найденных в таблице `parties`.
                </p>
              </article>

              <article className="rounded-2xl border border-zinc-100 bg-white p-7 shadow-sm">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-50">
                  <CircleDollarSign className="h-5 w-5 text-zinc-700" />
                </div>
                <p className="text-sm font-medium text-zinc-500">Оплачено</p>
                <div className="mt-3 text-4xl font-semibold tracking-tight">
                  {isAnalyticsLoading ? "..." : paidParties}
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Банкеты со статусом `is_paid === true`.
                </p>
              </article>

              <article className="rounded-2xl border border-zinc-100 bg-white p-7 shadow-sm">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-50">
                  <Activity className="h-5 w-5 text-zinc-700" />
                </div>
                <p className="text-sm font-medium text-zinc-500">Конверсия</p>
                <div className="mt-3 text-4xl font-semibold tracking-tight">
                  {isAnalyticsLoading ? "..." : `${paymentConversion}%`}
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-600">
                  Доля оплаченных банкетов от общего количества.
                </p>
              </article>
            </section>

            <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-zinc-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Analytics</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">Последние события</h2>
                </div>
                <p className="text-sm text-zinc-500">Живые записи из таблицы `analytics_events`.</p>
              </div>

              {analyticsError ? (
                <p className="px-6 py-6 text-sm tracking-tight text-red-500">{analyticsError}</p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-zinc-100">
                  <thead className="bg-zinc-50">
                    <tr className="text-left text-sm text-zinc-500">
                      <th className="px-6 py-4 font-medium">Дата и время</th>
                      <th className="px-6 py-4 font-medium">ID банкета</th>
                      <th className="px-6 py-4 font-medium">Пользователь</th>
                      <th className="px-6 py-4 font-medium">Событие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {stats.recentEvents.length === 0 && !isAnalyticsLoading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-zinc-500">
                          Событий пока нет.
                        </td>
                      </tr>
                    ) : null}

                    {isAnalyticsLoading && stats.recentEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-sm text-zinc-500">
                          Загружаем аналитику...
                        </td>
                      </tr>
                    ) : null}

                    {stats.recentEvents.map((event, index) => {
                      const meta = getEventMeta(event.event_type);

                      return (
                        <tr key={`${event.created_at ?? "event"}-${event.party_id ?? index}-${index}`}>
                          <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                            {formatDateTime(event.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-5 text-sm font-medium text-zinc-900">
                            {shortenPartyId(event.party_id)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                            {event.user_name?.trim() || "anonymous"}
                          </td>
                          <td className="px-6 py-5 text-sm text-zinc-900">
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
          </>
        ) : null}

        {activeTab === "purchases" ? (
          <section className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-zinc-100 px-6 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-zinc-500">Purchases</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">История покупок</h2>
              </div>
              <p className="text-sm text-zinc-500">Показаны только оплаченные банкеты.</p>
            </div>

            {analyticsError ? (
              <p className="px-6 py-6 text-sm tracking-tight text-red-500">{analyticsError}</p>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-100">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-sm text-zinc-500">
                    <th className="px-6 py-4 font-medium">Дата создания</th>
                    <th className="px-6 py-4 font-medium">ID банкета</th>
                    <th className="px-6 py-4 font-medium">Имя создателя</th>
                    <th className="px-6 py-4 font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {paidPartyHistory.length === 0 && !isAnalyticsLoading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-zinc-500">
                        Оплаченных банкетов пока нет.
                      </td>
                    </tr>
                  ) : null}

                  {isAnalyticsLoading && paidPartyHistory.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-sm text-zinc-500">
                        Загружаем покупки...
                      </td>
                    </tr>
                  ) : null}

                  {paidPartyHistory.map((party, index) => (
                    <tr key={`${party.id ?? "paid-party"}-${index}`}>
                      <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                        {formatDateTime(party.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-5 text-sm font-medium text-zinc-900">
                        {shortenPartyId(party.id)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                        {getPartyCreatorName(party) ?? "Не указано"}
                      </td>
                      <td className="px-6 py-5 text-sm text-zinc-900">
                        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                          Оплачено
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
