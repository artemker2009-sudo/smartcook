import { describe, expect, it } from "vitest";
// Внутри lib/ импортируем соседей относительным путём: алиас @/ в vitest не резолвится.
import {
  ANGLES,
  SURFACES,
  buildDishPrompt,
  pickDishShape,
  pickDishware,
  pickScene,
  type Scene,
} from "./dishPrompt";

// Посуда, ракурс и сцена подбираются кодом, а не моделью, и новых полей в БД
// под это нет. Значит правила обязаны быть проверяемыми: ошибка здесь стоит
// денег (картинка уже сгенерирована) и видна только глазами.

describe("pickDishware", () => {
  it("супы — в глубокой тарелке", () => {
    for (const title of [
      "Куриный суп с лапшой",
      "Борщ с говядиной",
      "Щи из свежей капусты",
      "Уха из речной рыбы",
      "Окрошка на кефире",
    ]) {
      expect(pickDishware({ title }), title).toBe("deep-bowl");
    }
  });

  it("запечённое — в форме для запекания", () => {
    for (const title of ["Запеканка творожная", "Запечённая рыба с овощами", "Лазанья с фаршем"]) {
      expect(pickDishware({ title }), title).toBe("baking-dish");
    }
  });

  it("каши и рагу — в миске", () => {
    for (const title of ["Овсяная каша с бананом", "Гречневая каша", "Рагу овощное"]) {
      expect(pickDishware({ title }), title).toBe("bowl");
    }
  });

  it("всё остальное — на тарелке", () => {
    for (const title of ["Сырники со сметаной", "Куриное филе с овощами", "Салат с тунцом"]) {
      expect(pickDishware({ title }), title).toBe("plate");
    }
  });

  it("духовка без слов-примет тоже даёт форму", () => {
    expect(pickDishware({ title: "Курица с картошкой", cookMethod: "духовка" })).toBe("baking-dish");
  });

  it("слова названия сильнее способа: суп из духовки остаётся супом", () => {
    expect(pickDishware({ title: "Суп-пюре из тыквы", cookMethod: "духовка" })).toBe("deep-bowl");
  });

  it("теги учитываются наравне с названием", () => {
    expect(pickDishware({ title: "Харчо по-домашнему", tags: ["суп"] })).toBe("deep-bowl");
  });

  it("пустой ввод не роняет и даёт тарелку", () => {
    expect(pickDishware({})).toBe("plate");
  });

  // ПОЙМАНО НА ЖИВОМ ПРОГОНЕ, картинка уже была сгенерирована и оплачена.
  // Корни искались простым includes, тег «овощи» содержит «щи» — и запечённая
  // рыба уехала в глубокую тарелку для супа. Теперь корень обязан начинать
  // слово.
  it("«овощи» не делают блюдо супом", () => {
    expect(
      pickDishware({
        title: "Запечённая рыба с овощами",
        tags: ["рыба", "овощи", "духовка"],
        cookMethod: "духовка",
      }),
    ).toBe("baking-dish");
    expect(pickDishware({ title: "Салат с овощами", tags: ["овощи"] })).toBe("plate");
    expect(pickDishware({ title: "Рагу с овощами", tags: ["овощи"] })).toBe("bowl");
  });

  it("настоящие щи супом остаются", () => {
    expect(pickDishware({ title: "Щи из свежей капусты" })).toBe("deep-bowl");
    expect(pickDishware({ title: "Суточные щи" })).toBe("deep-bowl");
  });
});

describe("pickDishShape — от формы зависит ракурс", () => {
  it("жидкое и плоское", () => {
    for (const title of ["Куриный суп", "Овсяная каша", "Пицца маргарита", "Омлет с сыром"]) {
      expect(pickDishShape({ title }), title).toBe("flat");
    }
  });

  it("высокое и слоёное", () => {
    for (const title of ["Сырники со сметаной", "Блины с творогом", "Кусок пирога", "Котлеты"]) {
      expect(pickDishShape({ title }), title).toBe("tall");
    }
  });
});

