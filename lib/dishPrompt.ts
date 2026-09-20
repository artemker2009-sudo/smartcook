// Промт картинки блюда: посуда, сцена и сборка текста.
//
// ЧИСТЫЙ модуль, БЕЗ "server-only": его импортирует и серверная генерация
// (lib/recipeImage.ts), и тесты, и проверочные прогоны перед батчем. Если бы
// промт жил только внутри server-only-модуля, проверять стиль пришлось бы
// копией текста — а копия расходится с оригиналом на первой же правке.
//
// ГЛАВНАЯ ИДЕЯ. Лента должна листаться как Pinterest, а не как каталог с одним
// фоном. Разнообразие здесь УПРАВЛЯЕМОЕ: поверхность, ракурс и реквизит
// выбираются нами из закрытых списков и детерминированно от slug, а не
// отдаются на усмотрение модели. Свобода модели дала бы разнобой, который
// нечем воспроизвести: перегенерация выдавала бы совсем другую картинку, а
// соседние карточки случайно совпадали бы фоном.
//
// Неизменно для всех восьмидесяти: домашняя еда, мягкий дневной свет, простая
// посуда без узоров, ни рук, ни людей, ни текста, никакой ресторанной подачи.

// ── Посуда ───────────────────────────────────────────────────────────────────

export type DishwareKind = "plate" | "bowl" | "deep-bowl" | "baking-dish";

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

/**
 * Совпадение корня С НАЧАЛОМ СЛОВА, а не где попало внутри строки.
 *
 * Простое includes здесь давало тихий брак: тег «овощи» содержит «щи», и
 * запечённая рыба уезжала в глубокую тарелку для супа. Поймано на реальном
 * прогоне — картинка уже была сгенерирована и оплачена.
 *
 * Короткие корни («щи», «уха», «лук») опасны именно этим, а отказаться от них
 * нельзя: это нормальные названия блюд и продуктов. Поэтому требуем, чтобы
 * корень начинал слово. \b в JS работает по латинице и для кириллицы
 * бесполезен, поэтому границу задаём явно: начало строки или не-буква.
 */
