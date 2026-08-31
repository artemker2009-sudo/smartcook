import OpenAI from "openai";

import { SHOPPING_DEPARTMENTS, buildGroups, type ShoppingGroup } from "./shoppingList";

// Раскладка позиций по отделам магазина — ОДИН вызов модели на оба списка.
//
// Раньше эта логика жила прямо в /api/shopping/sort. Общему списку нужна ровно
// та же раскладка, и копия неминуемо разъехалась бы с оригиналом после первой
// же правки промпта — поэтому вынесено сюда, а роуты только зовут.
//
// ТОЛЬКО СЕРВЕР: модуль тянет ключ OpenAI из окружения, в клиентские компоненты
// его импортировать нельзя.
//
// БЕЗОПАСНОСТЬ ВЫВОДА (главное в этом файле). Модель НЕ переименовывает и НЕ
// добавляет позиции: её просят вернуть лишь отдел для каждого ИНДЕКСА входа, а
// группы собираются здесь, на сервере, из ОРИГИНАЛЬНЫХ названий (buildGroups).
// Подменить, выдумать или потерять позицию она физически не может — что бы она
// ни вернула, наружу уйдут только те строки, которые пришли на вход.

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function groupNamesByDepartment(names: string[]): Promise<ShoppingGroup[]> {
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
      { role: "user", content: `Позиции:\n${numbered}` },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("Пустой ответ модели");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Модель вернула не-JSON — не падаем: ниже всё уедет в «Прочее».
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

  return buildGroups(names, depByIndex);
}
