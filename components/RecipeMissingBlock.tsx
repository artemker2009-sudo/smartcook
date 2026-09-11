"use client";

import { useState } from "react";
import { Check, ListPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { reachGoal } from "@/lib/metrika";
import { splitIngredientList } from "@/lib/recipeValidation";
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
 * ВАЖНО: блок Купера трогать нельзя (его текст, ссылка и пометка
 * зарегистрированы как рекламный креатив, ОРД) — поэтому здесь всё своё.
 */

// Имя списка, который создаём человеку без единого списка. Молча, без вопросов:
// на экране рецепта диалог «как назвать список» — лишний шаг ни о чём.
const FALLBACK_LIST_NAME = "Мой список";

export default function RecipeMissingBlock({
  missing,
  recipeTitle,
}: {
  missing?: string[] | string | null;
  recipeTitle?: string;
}) {
  // Старые записи иногда хранят весь список одной склеенной строкой — тот же
  // фолбэк, что и при записи в БД (баг AB), иначе тут был бы один гигантский чип.
  const names = splitIngredientList(missing);
  const [added, setAdded] = useState(false);

  // Всё нужное уже есть дома — это хорошая новость, а не пустое место.
  if (names.length === 0) {
    return (
      <div className="missing-none">
        <Check size={18} /> Всё есть дома 👍
      </div>
    );
  }

  const handleAdd = () => {
    const result = addNamesToDefaultList(names, {
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
        <ShoppingCart size={20} color="var(--color-accent)" /> Чего не хватает
      </div>

      <div className="missing-chips">
        {names.map((name, i) => (
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
          <ListPlus size={20} /> Чего не хватает → в Покупки
        </button>
      )}
    </div>
  );
}
