import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Поллинг статуса картинки блюда из кэша (этап 2). Клиент, увидев
// image_status='generating', раз в 3 сек (максимум 30 сек) спрашивает статус;
// как только 'ready' — плавно показывает картинку. Данные публичные
// (dish_cache читается всеми по RLS), секретов не отдаём.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("dish_cache")
      .select("image_status, image_url")
      .eq("id", id)
      .maybeSingle<{ image_status: string; image_url: string | null }>();

    if (error) throw error;
    if (!data) return NextResponse.json({ image_status: "none", image_url: null });

    return NextResponse.json({
      image_status: data.image_status,
      image_url: data.image_status === "ready" ? data.image_url : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
