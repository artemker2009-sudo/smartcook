import { NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdminSession } from "@/lib/adminAuth";
import { createServiceRoleClient } from "@/lib/supabaseAdmin";
import { checkAndConsumeAiRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { isTextTooLong, MAX_TEXT_LENGTH } from "@/lib/inputLimits";
import { slugify } from "@/lib/slug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Генерация ЧЕРНОВИКА заметки. Доступ — только админ (requireAdminSession).
// Черновик сохраняется НЕопубликованным (is_published=false): публикует только
// директор вручную после вычитки. Лимиты OpenAI — общий AI-лимитер, как везде.
// НИКАКИХ выдуманных авторов: подпись «Команда SmartCook» — в UI, не в тексте.

const TITLE_MAX = 200;
const EXCERPT_MAX = 400;
const BODY_MAX = 20000;
const EMOJI_MAX = 16;

const SYSTEM_PROMPT = `Ты — редактор кулинарного сервиса SmartCook. Пишешь короткую практичную заметку в раздел «Кухонные заметки».

Тон: дружелюбный сосед, который делится полезным на кухне. НЕ энциклопедия, без канцелярита и «воды».

Требования к тексту:
- Живой, конкретный заголовок (не «10 фактов о…», а по-человечески).
- 3–5 небольших разделов с подзаголовками (markdown, уровень ##).
- Практичные советы, которые реально применимы дома.
- Объём тела: 300–600 слов.
- Пиши на русском.
- НЕ выдумывай авторов, экспертов, «шеф-повар Иван сказал». Никаких имён и цитат несуществующих людей.
- Не обещай того, чего сервис не делает.

Верни СТРОГО JSON без пояснений:
{
  "title": "заголовок статьи",
  "excerpt": "1–2 предложения для карточки, зачем читать",
  "emoji": "одна эмодзи по теме",
  "body": "тело статьи в markdown с ## подзаголовками"
}`;

function clip(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, max);
}

async function uniqueSlug(
  supabase: ReturnType<typeof createServiceRoleClient>,
  base: string,
): Promise<string> {
  const root = base || "zametka";
  let candidate = root;
  for (let i = 2; i < 200; i++) {
    const { data } = await supabase.from("articles").select("id").eq("slug", candidate).limit(1).maybeSingle();
    if (!data) return candidate;
    candidate = `${root}-${i}`.slice(0, 200);
  }
  return `${root}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(req: Request) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
  if (!topic) {
    return NextResponse.json({ error: "Укажите тему заметки" }, { status: 400 });
  }
  if (isTextTooLong(topic, MAX_TEXT_LENGTH)) {
    return NextResponse.json({ error: "Слишком длинная тема" }, { status: 400 });
  }

  // Тот же AI-лимитер, что и на генерациях рецептов/меню (защита расходов).
  const rateLimit = await checkAndConsumeAiRateLimit(req, "admin-article-draft");
  if (!rateLimit.ok) return rateLimitResponse(rateLimit);

  let parsed: { title?: string; excerpt?: string; emoji?: string; body?: string };
  try {
    const completion = await openai.chat.completions.create(
      {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Тема заметки: ${topic}` },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      },
      { timeout: 55000 },
    );
    parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  } catch (error) {
    console.error("[article-draft] generation failed", error);
    return NextResponse.json({ error: "Не удалось сгенерировать черновик" }, { status: 502 });
  }

  const title = clip(parsed.title, TITLE_MAX);
  const excerpt = clip(parsed.excerpt, EXCERPT_MAX);
  const text = clip(parsed.body, BODY_MAX);
  const emoji = clip(parsed.emoji, EMOJI_MAX) || null;
  if (!title || !text) {
    return NextResponse.json({ error: "Модель вернула пустой черновик" }, { status: 502 });
  }

  const supabase = createServiceRoleClient();
  const slug = await uniqueSlug(supabase, slugify(title));
  const row = {
    title,
    excerpt: excerpt || title,
    body: text,
    emoji_icon: emoji,
    slug,
    is_published: false, // черновик — публикует директор вручную
  };
  const { data, error } = await supabase.from("articles").insert(row).select("*").single();
  if (error) {
    console.error("[article-draft] insert failed", error);
    return NextResponse.json({ error: "Не удалось сохранить черновик" }, { status: 500 });
  }

  return NextResponse.json({ success: true, article: data });
}
