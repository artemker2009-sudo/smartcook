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
//  4. Позиция считается ЗАВЕРШЁННОЙ, когда у неё есть название и следом
//     количество с единицей («огурцы три штуки»). После завершённой позиции
//     новую начинает любое слово — в том числе незнакомое, бренд или латиница:
//     «огурцы три штуки | кока-кола две штуки по 1 л». Без этого правила
//     словарь молчит на брендах и вся фраза слипается в одну позицию.
//  5. Связки («и», «ещё», «купи») в начале позиции выбрасываются, в середине
//     сохраняются — «филе без кожи и костей» остаётся как сказано.

import { classifyWord, looksLikeAdjective, type WordKind } from "./productWords";

export function splitPhraseIntoItems(phrase: string): string[] {
  if (typeof phrase !== "string" || !phrase.trim()) return [];

  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  const kinds: WordKind[] = tokens.map(classifyWord);

  const items: string[] = [];
  let current: string[] = [];
  let currentHasProduct = false;
  let afterPreposition = false; // предыдущее значимое слово — предлог
  let hasName = false; // в позиции уже есть название (продукт или бренд)
  let complete = false; // у позиции есть название + количество с единицей
  let prevKind: WordKind | null = null; // вид последнего ДОБАВЛЕННОГО слова
  let pending: string[] = []; // связки, судьба которых зависит от следующего слова

  const closeCurrent = () => {
    if (current.length > 0) items.push(current.join(" "));
    current = [];
    currentHasProduct = false;
    afterPreposition = false;
    hasName = false;
    complete = false;
    prevKind = null;
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
      if ((currentHasProduct || complete) && !afterPreposition) closeCurrent();
      push(token);
      currentHasProduct = true;
      hasName = true;
      afterPreposition = false; // хвост «в/для/без …» закрыт своим продуктом
      prevKind = kind;
      return;
    }

    if (kind === "quantity") {
      // «яйца молоко 3 л» — «3» относится к молоку, а не начинает позицию.
      // «два молока три яйца» — «три» начинает, потому что дальше сразу продукт.
      if (currentHasProduct && !afterPreposition && nextMeaningfulKind(i + 1) === "product") {
        closeCurrent();
      }
      push(token);
      prevKind = "quantity";
      return;
    }

    if (kind === "unit") {
      push(token);
      // «огурцы три штуки» — название + количество + единица: позиция закончена.
      // «два литра молока» — названия ещё не было, поэтому не закончена.
      if (prevKind === "quantity" && hasName) complete = true;
      prevKind = kind;
      return;
    }

    if (kind === "preposition") {
      // Предложный хвост продолжает позицию: «кока-кола две штуки ПО 1 л».
      afterPreposition = true;
      complete = false;
      push(token);
      prevKind = kind;
      return;
    }

    // Незнакомое слово. После завершённой позиции оно начинает новую — так
    // ловятся бренды, которых нет и не будет в словаре («кока-кола»,
    // «coca-cola»). Прилагательное исключаем: «яйца 10 шт домашние» — это всё
    // ещё одна позиция.
    if (complete && !looksLikeAdjective(token)) closeCurrent();
    push(token);
    hasName = true;
    prevKind = kind;
  });

  closeCurrent();
  return items;
}
