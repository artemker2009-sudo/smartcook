"use client";

// Раздел админки «Платежи»: плитки, график по дням и таблица последних оплат.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не внутри app/admin/page.tsx. Тот файл — четыре с
// половиной тысячи строк, и каждая новая вкладка внутри него делает его
// неподъёмнее. Новые разделы живут здесь и общаются с админкой одним пропом.

import { useCallback, useEffect, useState } from "react";

type Tile = { count: number; sum: number };

type PaymentsData = {
  tiles: { today: Tile; week: Tile; month: Tile; all: Tile };
  chart: { date: string; sum: number; count: number }[];
  recent: {
    invId: number;
    date: string;
    username: string;
    plan: string;
    amountRub: number;
    status: string;
  }[];
};

// «Месяц» здесь остался нарочно: тариф убран 24.09.2026, но если в заказах
// когда-нибудь встретится старая строка, в таблице должно быть читаемое слово,
// а не сырой id.
const PLAN_LABELS: Record<string, string> = {
  month: "Месяц",
  year: "Год",
  forever: "Навсегда",
};

const rub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

/** «1 оплата», «3 оплаты», «5 оплат». */
const plural = (n: number) => {
  const mod100 = n % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return "оплат";
  if (mod10 === 1) return "оплата";
  if (mod10 >= 2 && mod10 <= 4) return "оплаты";
  return "оплат";
};

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(d);
};

const formatDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()}.${d.getMonth() + 1}`;
};

export default function PaymentsTab({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<PaymentsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/premium/payments");
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) throw new Error("Не удалось загрузить платежи");
      setData((await res.json()) as PaymentsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить платежи");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  // Высота столбика — доля от максимума за 30 дней. Пустой период не должен
  // давать деление на ноль и «бесконечные» столбики.
  const maxSum = Math.max(1, ...(data?.chart ?? []).map((d) => d.sum));

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Сегодня", data?.tiles.today],
            ["7 дней", data?.tiles.week],
            ["30 дней", data?.tiles.month],
            ["Всё время", data?.tiles.all],
          ] as const
        ).map(([label, tile]) => (
          <div key={label} className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              {tile ? rub(tile.sum) : "—"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {tile ? `${tile.count} ${plural(tile.count)}` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Оплаты за 30 дней</h3>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            {loading ? "Обновляем…" : "Обновить"}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}

        <div className="mt-5 flex h-40 items-end gap-[3px]">
          {(data?.chart ?? []).map((day) => (
            <div
              key={day.date}
              // h-full ОБЯЗАТЕЛЕН: без него у колонки высота auto, и проценты
              // на самом столбике не от чего считать — все дни рисовались
              // одинаковыми ниточками у нижнего края.
              className="group relative flex h-full flex-1 flex-col items-center justify-end"
              // Подпись под столбиком — число оплат, высота — сумма (SPEC 3.6).
              title={`${formatDay(day.date)}: ${rub(day.sum)}, оплат ${day.count}`}
            >
              <div
                className="w-full rounded-t bg-emerald-500/80 transition-colors group-hover:bg-emerald-600"
                // Проценты считаем от места ПОД подписью (она занимает 14px),
                // иначе самый высокий столбик вылезает за карточку.
                style={{
                  height: `calc(${Math.round((day.sum / maxSum) * 100)}% - 14px)`,
                  minHeight: day.sum > 0 ? 3 : 1,
                }}
              />
              <span className="mt-1 h-[10px] text-[10px] leading-none text-zinc-400">
                {day.count > 0 ? day.count : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-5">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-950">Последние оплаты</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-zinc-50/80">
              <tr className="border-b border-zinc-200 text-left text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <th className="px-6 py-4">Дата</th>
                <th className="px-6 py-4">Логин</th>
                <th className="px-6 py-4">Тариф</th>
                <th className="px-6 py-4">Сумма</th>
                <th className="px-6 py-4">Статус</th>
                <th className="px-6 py-4">InvId</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {(data?.recent ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-zinc-500">
                    {loading ? "Загружаем…" : "Оплат пока нет."}
                  </td>
                </tr>
              ) : null}
              {(data?.recent ?? []).map((row) => (
                <tr key={row.invId} className="border-b border-zinc-200 last:border-b-0">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {formatDateTime(row.date)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-zinc-900">
                    {row.username}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {PLAN_LABELS[row.plan] ?? row.plan}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    {rub(row.amountRub)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
                      Оплачено
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-400">{row.invId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
