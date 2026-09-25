"use client";

// Раздел админки «Пользователи»: поиск по логину, состояние Премиума, выдача и
// отзыв. Отдельным файлом по той же причине, что и «Платежи».

import { useCallback, useEffect, useState } from "react";

type Grant = {
  id: number;
  action: "grant" | "revoke";
  planOrMonths: string | null;
  comment: string | null;
  createdAt: string;
};

type UserRow = {
  id: string;
  username: string;
  createdAt: string;
  podborsThisWeek: number;
  isPremium: boolean;
  premiumUntil: string | null;
  isForever: boolean;
  paidTotalRub: number;
  grants: Grant[];
};

const GRANT_OPTIONS: { label: string; months: number | "forever" }[] = [
  { label: "1 мес.", months: 1 },
  { label: "3 мес.", months: 3 },
  { label: "6 мес.", months: 6 },
  { label: "12 мес.", months: 12 },
  { label: "Навсегда", months: "forever" },
];

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short" }).format(d);
};

export default function PremiumUsersTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  // Настройка «бесплатных подборов в неделю» живёт здесь: админ видит рядом
  // колонку «подборов на этой неделе», и число, от которого она зависит,
  // должно быть в том же кадре.
  const [freePodbors, setFreePodbors] = useState<number | null>(null);
  const [savingSetting, setSavingSetting] = useState(false);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/premium/users?q=${encodeURIComponent(q)}`);
        if (res.status === 401) {
          onUnauthorized();
          return;
        }
        if (!res.ok) throw new Error("Не удалось загрузить пользователей");
        const json = await res.json();
        setUsers(json.users ?? []);
        setTotal(json.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить пользователей");
      } finally {
        setLoading(false);
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void load("");
    void (async () => {
      const res = await fetch("/api/admin/premium/settings");
      if (res.ok) setFreePodbors((await res.json()).freePodborsPerWeek ?? null);
    })();
  }, [load]);

  const saveSetting = async (value: number) => {
    setSavingSetting(true);
    try {
      const res = await fetch("/api/admin/premium/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freePodborsPerWeek: value }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Не удалось сохранить");
      setFreePodbors(json.freePodborsPerWeek);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSavingSetting(false);
    }
  };

  const act = async (user: UserRow, action: "grant" | "revoke", months?: number | "forever") => {
    // Отзыв — необратимое действие для человека, который мог заплатить.
    // Спрашиваем подтверждение (SPEC 3.6).
    if (action === "revoke" && !confirm(`Забрать Премиум у @${user.username}?`)) return;

    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/premium/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, action, months, comment: comment.trim() || null }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Не получилось");
      setComment("");
      await load(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Бесплатных подборов в неделю</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Сколько подборов человек делает бесплатно до понедельника. Действует сразу, число берут все
          экраны: страница «Премиум», шторка и строка под кнопками.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={50}
            value={freePodbors ?? ""}
            onChange={(e) => setFreePodbors(Number(e.target.value))}
            className="w-24 rounded-xl border border-zinc-200 px-4 py-2 text-sm"
          />
          <button
            type="button"
            disabled={savingSetting || freePodbors === null}
            onClick={() => freePodbors !== null && void saveSetting(freePodbors)}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {savingSetting ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Пользователи</h3>
            <p className="mt-1 text-sm text-zinc-500">Найдено: {total}. Показываем первые 60.</p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void load(query);
            }}
            className="flex gap-2"
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по логину"
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              {loading ? "Ищем…" : "Найти"}
            </button>
          </form>
        </div>

        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-zinc-50/80">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <th className="px-4 py-3">Логин</th>
                <th className="px-4 py-3">Регистрация</th>
                <th className="px-4 py-3">Подборов за неделю</th>
                <th className="px-4 py-3">Премиум</th>
                <th className="px-4 py-3">Оплачено</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-500">
                    Никого не нашли.
                  </td>
                </tr>
              ) : null}

              {users.map((u) => (
                <tr key={u.id} className="border-b border-zinc-200 align-top last:border-b-0">
                  <td className="px-4 py-4 text-sm font-semibold text-zinc-900">@{u.username}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-zinc-600">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-sm text-zinc-600">{u.podborsThisWeek}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm">
                    {u.isPremium ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        {u.isForever ? "навсегда" : `до ${formatDate(u.premiumUntil)}`}
                      </span>
                    ) : (
                      <span className="text-zinc-400">нет</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-zinc-900">
                    {u.paidTotalRub > 0 ? `${u.paidTotalRub.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      className="rounded-full border border-zinc-200 px-4 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                    >
                      {expanded === u.id ? "Свернуть" : "Премиум"}
                    </button>

                    {expanded === u.id ? (
                      <div className="mt-3 space-y-3 rounded-2xl bg-zinc-50 p-4 text-left">
                        <input
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          placeholder="Комментарий (необязательно)"
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                        />
                        <div className="flex flex-wrap gap-2">
                          {GRANT_OPTIONS.map((opt) => (
                            <button
                              key={String(opt.months)}
                              type="button"
                              disabled={busyId === u.id}
                              onClick={() => void act(u, "grant", opt.months)}
                              className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Выдать {opt.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={busyId === u.id || !u.isPremium}
                            onClick={() => void act(u, "revoke")}
                            className="rounded-full bg-red-100 px-4 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-200 disabled:opacity-40"
                          >
                            Забрать Премиум
                          </button>
                        </div>

                        {u.grants.length > 0 ? (
                          <ul className="space-y-1 text-xs text-zinc-500">
                            {u.grants.map((g) => (
                              <li key={g.id}>
                                {formatDate(g.createdAt)} ·{" "}
                                {g.action === "grant" ? `выдан ${g.planOrMonths ?? ""}` : "забран"}
                                {g.comment ? ` · ${g.comment}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-zinc-400">Выдач не было.</p>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
