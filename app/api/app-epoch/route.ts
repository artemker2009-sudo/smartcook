import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yjfqwwiqwoighjdlkodg.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_E7Fj9ZiOZTyNHAQQKo7Y0A_E8-ExX6Z";

/**
 * Метка поколения кэша (уровень B аварийного отката).
 *
 * Клиент (components/CacheKillSwitch.tsx) дёргает этот роут один раз при старте
 * и сравнивает ответ с тем, что видел прошлый раз. Отличается — значит из
 * админки попросили выбросить кэши сервис-воркера.
 *
 * ПОЧЕМУ ИМЕННО /api/. Это не косметика, а условие работоспособности: в
 * next.config.ts всё под /api/ обслуживается стратегией NetworkOnly, то есть
 * сервис-воркер такие запросы не кэширует и не перехватывает. Рубильник обязан
 * оставаться слышным даже тогда, когда весь остальной кэш испорчен — если бы
 * он лежал на обычном маршруте, воркер мог бы отдавать на него старый ответ, и
 * рубильник замолчал бы ровно в тот момент, когда он нужен.
 *
 * ПОЧЕМУ select=* , а не select=cache_epoch. Запрос конкретной колонки ломается
 * с ошибкой, если миграция ещё не прогнана, и роут начал бы отвечать 500 на
 * ровном месте. Строка в таблице одна и крошечная — берём её целиком, и до
 * миграции роут просто отвечает «метки нет», то есть чистить нечего.
 *
 * Кэширование. s-maxage=60 — ответ лежит на CDN Vercel, поэтому обычная
 * загрузка страницы не порождает вызов функции. Плата — до минуты задержки
 * распространения, что для аварийного рубильника несущественно. max-age=0
 * запрещает кэш В БРАУЗЕРЕ: там свежесть важна, и лишний CDN-хит бесплатен.
 */
export async function GET() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=*&id=eq.1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      cache: "no-store",
    });

    if (!res.ok) return epochResponse(null);

    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    const epoch = row?.cache_epoch;

    return epochResponse(typeof epoch === "string" && epoch ? epoch : null);
  } catch {
    // БД недоступна — отвечаем «метки нет». Клиент в этом случае не делает
    // ничего: чистка кэша на сетевом сбое была бы худшим из возможных решений.
    return epochResponse(null);
  }
}

function epochResponse(epoch: string | null) {
  return NextResponse.json(
    { epoch },
    {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
