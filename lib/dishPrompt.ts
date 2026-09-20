// Промт картинки блюда: подбор посуды и сборка текста.
//
// ЧИСТЫЙ модуль, БЕЗ "server-only": его импортирует и серверная генерация
// (lib/recipeImage.ts), и тесты, и проверочные прогоны перед батчем. Если бы
// промт жил только внутри server-only-модуля, проверять стиль пришлось бы
// копией текста — а копия расходится с оригиналом на первой же правке.
//
// ЕДИНСТВО СЕРИИ держится на том, что переменных частей ровно три: название
// блюда, ингредиенты и ПОСУДА. Стол, свет, ракурс и запреты — дословно
// одинаковые у всех восьмидесяти картинок.

export type DishwareKind = "plate" | "bowl" | "deep-bowl" | "baking-dish";

/** Английская фраза для промта — как подать блюдо. */
const DISHWARE_PHRASE: Record<DishwareKind, string> = {
  plate: "served on a simple light-coloured dinner plate",
  bowl: "served in a simple light-coloured bowl",
  "deep-bowl": "served in a simple light-coloured deep soup bowl, with the broth clearly visible",
  "baking-dish":
    "served in the light-coloured ceramic baking dish it was cooked in, straight from the oven",
};

// Слова-приметы. Ищем по названию и тегам; регистр и окончания не важны,
// поэтому сравниваем по вхождению корня.
//
// ВАЖНО, ПОЧЕМУ БЕЗ НОВЫХ ПОЛЕЙ В БД. Тип посуды — это не свойство рецепта,
// которое кто-то будет заполнять и поддерживать, а следствие того, что уже
// написано в названии и способе приготовления. Лишнее поле в форме правки
// означало бы восемьдесят решений руками там, где хватает одного правила.
const SOUP_WORDS = [
  "суп", "борщ", "щи", "уха", "бульон", "солянк", "харчо", "рассольник",
  "похлёбк", "похлебк", "гаспачо", "окрошк", "свекольник",
];

const PORRIDGE_WORDS = [
  "каша", "каши", "кашу", "овсянк", "мюсли", "гранол", "смузи", "йогурт",
  "творожок", "рагу", "гуляш", "чили",
];

const BAKED_WORDS = [
  "запекан", "запечён", "запечен", "гратен", "лазань", "жульен", "мусак",
  "в духовке", "под сыром", "картофельная бабк",
];

function haystack(title: string | undefined, tags: string[] | undefined): string {
  return [title || "", ...(tags || [])].join(" ").toLowerCase();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

/**
 * Какая посуда подходит блюду.
 *
 * Порядок проверок не случаен: суп в духовке остаётся супом, а «запечённая
 * лазанья» — запеканкой, даже если способ приготовления не проставлен.
 * Поэтому слова названия сильнее, чем cook_method, и только потом — способ.
 */
export function pickDishware(input: {
  title?: string;
  tags?: string[] | null;
  cookMethod?: string | null;
}): DishwareKind {
  const text = haystack(input.title, input.tags ?? undefined);

  if (hasAny(text, SOUP_WORDS)) return "deep-bowl";
  if (hasAny(text, BAKED_WORDS)) return "baking-dish";
  if (hasAny(text, PORRIDGE_WORDS)) return "bowl";

  // Способ приготовления — подсказка второго ряда. Духовка почти всегда
  // означает форму; всё остальное (плита, мультиварка, без готовки) подаётся
  // на тарелке.
  if (input.cookMethod === "духовка") return "baking-dish";

  return "plate";
}

/**
 * Кадрирование. Разное у квадрата и вертикали, и это не косметика: вертикаль
 * нужна ленте как ВЕРТИКАЛЬНЫЙ снимок стола, а не как квадрат с обрезанными
 * краями — иначе сетка разной высоты выглядит браком вёрстки.
 */
function framing(aspect: "square" | "portrait"): string {
  const common =
    "The whole dish and its dishware fit inside the frame, nothing is cut off at the edges, " +
    "and some of the table is visible around it.";
  return aspect === "portrait"
    ? `${common} Vertical photo: leave generous empty table above and below the dish, so the shot reads as a tall photograph of the table, not as a cropped square.`
    : `${common} Square photo: the dish sits in the middle with an even margin of table around it.`;
}

/**
 * Сборка промта.
 *
 * Требования к стилю заданы основателем: домашняя еда в простой светлой
 * посуде, дневной свет, светлый деревянный стол, ракурс сверху-сбоку,
 * никакой «ресторанной» подачи — блюдо должно выглядеть так, как его реально
 * приготовит человек по рецепту.
 *
 * Английский — для image-моделей надёжнее; название блюда идёт как есть.
 */
export function buildDishPrompt(input: {
  title: string;
  ingredients?: string[];
  aspect: "square" | "portrait";
  dishware: DishwareKind;
}): string {
  const ings = input.ingredients ?? [];
  const ingLine = ings.length ? `\nKey ingredients: ${ings.join(", ")}.` : "";

  return `Homemade food photography of the finished dish "${input.title}".${ingLine}

How this dish is served:
- ${DISHWARE_PHRASE[input.dishware]};
- the dishware is plain, simple and light-coloured, no patterns, no decoration.

Style, identical for every photo in this series:
- everyday home cooking, not a restaurant;
- the dishware stands on a light wooden kitchen table, plain background;
- soft natural daylight from a window, no harsh shadows, no flash;
- camera slightly above, about a 45-degree angle;
- the food looks exactly like an ordinary person cooked it at home:
  honest generous portion, slightly uneven, real texture.

${framing(input.aspect)}

At most one simple fork or spoon may lie on the table next to the dish.
Nothing else on the table: no napkins, no jars, no ingredients scattered
around, no cutting boards, no styling props.

Do NOT make it look like a restaurant: no fine-dining plating, no stacked
towers, no sauce smears or dots, no microgreens or edible flowers, no tweezers
styling.

No text, no captions, no watermark, no logo, no brand names,
no hands, no people.`;
}