describe("pickScene", () => {
  it("детерминирована: тот же рецепт — та же сцена", () => {
    const a = pickScene({ slug: "syrniki-klassicheskie", title: "Сырники" });
    const b = pickScene({ slug: "syrniki-klassicheskie", title: "Сырники" });
    expect(a).toEqual(b);
  });

  // Ради этого всё и затевалось: повтор «потому что блюдо вышло неудачно»
  // обязан дать ДРУГУЮ сцену, иначе смысла в кнопке нет.
  it("перегенерация берёт следующую сцену по кругу", () => {
    const first = pickScene({ slug: "borsch", title: "Борщ" });
    const second = pickScene({ slug: "borsch", title: "Борщ", variant: 1 });
    expect(second.surface).not.toBe(first.surface);
  });

  it("проход по кругу возвращается к началу через пять поверхностей", () => {
    const first = pickScene({ slug: "borsch", title: "Борщ" });
    const sixth = pickScene({ slug: "borsch", title: "Борщ", variant: SURFACES.length });
    expect(sixth.surface).toBe(first.surface);
  });

  it("у рецептов одного семейства поверхности разные", () => {
    const family = "syrniki";
    const surfaces = [0, 1, 2, 3, 4].map(
      (familyIndex) =>
        pickScene({ slug: `syrniki-${familyIndex}`, family, familyIndex, title: "Сырники" }).surface,
    );
    expect(new Set(surfaces).size).toBe(SURFACES.length);
  });

  it("ракурс подходит форме блюда: суп не снимаем сбоку", () => {
    for (const variant of [0, 1, 2, 3, 4]) {
      const soup = pickScene({ slug: `sup-${variant}`, title: "Куриный суп", variant });
      expect(["top-down", "three-quarter"], `variant ${variant}`).toContain(soup.angle);
    }
  });

  // Каша под 45° показывает борт миски, а не еду. Правило жёсткое: миска —
  // только сверху, при любом варианте перегенерации.
  it("каша в миске снимается строго сверху, сколько ни перегенерируй", () => {
    for (const variant of [0, 1, 2, 3, 4, 5]) {
      const kasha = pickScene({ slug: `kasha-${variant}`, title: "Овсяная каша с яблоком", variant });
      expect(kasha.angle, `variant ${variant}`).toBe("top-down");
    }
  });

  it("супу верхний ракурс не навязывают — в нём есть что показать сбоку", () => {
    // Один и тот же рецепт с разными вариантами: ракурс обязан меняться.
    // Раньше тест брал РАЗНЫЕ slug, и совпадение чётности хэшей делало его
    // зелёным или красным случайно — проверял он при этом не то, что нужно.
    const angles = new Set(
      [0, 1, 2, 3].map(
        (variant) => pickScene({ slug: "kurinyy-sup", title: "Куриный суп", variant }).angle,
      ),
    );
    expect(angles).toEqual(new Set(["top-down", "three-quarter"]));
  });

  it("высокому блюду не дают строго верхний ракурс", () => {
    for (const variant of [0, 1, 2, 3, 4]) {
      const cakes = pickScene({ slug: `syrniki-${variant}`, title: "Сырники", variant });
      expect(["three-quarter", "close-side"], `variant ${variant}`).toContain(cakes.angle);
    }
  });

  it("супу и каше кладут ложку, остальному вилку", () => {
    expect(pickScene({ slug: "sup", title: "Суп", dishware: "deep-bowl" }).cutlery).toBe("spoon");
    expect(pickScene({ slug: "kasha", title: "Каша", dishware: "bowl" }).cutlery).toBe("spoon");
    expect(pickScene({ slug: "syrniki", title: "Сырники", dishware: "plate" }).cutlery).toBe("fork");
  });

  // Главное правило реквизита: на картинке не должно появиться то, чего в
  // рецепте нет. У нас на экране рецепта висит предупреждение про аллергены —
  // картинка не имеет права обещать другой состав.
  it("реквизит берётся только из ингредиентов рецепта", () => {
    const scene = pickScene({
      slug: "ryba",
      title: "Запечённая рыба",
      ingredients: ["филе трески", "лимон", "укроп"],
    });
    expect(scene.props.join(" ")).toMatch(/lemon|herbs/);
    expect(scene.props.join(" ")).not.toMatch(/tomato|apple|banana/);
  });

  it("«сыр» не цепляется к «сырникам» — тот же матчер по началу слова", () => {
    const scene = pickScene({
      slug: "syrniki",
      title: "Сырники",
      ingredients: ["творог", "яйцо", "мука"],
    });
    expect(scene.props.join(" ")).not.toContain("cheese");
  });

  it("нет подходящих продуктов — нет и реквизита", () => {
    const scene = pickScene({
      slug: "test",
      title: "Тесто",
      ingredients: ["мука", "разрыхлитель", "соль"],
    });
    expect(scene.props).toEqual([]);
  });

  it("поверхность и ракурс всегда из закрытых списков", () => {
    for (let i = 0; i < 40; i++) {
      const scene = pickScene({ slug: `dish-${i}`, title: `Блюдо ${i}`, variant: i });
      expect(SURFACES).toContain(scene.surface);
      expect(ANGLES).toContain(scene.angle);
    }
  });
});

describe("buildDishPrompt", () => {
  const scene: Scene = {
    surface: "dark-wood",
    angle: "close-side",
    cutlery: "fork",
    napkin: true,
    props: ["a wedge of fresh lemon"],
  };
  const base = { title: "Сырники со сметаной", ingredients: ["творог", "яйцо"] };

  it("подставляет название, ингредиенты, посуду и сцену", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "square", dishware: "plate", scene });
    expect(prompt).toContain("Сырники со сметаной");
    expect(prompt).toContain("творог, яйцо");
    expect(prompt).toContain("dinner plate");
    expect(prompt).toContain("walnut table");
    expect(prompt).toContain("close to table level");
    expect(prompt).toContain("a wedge of fresh lemon");
  });

  it("кадр: блюдо занимает большую часть, посуде можно выйти за край", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "portrait", dishware: "plate", scene });
    expect(prompt).toContain("about two thirds");
    expect(prompt).toContain("extend slightly beyond the edges");
    expect(prompt).toContain("tall photograph");
  });

  it("перечисляет реквизит закрытым списком — «ничего больше»", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "square", dishware: "plate", scene });
    expect(prompt).toContain("only these objects");
    expect(prompt).toContain("nothing else is on the surface");
  });

  it("неизменная часть одинакова при разных сценах — на этом держится серия", () => {
    const a = buildDishPrompt({ ...base, aspect: "square", dishware: "plate", scene });
    const b = buildDishPrompt({
      ...base,
      aspect: "square",
      dishware: "bowl",
      scene: { ...scene, surface: "linen", angle: "top-down", napkin: false, props: [] },
    });
    const tail = (s: string) => s.slice(s.indexOf("Always, in every photo of this series"));
    expect(tail(a).replace(/Square photo\.|Vertical photo:.*/g, "")).toBe(
      tail(b).replace(/Square photo\.|Vertical photo:.*/g, ""),
    );
  });

  it("запреты на месте: ни рук, ни людей, ни текста", () => {
    const prompt = buildDishPrompt({ ...base, aspect: "portrait", dishware: "bowl", scene });
    expect(prompt).toContain("no hands, no people");
    expect(prompt).toContain("No text");
  });
});
