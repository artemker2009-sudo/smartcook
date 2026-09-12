"use client";

import { useState } from "react";
import { Check, ListPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { KUPER_CPA_URL, KUPER_AD_LABEL, KUPER_AD_COPY } from "@/lib/constants";
import { isNativePlatform, openExternal } from "@/lib/native";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { computeMissing } from "@/lib/missingProducts";
import { addNamesToDefaultList } from "@/lib/shoppingLists";

/**
 * «Что нужно купить» на экране рецепта: ОДИН блок вместо двух.
 *
 * Раньше под ингредиентами стояли подряд два блока про одно и то же: свой
 * «Чего не хватает» (недостающее → в Покупки) и рекламный «Нужно купить»
 * (Купер, но со ВСЕМ списком ингредиентов). Человек видел две пачки чипов с
 * разным содержимым и три кнопки. Теперь блок один: один список продуктов
 * (недостающее) и два действия над ним — своё и рекламное.
 *
 * Недостающее СЧИТАЕТСЯ, а не берётся из ответа модели: в режиме «строго из
 * этого» модель честно возвращает пустой список «докупить», и экран из-за
 * этого писал «Всё есть дома» там, где дома не было половины рецепта
 * (на проде — треть всех рецептов). Логика в lib/missingProducts.ts, она же
 * выкидывает кладовку (соль, вода, масло) — за ней никого не гоняем в магазин.
 *
 * ТРИ СОСТОЯНИЯ блока, и они зависят от того, знаем ли мы продукты человека:
 * - знаем и чего-то не хватает → «Не хватает N из M» + чипы + серой строкой
 *   «Уже есть у вас: лук, морковь» — человек видит, что вычли не наугад;
 * - знаем и всё сошлось → «Всё есть дома 👍», без кнопок и без рекламы;
 * - не знаем (рецепт по названию, из истории, по ссылке, рецепт дня) →
 *   «Что нужно купить» БЕЗ счётчика и без строки «уже есть»: в списке весь
 *   рецепт минус кладовка, и сравнивать его не с чем.
 *
 * ВАЖНО (ОРД / закон о рекламе) — рекламная часть здесь только одна, кнопка
 * «Заказать в Купере»:
 * - KUPER_CPA_URL менять НЕЛЬЗЯ — в ней трекинг партнёрки и erid (маркировка);
 * - KUPER_AD_COPY («Нужно купить: закажите продукты…») дословно зарегистрирован
 *   как креатив — текст не менять;
 * - KUPER_AD_LABEL обязателен и стоит сразу под кнопкой Купера.
 * Кнопка и маркировка идут ВМЕСТЕ и показываются всегда, когда список
 * непустой, — в том числе на рецепте по названию, где раньше блока не было
 * вовсе и placement пропадал. Пустой список — ни кнопки, ни креатива, ни
 * маркировки: реклама без предложения не нужна. Чипы при этом НЕ рекламные
 * (раньше тап по чипу уводил на Купер) — это просто список продуктов.
 *
 * Цели Метрики оставлены как были, чтобы не рвать ряды:
 * recipe_missing_add — своя кнопка, ingredient_buy_click — кнопка Купера.
 */

// Имя списка, который создаём человеку без единого списка. Молча, без вопросов:
// на экране рецепта диалог «как назвать список» — лишний шаг ни о чём.
const FALLBACK_LIST_NAME = "Мой список";

// «Лук» с фото и «лук» из рецепта — одно слово; в бегущей строке «Уже есть у
// вас: …» заглавные посреди перечисления читаются как опечатка.
function lower(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

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
  const { items, have, total, comparable } = computeMissing({ detailed, known, modelMissing });
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

  // Кнопка Купера. Купер не принимает готовый список позиций по ссылке, поэтому
  // deeplink один (витрина), а продукты уезжают через буфер: копируем НЕДОСТАЮЩЕЕ
  // (раньше копировался весь список рецепта, включая то, что уже есть дома) и
  // говорим человеку, что вставить в поиск. Переход выполняет НАТИВНЫЙ клик по
  // ссылке — событие не отменяем, иначе мобильные блокировщики попапов не
  // откроют новую вкладку.
  const handleKuper = () => {
    reachGoal("ingredient_buy_click");
    // fire-and-forget: старт копирования внутри жеста, ждать не нужно.
    void copyText(items.join("\n"));
    toast(
      items.length === 1
        ? `«${items[0]}» скопирован — вставьте в поиск Купера`
        : "Список скопирован — вставьте в поиск Купера",
    );
  };

  return (
    <div className="missing-box">
      <div className="missing-title">
        <ShoppingCart size={20} color="var(--color-accent)" />{" "}
        {comparable ? `Не хватает ${items.length} из ${total}` : "Что нужно купить"}
      </div>

      <div className="missing-chips">
        {items.map((name, i) => (
          <span key={name + i} className="missing-chip">
            {name}
          </span>
        ))}
      </div>

      {/* Что вычли. Без этой строки счётчик «3 из 7» выглядит как ошибка:
          человек не видит, куда делись остальные четыре. */}
      {have.length > 0 && (
        <p className="missing-have">Уже есть у вас: {have.map(lower).join(", ")}</p>
      )}

      {added ? (
        <button type="button" className="missing-btn missing-btn-done" onClick={openShopping}>
          <Check size={20} /> Добавлено · Открыть Покупки
        </button>
      ) : (
        <button type="button" className="missing-btn" onClick={handleAdd}>
          <ListPlus size={20} /> В список покупок
        </button>
      )}

      {/* Рекламная часть блока: зарегистрированный текст креатива, кнопка с
          партнёрской ссылкой (erid) и обязательная маркировка под ней. */}
      <p className="missing-ad-copy">{KUPER_AD_COPY}</p>

      <a
        className="missing-btn missing-btn-secondary"
        href={KUPER_CPA_URL}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={(e) => {
          handleKuper();
          // В нативе партнёрская ссылка уходит в СИСТЕМНЫЙ браузер, а не внутрь
          // WebView: «браузер внутри приложения» — прямая претензия по 4.2.
          // Цель метрики из handleKuper при этом уже отправлена.
          if (isNativePlatform()) {
            e.preventDefault();
            void openExternal(KUPER_CPA_URL);
          }
        }}
      >
        Заказать в Купере
      </a>

      <div className="missing-ad-label">{KUPER_AD_LABEL}</div>
    </div>
  );
}
