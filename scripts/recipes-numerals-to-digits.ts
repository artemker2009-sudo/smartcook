/* eslint-disable no-console */
// Числительные словами → цифрами в каталоге «Идеи».
//
// ЗАПУСК (из корня репозитория, ключи из .env.local — это БОЕВАЯ база):
//   set -a; . ./.env.local; set +a
//   npx jiti scripts/recipes-numerals-to-digits.ts            # показать замены
//   npx jiti scripts/recipes-numerals-to-digits.ts --apply    # записать
//
// Правит ТОЛЬКО текст: description, steps, ingredients[].amount.
// Не трогает is_published, картинки, миниатюры и любые другие колонки.
// OpenAI не вызывается вовсе — вся логика в lib/numeralsToDigits.ts, и она
// покрыта тестами: решение о каждой замене принимает словарь, а не модель.
//
// БЕЗ --apply НИ ОДНОЙ ЗАПИСИ НЕ ПРОИСХОДИТ. Показанный список — это ровно то,
// что будет записано: и текст, и отчёт считаются одной и той же функцией.
//
// ИДЕМПОТЕНТНОСТЬ. Замена цифры на цифру невозможна: числительные ищутся
// словарём слов. Повторный запуск после успешного — «нечего менять».
//
// ОТКАТ. Перед записью каждая правка печатается целиком (было → стало), и
// прежние значения остаются в выводе запуска. Для отката нужен именно он,
// поэтому вывод --apply стоит сохранять в файл.

import { createClient } from "@supabase/supabase-js";
import { numeralsToDigits, type NumeralReplacement } from "../lib/numeralsToDigits";

const APPLY = process.argv.includes("--apply");
// Одиночный рецепт: --slug=syrniki-iz-tvoroga. Удобно для проверки одной
// правки перед общим прогоном.
const ONLY_SLUG = process.argv.find((a) => a.startsWith("--slug="))?.slice("--slug=".length) ?? null;

type Ingredient = { name?: unknown; amount?: unknown };

type Row = {
  id: string;
  slug: string;
  title: string;
  description: string;
  steps: unknown;
  ingredients: unknown;
};

type FieldChange = {
  /** Что правим: «описание», «шаг 3», «продукт 2 (количество)». */
  where: string;
  before: string;
  after: string;
  replacements: NumeralReplacement[];
};

type RecipeChange = {
  row: Row;
  changes: FieldChange[];
  description: string;
  steps: string[];
  ingredients: Ingredient[];
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => (typeof v === "string" ? v : "")) : [];
}

function asIngredients(value: unknown): Ingredient[] {
  return Array.isArray(value) ? (value as Ingredient[]) : [];
}

/** Считает правки одного рецепта. Ничего не пишет. */
function planRecipe(row: Row): RecipeChange | null {
  const changes: FieldChange[] = [];

  const description = numeralsToDigits(row.description ?? "");
  if (description.replacements.length > 0) {
    changes.push({
      where: "описание",
      before: row.description,
      after: description.text,
      replacements: description.replacements,
    });
  }

  const steps = asStringArray(row.steps).map((step, i) => {
    const result = numeralsToDigits(step);
    if (result.replacements.length > 0) {
      changes.push({ where: `шаг ${i + 1}`, before: step, after: result.text, replacements: result.replacements });
    }
    return result.text;
  });

  const ingredients = asIngredients(row.ingredients).map((item, i) => {
    if (typeof item?.amount !== "string") return item;
    const result = numeralsToDigits(item.amount);
    if (result.replacements.length === 0) return item;
    const name = typeof item.name === "string" ? item.name : `продукт ${i + 1}`;
    changes.push({
      where: `количество · ${name}`,
      before: item.amount,
      after: result.text,
      replacements: result.replacements,
    });
    return { ...item, amount: result.text };
  });

  if (changes.length === 0) return null;
  return { row, changes, description: description.text, steps, ingredients };
}

function printRecipe(plan: RecipeChange, index: number, total: number): void {
  console.log("");
  console.log(`[${index + 1}/${total}] ${plan.row.slug} — ${plan.row.title}`);
  for (const change of plan.changes) {
    const words = change.replacements.map((r) => `«${r.from}» → ${r.to} (${r.head})`).join(", ");
    console.log(`  ${change.where}: ${words}`);
    console.log(`    было:  ${change.before}`);
    console.log(`    стало: ${change.after}`);
  }
}

async function main(): Promise<number> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Нет NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — загрузите .env.local");
    return 2;
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  let query = sb
    .from("idea_recipes")
    .select("id, slug, title, description, steps, ingredients")
    .order("slug", { ascending: true });
  if (ONLY_SLUG) query = query.eq("slug", ONLY_SLUG);

  const { data, error } = await query;
  if (error) {
    console.error(`Не прочитал idea_recipes: ${error.message}`);
    return 2;
  }

  const rows = (data ?? []) as Row[];
  const plans = rows.map(planRecipe).filter((p): p is RecipeChange => p !== null);
  const words = plans.reduce((n, p) => n + p.changes.reduce((m, c) => m + c.replacements.length, 0), 0);

  console.log(APPLY ? "РЕЖИМ: ЗАПИСЫВАЮ (--apply)" : "РЕЖИМ: ПОКАЗЫВАЮ, ЧТО ЗАМЕНЮ (без записи)");
  console.log(
    `рецептов ${rows.length}${ONLY_SLUG ? ` (фильтр --slug=${ONLY_SLUG})` : ""} · ` +
      `с заменами ${plans.length} · всего замен ${words}`,
  );
  if (plans.length === 0) {
    console.log("Менять нечего.");
    return 0;
  }

  plans.forEach((plan, i) => printRecipe(plan, i, plans.length));

  if (!APPLY) {
    console.log("");
    console.log("Ничего не записано. Записать: тот же запуск с --apply");
    return 0;
  }

  console.log("");
  let written = 0;
  for (const plan of plans) {
    const { error: updateError } = await sb
      .from("idea_recipes")
      .update({ description: plan.description, steps: plan.steps, ingredients: plan.ingredients })
      .eq("id", plan.row.id);
    if (updateError) {
      console.error(`${plan.row.slug} — НЕ записан: ${updateError.message}`);
      continue;
    }

    // Заблокированная или не дошедшая запись выглядит как успешная — читаем
    // значение обратно (правило 3.2 CLAUDE.md).
    const { data: back, error: backError } = await sb
      .from("idea_recipes")
      .select("description, steps, ingredients")
      .eq("id", plan.row.id)
      .single<{ description: string; steps: unknown; ingredients: unknown }>();
    if (backError || !back) {
      console.error(`${plan.row.slug} — записан, но не перечитан: ${backError?.message ?? "пустой ответ"}`);
      continue;
    }
    const same =
      back.description === plan.description &&
      JSON.stringify(back.steps) === JSON.stringify(plan.steps) &&
      JSON.stringify(back.ingredients) === JSON.stringify(plan.ingredients);
    if (!same) {
      console.error(`${plan.row.slug} — чтение обратно не совпало, проверьте рецепт руками`);
      continue;
    }
    written++;
    console.log(`${plan.row.slug} — записан и перечитан`);
  }

  console.log("");
  console.log(`Готово: записано ${written} из ${plans.length}.`);
  return written === plans.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(2);
  },
);
