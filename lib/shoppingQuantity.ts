// Отделение количества от названия — ТОЛЬКО ДЛЯ ПОКАЗА.
//
// В хранилище позиция была и осталась одной строкой («Молоко 2 л»): ни
// ShoppingItem, ни shared_list_items не меняются, миграции нет. Здесь строка
// лишь разбирается на два куска, чтобы в строке списка название стояло слева
// крупно, а количество — справа серым. Все сравнения, дедуп, подпись
// сортировки, «Скопировать список» и Купер продолжают работать с ПОЛНЫМ
// именем.
//
// Правило на сомнения: если разбор не уверен — возвращаем название целиком и
// пустое количество. Лучше пусто справа, чем «Сметана» вместо «Сметана 20%».

import { UNITS } from "./shoppingList";

export type NameParts = {
  /** Название для крупной строки. Никогда не пустое. */
  label: string;
  /** Количество для серой строки справа. Пусто, если разбор не уверен. */
  qty: string;
};

// Число: «2», «1.5», «0,5». Диапазоны («2-3») намеренно не поддерживаем —
// это уже не количество, а пожелание, и правильнее оставить его в названии.
const NUM = /^\d+(?:[.,]\d+)?$/;
// Слипшееся «2л», «400г», «10шт.» одним куском.
const GLUED = /^(\d+(?:[.,]\d+)?)([а-яё]{1,10})\.?$/i;

// Дальше этого количество не растягиваем: длинный хвост справа сожрёт
// название, а ради него вся затея.
const MAX_QTY_LENGTH = 12;

function isUnit(token: string): boolean {
  return UNITS.has(token.replace(/\.$/, "").toLowerCase());
}

// В названии должна остаться хоть одна буква: «2 кг» целиком уедет вправо, а
// слева будет пусто — такую строку человек не прочитает.
function hasLetter(s: string): boolean {
  return /[a-zа-яё]/i.test(s);
}

/**
 * Разбирает «Молоко 2 л» на {label: "Молоко", qty: "2 л"}.
 *
 * Берём количество ТОЛЬКО с конца строки. Ведущее количество («2 кг картошки»)
 * не трогаем: название осталось бы в родительном падеже («картошки»), и строка
 * читалась бы хуже исходной.
 *
 * Разбираются три случая:
 *   «Сыр российский 200 г»  → 200 г
 *   «Сметана 20% 400г»      → 400 г   (слипшееся раскрываем)
 *   «Яблоки 3»              → 3       (голое число — это количество)
 * Всё остальное («Уксус (бальзамический или яблочный)», «Пельмени 3 звезды»)
 * возвращается одной строкой.
 */
export function splitQuantity(rawName: string): NameParts {
  const name = rawName.trim();
  const whole: NameParts = { label: name, qty: "" };
  if (!name) return whole;

  const tokens = name.split(/\s+/);
  if (tokens.length < 2) return whole;

  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];

  // «… 200 г» — число и единица отдельными словами.
  if (isUnit(last) && NUM.test(prev)) {
    const label = tokens.slice(0, -2).join(" ");
    const qty = `${prev} ${last.replace(/\.$/, "")}`;
    if (hasLetter(label) && qty.length <= MAX_QTY_LENGTH) return { label, qty };
    return whole;
  }

  const glued = GLUED.exec(last);
  // «… 400г» — число и единица слиплись.
  if (glued && isUnit(glued[2])) {
    const label = tokens.slice(0, -1).join(" ");
    const qty = `${glued[1]} ${glued[2].toLowerCase()}`;
    if (hasLetter(label) && qty.length <= MAX_QTY_LENGTH) return { label, qty };
    return whole;
  }

  // «Яблоки 3» — голое число в конце.
  if (NUM.test(last)) {
    const label = tokens.slice(0, -1).join(" ");
    if (hasLetter(label) && last.length <= MAX_QTY_LENGTH) return { label, qty: last };
    return whole;
  }

  return whole;
}
