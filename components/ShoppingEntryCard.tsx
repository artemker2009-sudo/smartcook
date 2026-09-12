"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingCart } from "lucide-react";
import { reachGoal } from "@/lib/metrika";
import { SHOPPING_CHANGED_EVENT } from "@/lib/shoppingList";
import { listProgress, loadLists } from "@/lib/shoppingLists";

// Сколько позиций показываем в превью карточки.
const PREVIEW_LIMIT = 3;
// Длинные названия («Уксус (бальзамический или яблочный)») в одной строке
// съедали место всех остальных позиций — подрезаем каждое по отдельности.
const PREVIEW_NAME_LENGTH = 18;

function shortName(name: string): string {
  return name.length > PREVIEW_NAME_LENGTH
    ? name.slice(0, PREVIEW_NAME_LENGTH - 1).trimEnd() + "…"
    : name;
}

type Preview = { id: string; name: string; items: string[]; left: number };

/**
 * Компактный вход в «Покупки» на Главной. Пришёл на смену крупной градиентной
 * карточке ShoppingFeatureCard (компонент остался в репозитории): Главная
 * теперь про одно обещание, а разделу достаточно строки-входа.
 *
 * Списки лежат в localStorage (lib/shoppingLists), то есть доступны только
 * после гидрации. Поэтому карточка ВСЕГДА рендерится одинаковой высоты
 * (.shopping-entry), а превью позиций появляется внутри неё вторым кадром —
 * SSR-разметка Главной не прыгает. Пустое состояние («Соберите список…») —
 * то же, что видит первый заход.
 */
export default function ShoppingEntryCard() {
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const read = () => {
      // Первый список с позициями: новые списки добавляются в начало массива
      // (createList), значит это самый свежий непустой.
      const list = loadLists().find((l) => l.items.length > 0);
      if (!list) {
        setPreview(null);
        return;
      }
      // В превью — некупленное (за ним человек и идёт), последнее добавленное
      // сверху. Если всё куплено, показываем последние позиции как есть.
      const pending = list.items.filter((it) => !it.checked);
      const source = pending.length > 0 ? pending : list.items;
      const { total, done } = listProgress(list);
      setPreview({
        id: list.id,
        name: list.name,
        items: source.slice(-PREVIEW_LIMIT).reverse().map((it) => shortName(it.name)),
        left: total - done,
      });
    };
    read();
    // Список могли поменять в другой вкладке или на самом экране покупок.
    window.addEventListener(SHOPPING_CHANGED_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(SHOPPING_CHANGED_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return (
    <Link
      // Ведём прямо в тот список, позиции которого показаны в превью: раздел
      // теперь «хаб → список», и лишний шаг через хаб здесь не нужен. Превью
      // ещё нет (первый кадр до гидрации, пустой раздел) — открываем хаб.
      href={preview ? `/shopping/${preview.id}` : "/shopping"}
      className="shopping-entry"
      onClick={() => reachGoal("shopping_feature_open")}
      aria-label="Открыть список покупок"
    >
      <span className="shopping-entry-icon" aria-hidden>
        <ShoppingCart size={22} />
      </span>
      <span className="shopping-entry-title">Мой список покупок</span>
      <span className="shopping-entry-action">
        {preview ? "Открыть" : ""}
        <ArrowRight size={16} aria-hidden />
      </span>
      {/* Вторая строка сетки — во всю ширину карточки: позициям нужна вся
          строка, иначе на 375px в неё влезает одно длинное название. */}
      <span className="shopping-entry-sub">
        {preview
          ? preview.items.join(" · ") + (preview.left > PREVIEW_LIMIT ? " и ещё…" : "")
          : "Соберите список — разложу его по отделам магазина"}
      </span>
    </Link>
  );
}
