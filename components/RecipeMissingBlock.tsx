"use client";

import { useState } from "react";
import { Check, ListPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { reachGoal } from "@/lib/metrika";
import { computeMissing } from "@/lib/missingProducts";
import { addNamesToDefaultList } from "@/lib/shoppingLists";

/**
 * «Чего не хватает» на экране рецепта: сами недостающие продукты + кнопка,
 * которая кладёт их в список покупок.
 *
 * Поле missing_ingredients модель заполняла всегда, и в БД оно лежало — но на
 * экране его не было ВООБЩЕ. Единственной связью рецепта с разделом «Покупки»
 * была кнопка внутри рекламного блока Купера, причём она кладёт ВЕСЬ список
 * ингредиентов, а не недостающие. Этот блок — своя, не рекламная точка входа.
 *
 * Недостающее СЧИТАЕТСЯ, а не берётся из ответа модели: в режиме «строго из
 * этого» модель честно возвращает пустой список «докупить», и экран из-за
 * этого писал «Всё есть дома» там, где дома не было половины рецепта
 * (на проде — треть всех рецептов). Логика в lib/missingProducts.ts.
 *
 * ВАЖНО: блок Купера трогать нельзя (его текст, ссылка и пометка
 * зарегистрированы как рекламный креатив, ОРД) — поэтому здесь всё своё.
 */

// Имя списка, который создаём человеку без единого списка. Молча, без вопросов:
// на экране рецепта диалог «как назвать список» — лишний шаг ни о чём.
const FALLBACK_LIST_NAME = "Мой список";

export default function RecipeMissingBlock({
  detailed,
  known,
  modelMissing,
  recipeTitle,
}: {
  detailed?: { name?: string }[] | null;
  /** Продукты, которые у человека есть: с фото или перечисленные руками. */
  known?: string[] | null;
  modelMissing?: string[] | string | null;
  recipeTitle?: string;
}) {
  const { items, comparable } = computeMissing({ detailed, known, modelMissing });
  const [added, setAdded] = useState(false);

  // Всё нужное уже есть дома — это хорошая новость, а не пустое место. Но
  // говорим так ТОЛЬКО когда знаем, что у человека есть: у рецепта из истории
  // или по ссылке сравнивать не с чем, и там мы молчим, а не выдумываем.
  if (items.length === 0) {
    if (!comparable) return null;
    return (
      <div className="missing-none">
        <Check size={18} /> Всё есть дома 👍
      </div>
    );
  }

  const handleAdd = () => {
    const result = addNamesToDefaultList(items, {
      source: recipeTitle,
      fallbackListName: FALLBACK_LIST_NAME,
    });

    if (result.added === 0 && result.limited) {
      toast.error("Список покупок полон");
      return;
    }

    reachGoal("recipe_missing_add", { count: result.added });
    setAdded(true);
    toast.success(
      result.added > 0
        ? `Добавлено в «${result.listName}»: ${result.added}`
        : "Всё это уже в списке покупок",
    );
  };

  const openShopping = () => {
    reachGoal("recipe_missing_open_shopping");
    window.location.href = "/shopping";
  };

  return (
    <div className="missing-box">
      <div className="missing-title">
        <ShoppingCart size={20} color="var(--color-accent)" />{" "}
        {comparable ? "Чего не хватает" : "Что нужно купить"}
      </div>

      <div className="missing-chips">
        {items.map((name, i) => (
          <span key={name + i} className="missing-chip">
            {name}
          </span>
        ))}
      </div>

      {added ? (
        <button type="button" className="missing-btn missing-btn-done" onClick={openShopping}>
          <Check size={20} /> Добавлено · Открыть Покупки
        </button>
      ) : (
        <button type="button" className="missing-btn" onClick={handleAdd}>
          <ListPlus size={20} />{" "}
          {comparable ? "Чего не хватает → в Покупки" : "Что нужно купить → в Покупки"}
        </button>
      )}
    </div>
  );
}
