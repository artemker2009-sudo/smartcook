import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Аварийные рубильники кэша. Пишет только service-role (RLS запрещает anon
 * писать в site_settings), доступ — как у остальных админских роутов.
 *
 * Две операции:
 *
 *   { action: "bump" }               — УРОВЕНЬ B. Новая метка поколения кэша.
 *                                      Каждый клиент, увидев её, выбрасывает
 *                                      кэши сервис-воркера и перерегистрирует
 *                                      его. localStorage НЕ ТРОГАЕТСЯ: списки
 *                                      покупок остаются на месте.
 *
 *   { purgeClientCache: boolean }    — УРОВЕНЬ C. Просьба браузеру сбросить
 *                                      свой HTTP-кэш (заголовок
 *                                      Clear-Site-Data: "cache" из proxy.ts).
 *                                      Единственный рубильник, который что-то
 *                                      значит в iOS-оболочке.
 *
 * Флаг уровня C — ТУМБЛЕР, а не разовое действие, и это осознанно: заголовок
 * должен повисеть достаточно, чтобы его получили все, кто зайдёт в ближайшее
 * время. Выключать его обязан человек, когда авария закрыта.
 */
export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const supabase = createServiceRoleClient();

  if (body?.action === "bump") {
    // Метка — просто момент нажатия. Сравнивается только на «отличается или
    // нет», поэтому читаемость тут ценнее компактности: видно, когда жали.
    const cacheEpoch = new Date().toISOString();
    const { error } = await supabase.from("site_settings").update({ cache_epoch: cacheEpoch }).eq("id", 1);

    if (error) {
      return NextResponse.json(
        { error: "Не удалось обновить метку кэша. Прогнана ли миграция supabase_site_settings_cache_switches.sql?" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, cacheEpoch });
  }

  if (typeof body?.purgeClientCache === "boolean") {
    const { error } = await supabase
      .from("site_settings")
      .update({ purge_client_cache: body.purgeClientCache })
      .eq("id", 1);

    if (error) {
      return NextResponse.json(
        { error: "Не удалось переключить чистку HTTP-кэша. Прогнана ли миграция supabase_site_settings_cache_switches.sql?" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, purgeClientCache: body.purgeClientCache });
  }

  return NextResponse.json({ error: "Некорректное значение" }, { status: 400 });
}
