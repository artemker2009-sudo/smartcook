"use client";

// График заходов по дням за 30 дней: столбик на день, внутри столбика —
// разбивка по платформам.
//
// Отдельным файлом, как «Платежи» и «Пользователи»: app/admin/page.tsx и без
// того самый большой файл проекта.
//
// ПОЧЕМУ СТОЛБИКИ, А НЕ ТРИ ЛИНИИ. Вопрос, ради которого раздел существует, —
// «растёт ли доля приложений». На составном столбике доля видна прямо в
// пропорции сегментов, без сравнения трёх кривых глазами.

import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/platform";

export type PlatformDay = {
  date: string;
  web: number;
  ios_app: number;
  android_twa: number;
};

/** Цвета платформ. Различимы и в чёрно-белой распечатке — разной светлоты. */
const PLATFORM_COLORS: Record<Platform, string> = {
  web: "#10b981",        // изумрудный
  ios_app: "#0ea5e9",    // голубой
  android_twa: "#f59e0b" // янтарный
};

const dayTotal = (d: PlatformDay) => d.web + d.ios_app + d.android_twa;

/** «5.09» — коротко, иначе тридцать подписей не помещаются. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** «5 сентября 2026» — для подписи «Считаем с …» и всплывающей подсказки. */
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // По Москве: день в графике режется по московской полуночи, подпись обязана
  // совпадать с ним, иначе «Считаем с 4 сентября» под графиком, который
  // начинается пятым.
  const msk = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  return `${msk.getUTCDate()} ${MONTHS[msk.getUTCMonth()]} ${msk.getUTCFullYear()}`;
}

export default function PlatformsChart({
  daily,
  firstVisitAt,
}: {
  daily: PlatformDay[];
  firstVisitAt: string | null;
}) {
  // Высота столбика — доля от самого высокого дня. max(1) страхует от деления
  // на ноль на пустом периоде.
  const maxDay = Math.max(1, ...daily.map(dayTotal));
  const total = daily.reduce((sum, d) => sum + dayTotal(d), 0);

  return (
    <section className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-1 lg:flex-row lg:items-baseline lg:justify-between">
        <h3 className="text-xl font-semibold tracking-tight text-zinc-950">Заходы по дням</h3>
        <p className="text-xs text-zinc-400">
          {firstVisitAt
            ? `Считаем с ${longDate(firstVisitAt)}`
            : "Заходов пока не было"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {PLATFORMS.map((p) => (
          <span key={p} className="flex items-center gap-2 text-sm text-zinc-600">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: PLATFORM_COLORS[p] }}
              aria-hidden
            />
            {PLATFORM_LABELS[p]}
          </span>
        ))}
        <span className="ml-auto text-sm text-zinc-500">За 30 дней: {total}</span>
      </div>

      {/* h-full на колонке ОБЯЗАТЕЛЕН: без него у неё высота auto, проценты на
          столбике считать не от чего, и все дни рисуются одинаковыми
          ниточками у нижнего края. На этом уже спотыкались в «Платежах». */}
      <div className="mt-5 flex h-48 items-end gap-[3px]">
        {daily.map((day) => {
          const sum = dayTotal(day);
          const title = `${shortDate(day.date)} — всего ${sum}` +
            PLATFORMS.filter((p) => day[p] > 0)
              .map((p) => `, ${PLATFORM_LABELS[p]}: ${day[p]}`)
              .join("");

          return (
            <div
              key={day.date}
              className="group flex h-full flex-1 flex-col justify-end"
              title={title}
            >
              <div
                className="flex w-full flex-col-reverse overflow-hidden rounded-t"
                style={{
                  // Подпись дат снизу занимает 16px — вычитаем, иначе самый
                  // высокий столбик вылезает за карточку.
                  height: `calc(${Math.round((sum / maxDay) * 100)}% - 16px)`,
                  minHeight: sum > 0 ? 3 : 1,
                  background: sum > 0 ? "transparent" : "#e4e4e7",
                }}
              >
                {PLATFORMS.map((p) =>
                  day[p] > 0 ? (
                    <div
                      key={p}
                      style={{
                        height: `${(day[p] / sum) * 100}%`,
                        background: PLATFORM_COLORS[p],
                      }}
                    />
                  ) : null,
                )}
              </div>
              <span className="mt-1 h-[12px] text-center text-[9px] leading-none text-zinc-400">
                {/* Тридцать дат подряд сливаются — подписываем каждую пятую. */}
                {shortDate(day.date).endsWith(".01") ||
                daily.indexOf(day) % 5 === 0
                  ? shortDate(day.date)
                  : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
