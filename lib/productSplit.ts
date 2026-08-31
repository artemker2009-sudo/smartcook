// Разбиение фразы на позиции списка покупок по словарю продуктов.
// Общий алгоритм для ГОЛОСА и для ТЕКСТА: пользователь одинаково диктует и
// пишет без запятых — «молоко яйца хлеб тефтели».
//
// Правила (ровно в этом порядке):
//  1. Новая позиция начинается со слова-продукта из словаря — но только если в
//     текущей позиции продукт уже есть. «куриное филе» → одна позиция, потому
//     что «куриное» продуктом не считается (это прилагательное).
//  2. Количество и единица приклеиваются к продукту слева: «молоко 2 л».
//     Количество начинает новую позицию, только если сразу за ним идёт продукт
//     («два молока | три яйца») — иначе «молоко 2 л» развалилось бы.
//  3. Незнакомые слова («охлаждённое», «без кожи и костей») продолжают текущую
//     позицию и никогда не начинают новую.
//  4. Связки («и», «ещё», «купи») в начале позиции выбрасываются, в середине
//     сохраняются — «филе без кожи и костей» остаётся как сказано.

import { classifyWord, type WordKind } from "./productWords";

export function splitPhraseIntoItems(phrase: string): string[] {
  if (typeof phrase !== "string" || !phrase.trim()) return [];

  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  const kinds: WordKind[] = tokens.map(classifyWord);

  const items: string[] = [];
  let current: string[] = [];
  let currentHasProduct = false;
  let afterPreposition = false; // предыдущее значимое слово — предлог
  let pending: string[] = []; // связки, судьба которых зависит от следующего слова

  const closeCurrent = () => {
    if (current.length > 0) items.push(current.join(" "));
    current = [];
    currentHasProduct = false;
    pending = []; // связка на границе позиций («молоко и хлеб») выбрасывается
  };

  const push = (token: string) => {
    // Связки в середине позиции возвращаем на место, в начале — выбрасываем.
    if (current.length > 0 && pending.length > 0) current.push(...pending);
    pending = [];
    current.push(token);
  };

  // Ближайшее следующее слово, не являющееся связкой.
  const nextMeaningfulKind = (from: number): WordKind | null => {
    for (let j = from; j < kinds.length; j++) {
      if (kinds[j] !== "connector") return kinds[j];
    }
    return null;
  };

  tokens.forEach((token, i) => {
    const kind = kinds[i];

    if (kind === "connector") {
      pending.push(token);
      return;
    }

    if (kind === "product") {
      // После предлога продукт принадлежит текущей позиции: «тефтели в соусе».
      if (currentHasProduct && !afterPreposition) closeCurrent();
      push(token);
      currentHasProduct = true;
      afterPreposition = false; // хвост «в/для/без …» закрыт своим продуктом
      return;
    }

    if (kind === "quantity") {
      // «яйца молоко 3 л» — «3» относится к молоку, а не начинает позицию.
      // «два молока три яйца» — «три» начинает, потому что дальше сразу продукт.
      if (currentHasProduct && !afterPreposition && nextMeaningfulKind(i + 1) === "product") {
        closeCurrent();
      }
      push(token);
      return;
    }

    // Признак «мы внутри предложного хвоста» переживает описания между предлогом
    // и продуктом: «в томатном соусе». Гасит его только сам продукт (выше).
    if (kind === "preposition") afterPreposition = true;
    push(token);
  });

  closeCurrent();
  return items;
}
