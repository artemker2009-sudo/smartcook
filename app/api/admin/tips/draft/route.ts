import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Генерация пачки ЧЕРНОВИКОВ советов (по умолчанию 20). Доступ — только админ.
// Черновики сохраняются НЕопубликованными: директор вычитывает и публикует
// вручную. Лимиты OpenAI — общий AI-лимитер, как везде.
const BODY_MAX = 400;
const EMOJI_MAX = 16;
const DEFAULT_COUNT = 20;

const SYSTEM_PROMPT = `Ты пишешь короткие практичные кулинарные советы для сервиса SmartCook.

Требования к каждому совету:
- 1–2 предложения, максимум ~200 символов.
- Практичный и ПРОВЕРЯЕМЫЙ приём (не миф, не «бабушкины» суеверия).
- Без экзотики и редких ингредиентов — то, что применимо на обычной кухне.
- Дружелюбно, по-человечески, без канцелярита.
- На русском. Не выдумывай авторов и не ссылайся на «шефов».

Верни СТРОГО JSON: {"tips":[{"body":"текст совета","emoji":"одна эмодзи по теме"}, ...]}.`;

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, max);
}

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const requested = Number((body as Record<string, unknown> | null)?.count);
  const count = Number.isFinite(requested) ? Math.min(30, Math.max(1, Math.trunc(requested))) : DEFAULT_COUNT;

  const rateLimit = await checkAndConsumeAiRateLimit(req, "admin-tips-draft");
  if (!rateLimit.ok) return rateLimitResponse(rateLimit);

  let tips: Array<{ body?: string; emoji?: string }>;
  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Сгенерируй ${count} разных советов на разные темы (нарезка, хранение, специи, тесто, мясо, овощи и т.п.).` },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      },
      { timeout: 55000 },
    );
    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    tips = Array.isArray(parsed?.tips) ? parsed.tips : [];
  } catch (error) {
    console.error("[tips-draft] generation failed", error);
    return NextResponse.json({ error: "Не удалось сгенерировать советы" }, { status: 502 });
  }

  const rows = tips
    .map((t) => ({ body: clip(t.body, BODY_MAX), emoji_icon: clip(t.emoji, EMOJI_MAX) || null, is_published: false }))
    .filter((r) => r.body.length > 0)
    .slice(0, count);

  if (rows.length === 0) {
    return NextResponse.json({ error: "Модель вернула пустой список" }, { status: 502 });
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("tips").insert(rows).select("*");
  if (error) {
    console.error("[tips-draft] insert failed", error);
    return NextResponse.json({ error: "Не удалось сохранить черновики" }, { status: 500 });
  }

  return NextResponse.json({ success: true, created: data?.length ?? 0 });
}
