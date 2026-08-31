import { NextResponse } from "next/server";
import OpenAI from "openai";

import { getVerifiedUserId } from "@/lib/auth";
import { isTrustedOrigin, originBlockedResponse } from "@/lib/originGuard";
import {
  checkAndConsumeShoppingSortRateLimit,
  shoppingRateLimitResponse,
} from "@/lib/rateLimit";
import {
  MAX_SHOPPING_ITEMS,
  MAX_SHOPPING_ITEM_LENGTH,
  SHOPPING_DEPARTMENTS,
  buildGroups,
  sanitizeShoppingName,
} from "@/lib/shoppingList";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Раскладывание списка покупок по отделам магазина. Список хранится на
// устройстве (localStorage) — сюда приходит только массив названий на один
// проход. Роут НИЧЕГО не хранит и не пишет в БД.
//
// Защита расходов (жёсткие рамки задачи):
//  - максимум MAX_SHOPPING_ITEMS позиций,
//  - максимум MAX_SHOPPING_ITEM_LENGTH символов на позицию,
//  - rate-limit по сессии (IP + пользователь) через общий lib/rateLimit,
//  - ключ OpenAI только на сервере.
//
// Безопасность вывода: модель НЕ переименовывает и НЕ добавляет позиции. Мы
// просим её вернуть лишь отдел для каждого ИНДЕКСА входа, а группы собираем на
// сервере из оригинальных названий (buildGroups) — модель физически не может
// подменить или выдумать позицию.
export async function POST(req: Request) {
  try {
    if (!isTrustedOrigin(req)) return originBlockedResponse();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
    }

    const rawItems = (body as { items?: unknown })?.items;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json({ error: "Пустой список" }, { status: 400 });
    }
    if (rawItems.length > MAX_SHOPPING_ITEMS) {
      return NextResponse.json(
        { error: `Слишком много позиций (максимум ${MAX_SHOPPING_ITEMS})` },
        { status: 400 },
      );
    }
    if (rawItems.some((it) => typeof it !== "string" || it.length > MAX_SHOPPING_ITEM_LENGTH)) {
      return NextResponse.json(
        { error: `Слишком длинная позиция (максимум ${MAX_SHOPPING_ITEM_LENGTH} символов)` },
        { status: 400 },
      );
    }

    // Санитайз + отсев пустых и дублей (сервер не доверяет клиенту).
    const names: string[] = [];
    for (const raw of rawItems) {
      const name = sanitizeShoppingName(raw);
      if (!name) continue;
      if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
      names.push(name);
    }
    if (names.length === 0) {
      return NextResponse.json({ error: "Пустой список" }, { status: 400 });
    }

    // Лимит по сессии — после валидации (кривой/раздутый запрос отсекаем 400 до
    // расхода бюджета), но до вызова OpenAI.
    const userId = await getVerifiedUserId(req);
    const rateLimit = await checkAndConsumeShoppingSortRateLimit(req, userId);
    if (!rateLimit.ok) return shoppingRateLimitResponse(rateLimit);

    const numbered = names.map((name, i) => `${i}. ${name}`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Ты помощник для списка покупок. Тебе дают пронумерованный список продуктов. " +
            "Отнеси КАЖДУЮ позицию к одному отделу магазина строго из списка отделов. " +
            "НЕ переименовывай позиции, НЕ добавляй новые, НЕ удаляй, НЕ объединяй. " +
            "Отвечай строго в формате JSON.\n\n" +
            `Отделы: ${SHOPPING_DEPARTMENTS.join(", ")}.\n` +
            "Если позиция ни к чему не подходит — отдел «Прочее».\n" +
            'Формат ответа: {"assignments":[{"i":<индекс позиции>,"department":"<отдел>"}, ...]} ' +
            "— по одной записи на КАЖДЫЙ индекс из входа.",
        },
        {
          role: "user",
          content: `Позиции:\n${numbered}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Пустой ответ модели");

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Модель вернула не-JSON — не падаем, отдаём всё «Прочим» как fallback.
      parsed = {};
    }

    const assignments = (parsed as { assignments?: unknown })?.assignments;
    const depByIndex: Array<string | undefined> = new Array(names.length).fill(undefined);
    if (Array.isArray(assignments)) {
      for (const a of assignments) {
        const i = Number((a as { i?: unknown })?.i);
        const department = (a as { department?: unknown })?.department;
        if (Number.isInteger(i) && i >= 0 && i < names.length && typeof department === "string") {
          depByIndex[i] = department;
        }
      }
    }

    const groups = buildGroups(names, depByIndex);
    return NextResponse.json({ groups });
  } catch (error: unknown) {
    console.error("[shopping/sort] error:", error);
    return NextResponse.json({ error: "Не удалось разложить по отделам" }, { status: 500 });
  }
}
