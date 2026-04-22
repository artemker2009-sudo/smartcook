"use client";

import { useEffect, useState } from "react";
import { Shield, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
    <main className="min-h-screen bg-zinc-50 px-6 py-10 text-zinc-900">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Developer Panel</p>
          <h1 className="text-4xl font-semibold tracking-tight">Панель разработчика</h1>
          <p className="max-w-2xl text-base leading-7 tracking-tight text-zinc-600">
            Управляйте глобальным режимом технического обслуживания для всего сайта.
          </p>
        </div>

        <section className="rounded-[32px] border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
                <Wrench className="h-6 w-6 text-zinc-700" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Maintenance Mode</h2>
                <p className="mt-2 text-sm leading-6 tracking-tight text-zinc-600">
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
              className={`group inline-flex min-w-[220px] items-center justify-between rounded-full px-4 py-4 text-left text-white shadow-lg transition ${
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
          </div>

          {errorMessage ? (
            <p className="mt-6 text-sm tracking-tight text-red-500">{errorMessage}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
