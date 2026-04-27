"use client";

import { type FormEvent, useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Shield,
  Sparkles,
  Wrench,
} from "lucide-react";
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

type TabId = "management" | "analytics" | "purchases";

const TABS = [
  { id: "management" as TabId, label: "⚙️ Управление", hint: "Статус сайта и техработы" },
  { id: "analytics" as TabId, label: "📊 Аналитика", hint: "Живые метрики и события" },
  { id: "purchases" as TabId, label: "💳 История покупок", hint: "Только оплаченные банкеты" },
];

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
        className: "bg-amber-100 text-amber-700 ring-amber-200",
      };
    case "paywall_view_from_cart":
      return {
        label: "Открыл пейволл (список)",
        className: "bg-orange-100 text-orange-700 ring-orange-200",
      };
    case "paywall_payment_success":
      return {
        label: "Оплата успешна",
        className: "bg-green-100 text-green-700 ring-green-200",
      };
    case "shopping_list_opened":
      return {
        label: "Открыл список покупок",
        className: "bg-sky-100 text-sky-700 ring-sky-200",
      };
    case "ai_menu_generated_success":
      return {
        label: "Сгенерировал меню",
        className: "bg-violet-100 text-violet-700 ring-violet-200",
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
  const [activeTab, setActiveTab] = useState<TabId>("management");
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
  const paidPartyHistory = stats.parties
    .filter((party) => Boolean(party.is_paid))
    .sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

      return rightTime - leftTime;
    });
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

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
    <div className="flex h-screen bg-zinc-50 overflow-hidden text-zinc-900">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Control Center</p>
              <h1 className="text-xl font-semibold tracking-tight">SmartCook Admin</h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`w-full rounded-xl px-4 py-3 text-left transition ${
                activeTab === tab.id
                  ? "bg-black text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div
                className={`mt-1 text-xs ${
                  activeTab === tab.id ? "text-zinc-300" : "text-zinc-400"
                }`}
              >
                {tab.hint}
              </div>
            </button>
          ))}
        </nav>

        <div className="border-t border-zinc-200 px-6 py-5">
          <div className="rounded-2xl bg-zinc-100 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Текущая вкладка</p>
            <p className="mt-2 text-sm font-semibold text-zinc-900">{activeTabMeta.label}</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-10">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 rounded-3xl border border-zinc-200 bg-white px-6 py-6 shadow-sm lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-400">Admin Dashboard</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
                  Управление SmartCook
                </h2>
                <p className="mt-3 text-base leading-7 text-zinc-600">
                  Десктопная админ-панель с понятным контролем статуса сайта, живой аналитикой и
                  историей оплаченных банкетов из Supabase.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:hidden">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-xl px-4 py-3 text-left transition ${
                      activeTab === tab.id
                        ? "bg-black text-white shadow-sm"
                        : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                    }`}
                  >
                    <div className="text-sm font-semibold">{tab.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </header>

          {activeTab === "management" ? (
            <section className="flex min-h-[calc(100vh-14rem)] items-center justify-center">
              <div
                className={`w-full max-w-4xl rounded-[2rem] p-8 shadow-sm lg:p-10 ${
                  isLoading
                    ? "border border-zinc-200 bg-white"
                    : isMaintenance
                      ? "border border-red-200 bg-red-50"
                      : "border border-green-200 bg-green-50"
                }`}
              >
                <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                  <div>
                    <div
                      className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${
                        isLoading
                          ? "bg-zinc-100 text-zinc-700"
                          : isMaintenance
                            ? "bg-red-100 text-red-600"
                            : "bg-green-100 text-green-600"
                      }`}
                    >
                      <Wrench className="h-7 w-7" />
                    </div>
                    <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Управление сайтом
                    </p>
                    <h3
                      className={`mt-4 text-3xl font-semibold tracking-tight lg:text-4xl ${
                        isLoading
                          ? "text-zinc-900"
                          : isMaintenance
                            ? "text-red-700"
                            : "text-green-700"
                      }`}
                    >
                      {isLoading
                        ? "Проверяем текущий статус сайта"
                        : isMaintenance
                          ? "🔴 Сайт закрыт на обслуживание"
                          : "🟢 Сайт работает в штатном режиме"}
                    </h3>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-700">
                      {isLoading
                        ? "Загружаем актуальное состояние из таблицы site_settings."
                        : isMaintenance
                          ? "Пользователи сейчас не могут пользоваться сайтом. Когда работы завершатся, запустите его обратно одной кнопкой."
                          : "Все работает нормально. Если нужно провести технические работы, можно мгновенно остановить доступ для пользователей."}
                    </p>

                    {errorMessage ? (
                      <p className="mt-5 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm text-red-600">
                        {errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-6 backdrop-blur">
                    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                      <p className="text-sm font-semibold text-zinc-500">Текущий режим</p>
                      <div className="mt-4 flex items-center gap-3">
                        <span
                          className={`inline-flex h-3.5 w-3.5 rounded-full ${
                            isLoading
                              ? "bg-zinc-400"
                              : isMaintenance
                                ? "bg-red-500"
                                : "bg-green-500"
                          }`}
                        />
                        <span className="text-lg font-semibold text-zinc-900">
                          {isLoading
                            ? "Загружаем статус..."
                            : isMaintenance
                              ? "Сайт остановлен"
                              : "Сайт активен"}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleToggleMaintenance}
                        disabled={isLoading || isUpdating}
                        className={`mt-6 inline-flex w-full items-center justify-center rounded-2xl px-6 py-4 text-base font-semibold text-white transition ${
                          isMaintenance
                            ? "bg-green-600 hover:bg-green-500"
                            : "bg-red-600 hover:bg-red-500"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {isUpdating
                          ? "Сохраняем..."
                          : isMaintenance
                            ? "Запустить сайт"
                            : "Остановить сайт"}
                      </button>

                      <p className="mt-4 text-sm leading-6 text-zinc-500">
                        Изменение сразу записывается в `site_settings.is_maintenance`.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {activeTab === "analytics" ? (
            <div className="space-y-8">
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Всего банкетов</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : totalParties}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                      <BarChart3 className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Общее количество записей, загруженных из таблицы `parties`.
                  </p>
                </article>

                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Оплачено</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : paidParties}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100 text-green-600">
                      <CircleDollarSign className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Банкеты, у которых в базе установлен флаг `is_paid === true`.
                  </p>
                </article>

                <article className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-500">Конверсия</p>
                      <div className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">
                        {isAnalyticsLoading ? "..." : `${paymentConversion}%`}
                      </div>
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-purple-600">
                      <Activity className="h-6 w-6" />
                    </div>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-600">
                    Реальная доля оплаченных банкетов от общего числа записей.
                  </p>
                </article>
              </section>

              <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Analytics Feed</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                      Последние события
                    </h3>
                  </div>
                  <p className="text-sm text-zinc-500">Лента в стиле Stripe на основе `analytics_events`.</p>
                </div>

                {analyticsError ? (
                  <p className="border-b border-zinc-200 px-6 py-4 text-sm text-red-500">{analyticsError}</p>
                ) : null}

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-zinc-50/80">
                      <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        <th className="px-6 py-4">Дата и время</th>
                        <th className="px-6 py-4">ID банкета</th>
                        <th className="px-6 py-4">Пользователь</th>
                        <th className="px-6 py-4">Событие</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {stats.recentEvents.length === 0 && !isAnalyticsLoading ? (
                        <tr className="border-b border-zinc-200 last:border-b-0">
                          <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                            Событий пока нет.
                          </td>
                        </tr>
                      ) : null}

                      {isAnalyticsLoading && stats.recentEvents.length === 0 ? (
                        <tr className="border-b border-zinc-200 last:border-b-0">
                          <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                            Загружаем аналитику...
                          </td>
                        </tr>
                      ) : null}

                      {stats.recentEvents.map((event, index) => {
                        const meta = getEventMeta(event.event_type);

                        return (
                          <tr
                            key={`${event.created_at ?? "event"}-${event.party_id ?? index}-${index}`}
                            className="border-b border-zinc-200 last:border-b-0"
                          >
                            <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                              {formatDateTime(event.created_at)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-5 text-sm font-semibold text-zinc-900">
                              {shortenPartyId(event.party_id)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                              {event.user_name?.trim() || "anonymous"}
                            </td>
                            <td className="px-6 py-5 text-sm text-zinc-900">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${meta.className}`}
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
          ) : null}

          {activeTab === "purchases" ? (
            <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
              <div className="flex flex-col gap-3 border-b border-zinc-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-zinc-400">Purchase History</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
                    История покупок
                  </h3>
                </div>
                <p className="text-sm text-zinc-500">Показаны только реально оплаченные банкеты.</p>
              </div>

              {analyticsError ? (
                <p className="border-b border-zinc-200 px-6 py-4 text-sm text-red-500">{analyticsError}</p>
              ) : null}

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-zinc-50/80">
                    <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      <th className="px-6 py-4">Дата создания</th>
                      <th className="px-6 py-4">ID банкета</th>
                      <th className="px-6 py-4">Имя создателя</th>
                      <th className="px-6 py-4">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {paidPartyHistory.length === 0 && !isAnalyticsLoading ? (
                      <tr className="border-b border-zinc-200 last:border-b-0">
                        <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                          Оплаченных банкетов пока нет.
                        </td>
                      </tr>
                    ) : null}

                    {isAnalyticsLoading && paidPartyHistory.length === 0 ? (
                      <tr className="border-b border-zinc-200 last:border-b-0">
                        <td colSpan={4} className="px-6 py-12 text-center text-sm text-zinc-500">
                          Загружаем покупки...
                        </td>
                      </tr>
                    ) : null}

                    {paidPartyHistory.map((party, index) => (
                      <tr
                        key={`${party.id ?? "paid-party"}-${index}`}
                        className="border-b border-zinc-200 last:border-b-0"
                      >
                        <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                          {formatDateTime(party.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-5 text-sm font-semibold text-zinc-900">
                          {shortenPartyId(party.id)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-5 text-sm text-zinc-600">
                          {getPartyCreatorName(party) ?? "Не указано"}
                        </td>
                        <td className="px-6 py-5 text-sm text-zinc-900">
                          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