function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}`, "u").test(text);
  });
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
  if (input.cookMethod === "духовка") return "baking-dish";

  return "plate";
}

// ── Сцена: поверхность, ракурс, реквизит ─────────────────────────────────────

export const SURFACES = [
  "light-wood",
  "dark-wood",
  "white-counter",
  "linen",
  "grey-stone",
] as const;
export type Surface = (typeof SURFACES)[number];

const SURFACE_PHRASE: Record<Surface, string> = {
  "light-wood": "a light wooden kitchen table with visible wood grain",
  "dark-wood": "a dark walnut wooden table with visible wood grain",
  "white-counter": "a plain white kitchen countertop",
  "linen": "a plain natural linen tablecloth, softly wrinkled, no pattern",
  "grey-stone": "a light grey stone countertop with subtle texture",
};

export const ANGLES = ["top-down", "three-quarter", "close-side"] as const;
export type Angle = (typeof ANGLES)[number];

const ANGLE_PHRASE: Record<Angle, string> = {
  "top-down": "camera directly above, straight top-down flat-lay shot",
  "three-quarter": "camera above and to the side, about a 45-degree angle",
  "close-side": "camera close to table level, slightly to the side, so the height of the food shows",
};

/**
 * Форма блюда решает, какие ракурсы ему идут.
 *
 * Жидкое и плоское сверху читается, а «сбоку» превратит суп в полоску. И
 * наоборот: стопка сырников или кусок пирога сверху выглядят кляксой — им
 * нужен ракурс, показывающий высоту.
 */
export type DishShape = "flat" | "tall";

const TALL_WORDS = [
  "сырник", "блин", "оладь", "панкейк", "пирог", "торт", "кекс", "маффин",
  "бутерброд", "сэндвич", "бургер", "котлет", "рулет", "стопк", "слоён",
  "тост", "круассан", "запеканк", "лазань",
];

const FLAT_WORDS = [
  ...SOUP_WORDS,
  "каша", "пицц", "омлет", "яичниц", "салат", "паст", "спагетти", "лапш",
  "рагу", "ризотто", "плов", "смузи",
];

export function pickDishShape(input: { title?: string; tags?: string[] | null }): DishShape {
  const text = haystack(input.title, input.tags ?? undefined);
  // Сначала «высокое»: «сырники» важнее, чем «салат» в теге гарнира.
  if (hasAny(text, TALL_WORDS)) return "tall";
  if (hasAny(text, FLAT_WORDS)) return "flat";
  return "flat";
}

const ANGLES_FOR_SHAPE: Record<DishShape, readonly Angle[]> = {
  flat: ["top-down", "three-quarter"],
  tall: ["three-quarter", "close-side"],
};

/**
 * Реквизит-продукты. Кладём рядом ТОЛЬКО то, что есть в рецепте — иначе
 * картинка обещает состав, которого в рецепте нет, а у нас на экране рецепта
 * висит предупреждение про аллергены.
 *
 * Словарь заодно решает вторую задачу: переводит продукт на английский. Всё,
 * чего в словаре нет (фарш, мука, разрыхлитель), реквизитом не станет — да и
 * не должно: рядом с тарелкой уместны лимон и зелень, а не пачка соли.
 */
const PROP_DICTIONARY: { roots: string[]; en: string }[] = [
  { roots: ["лимон"], en: "a wedge of fresh lemon" },
  { roots: ["лайм"], en: "a wedge of fresh lime" },
  { roots: ["укроп", "петрушк", "зелен", "кинз", "базилик"], en: "a small sprig of fresh herbs" },
  { roots: ["помидор", "томат", "черри"], en: "one fresh tomato" },
  { roots: ["огурец", "огурц"], en: "one fresh cucumber" },
  { roots: ["чеснок"], en: "a clove of garlic" },
  { roots: ["лук"], en: "half a fresh onion" },
  { roots: ["перец болгарск", "болгарск"], en: "one fresh bell pepper" },
  { roots: ["яблок"], en: "one fresh apple" },
  { roots: ["банан"], en: "one fresh banana" },
  { roots: ["ягод", "малин", "черник", "клубник", "смородин"], en: "a few fresh berries" },
  { roots: ["орех", "грецк", "миндал"], en: "a few walnuts" },
  { roots: ["сметан"], en: "a small bowl of sour cream" },
  { roots: ["мёд", "мед"], en: "a small jar of honey" },
  { roots: ["сыр"], en: "a small piece of cheese" },
  { roots: ["морков"], en: "one fresh carrot" },
  { roots: ["яйц", "яйк"], en: "one raw egg" },
];

/** Сколько продуктов-реквизита кладём рядом: ноль, один или два. */
function foodProps(ingredients: string[] | undefined, pick: number): string[] {
  const text = (ingredients || []).join(" ").toLowerCase();
  const matched: string[] = [];
  for (const entry of PROP_DICTIONARY) {
    // Тот же матчер по началу слова: иначе «сыр» цепляется к «сырникам», и
    // рядом с творожными сырниками лежал бы кусок сыра.
    if (hasAny(text, entry.roots) && !matched.includes(entry.en)) {
      matched.push(entry.en);
    }
  }
  if (matched.length === 0) return [];
  // Детерминированно: та же сцена — тот же реквизит.
  const count = matched.length === 1 ? 1 : 1 + (pick % 2);
  const start = pick % matched.length;
  return Array.from({ length: Math.min(count, matched.length) }, (_, i) => matched[(start + i) % matched.length]);
}

export type Scene = {
  surface: Surface;
  angle: Angle;
  cutlery: "fork" | "spoon";
  napkin: boolean;
  props: string[];
};

/**
 * Детерминированный хэш строки. Нужен именно детерминированный: повторная
 * генерация того же рецепта обязана дать ТУ ЖЕ сцену, иначе «перерисовать,
 * потому что блюдо вышло неудачно» меняло бы заодно фон и ракурс, и сравнить
 * две попытки было бы не с чем.
 */
export function sceneHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Выбор сцены.
 *
 * `familyIndex` — порядковый номер рецепта внутри семейства. Благодаря ему у
 * «Сырников классических» и «Сырников с бананом» РАЗНЫЕ поверхности: иначе два
 * почти одинаковых блюда стояли бы в ленте рядом на одном фоне и читались как
 * дубль. Пять поверхностей покрывают семейство до пяти вариантов.
 *
 * `variant` — сколько раз уже перегенерировали. Каждая перегенерация берёт
 * СЛЕДУЮЩУЮ сцену по кругу: если картинка не понравилась, повтор должен дать
 * другую сцену, а не ту же самую ещё раз.
 */
export function pickScene(input: {
  slug: string;
  family?: string | null;
  familyIndex?: number;
  variant?: number;
  title?: string;
  tags?: string[] | null;
  ingredients?: string[];
  dishware?: DishwareKind;
}): Scene {
  const familyIndex = input.familyIndex ?? 0;
  const variant = input.variant ?? 0;
  // Семейство задаёт общую точку отсчёта, familyIndex разводит его членов.
  const seed = input.family || input.slug;
  const base = sceneHash(seed) + familyIndex + variant;

  const surface = SURFACES[base % SURFACES.length];

  const shape = pickDishShape({ title: input.title, tags: input.tags });
  const allowed = ANGLES_FOR_SHAPE[shape];
  const angle = allowed[(sceneHash(input.slug) + variant) % allowed.length];

  // Ложка супу и каше, вилка остальному — иначе на снимке лежит вилка рядом с
  // бульоном, и это первое, за что цепляется глаз.
  const cutlery: "fork" | "spoon" =
    input.dishware === "deep-bowl" || input.dishware === "bowl" ? "spoon" : "fork";

  return {
    surface,
    angle,
    // Салфетка не на каждом кадре: иначе она сама становится «одним фоном».
    napkin: base % 3 === 0,
    props: foodProps(input.ingredients, base),
    cutlery,
  };
}

// ── Сборка промта ────────────────────────────────────────────────────────────

/**
 * Кадрирование. Блюдо должно занимать 60–75% кадра: на первой версии оно было
 * слишком мелким, и в ленте по две колонки на телефоне еда терялась среди
 * стола. Посуде разрешено слегка выходить за край — так кадр живее и ближе к
 * тому, как люди снимают еду сами.
 */
function framing(aspect: "square" | "portrait"): string {
  const common =
    "The dish fills most of the frame — about two thirds of it. " +
    "The dishware may extend slightly beyond the edges of the frame, that is fine. " +
    "Some of the surface stays visible around the food.";
  return aspect === "portrait"
    ? `${common} Vertical photo: the composition reads as a tall photograph, not as a cropped square.`
    : `${common} Square photo.`;
}

function propsLine(scene: Scene): string {
  const items = [
    scene.cutlery === "spoon" ? "one simple spoon" : "one simple fork",
    scene.napkin ? "one plain folded napkin" : "",
    ...scene.props,
  ].filter(Boolean);
  return items.join(", ");
}

export function buildDishPrompt(input: {
  title: string;
  ingredients?: string[];
  aspect: "square" | "portrait";
  dishware: DishwareKind;
  scene: Scene;
}): string {
  const ings = input.ingredients ?? [];
  const ingLine = ings.length ? `\nKey ingredients: ${ings.join(", ")}.` : "";

  return `Homemade food photography of the finished dish "${input.title}".${ingLine}

How this dish is served:
- ${DISHWARE_PHRASE[input.dishware]};
- the dishware is plain, simple and light-coloured, no patterns, no decoration.

Scene:
- the dish stands on ${SURFACE_PHRASE[input.scene.surface]};
- ${ANGLE_PHRASE[input.scene.angle]};
- next to the dish, only these objects: ${propsLine(input.scene)};
- nothing else is on the surface: no extra props, no jars, no boards, no clutter.

Always, in every photo of this series:
- everyday home cooking, exactly as an ordinary person would cook it at home:
  honest generous portion, slightly uneven, real texture;
- soft natural daylight from a window, no harsh shadows, no flash;
- plain background, nothing distracting behind the dish.

${framing(input.aspect)}

Do NOT make it look like a restaurant: no fine-dining plating, no stacked
towers, no sauce smears or dots, no microgreens or edible flowers, no tweezers
styling.

No text, no captions, no watermark, no logo, no brand names,
no hands, no people.`;
}
