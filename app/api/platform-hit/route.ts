import { NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { isProductionOrigin, isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import { parsePlatform, parseVisitorKind } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Отметка о заходе: платформа (сайт / приложение iOS / приложение RuStore) и
 * первый ли это раз на устройстве. Пишет components/PlatformHit — один раз за
 * сеанс, не на каждый экран.
 *
 * ПОЧЕМУ РОУТ, А НЕ ПРЯМАЯ ВСТАВКА АНОНИМНЫМ КЛЮЧОМ. Таблица analytics_events
 * открыта анониму на INSERT — это осознанное решение для событий банкета
 * (supabase_admin_tables_rls.sql), и аудит из CLAUDE.md её ожидает в выдаче.
 * Но добавлять туда ещё и статистику платформ по тому же пути значит отдать
 * её на подделку любому, у кого есть ключ из бандла: одна страница в цикле — и
 * доля iOS какая угодно. Здесь вставка идёт сервис-ролью, значения проверены
 * по списку, а лишних полей в запись не попадает.
 *
 * ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: никакого идентификатора устройства. «Новый или
 * вернувшийся» приходит готовым словом — отметку о том, что устройство уже
 * было, держит у себя клиент. Сервер не заводит ни cookie, ни ключа, по
 * которому два захода можно связать между собой.
 *
 * ПИШЕМ ТОЛЬКО С БОЕВЫХ ДОМЕНОВ. Заход с превью или с ноутбука разработчика —
 * это не посетитель. База у нас одна на все окружения, и каждая приёмка PR
 * добавляла в отчёт по платформам лишний «сайт», занижая долю приложений ровно
 * на объём нашей же работы. Приложения при этом проходят: и iOS-оболочка
 * (Capacitor грузит сайт с боевого домена), и Android-TWA (это Chrome на
 * боевом домене) присылают Origin настоящего домена.
 */
export async function POST(req: Request) {
  if (!isTrustedOrigin(req)) return originBlockedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const raw = body as { platform?: unknown; visitor?: unknown };
  const platform = parsePlatform(raw.platform);
  const visitor = parseVisitorKind(raw.visitor);
  if (!platform || !visitor) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  // Не боевой домен — молча не пишем. Именно 200 и ok: false, а не ошибка.
  // Клиент на ответ не смотрит и повторять не станет (см. PlatformHit), а
  // отдавать 403 на превью значило бы сыпать красным в консоль на каждой
  // приёмке — и однажды это приняли бы за поломку.
  if (!isProductionOrigin(req)) {
    return NextResponse.json({ ok: false, skipped: "non-production-origin" });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("analytics_events")
    .insert([{ event_type: "visit", platform, visitor }]);

  if (error) {
    // Статистика не должна ронять заход. Пишем в лог и отвечаем «принято»:
    // клиент всё равно не станет повторять — см. PlatformHit.
    console.error("[platformHit] insert failed", error.message);
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true });
}
