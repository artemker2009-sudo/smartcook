"use client";

import { ListPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { KUPER_CPA_URL, KUPER_AD_LABEL } from "@/lib/constants";
import { reachGoal } from "@/lib/metrika";
import { copyText } from "@/lib/clipboard";
import { addNamesToStorage } from "@/lib/shoppingList";

/**
 * Монетизация: CPA-партнёрка «Купер» (доставка продуктов). Показывается на
 * экране рецепта ПОД списком ингредиентов и ТОЛЬКО когда список есть (гейт у
 * вызывающих компонентов + внутренний ранний return).
 *
 * Купер не принимает готовый список позиций по ссылке — поэтому UX такой:
 * тап по чипу ингредиента копирует его название в буфер, показывает тост
 * «„…" скопирован — вставьте в поиск Купера» и открывает витрину Купера в
 * новой вкладке. Пользователю остаётся вставить (Ctrl/⌘+V) в поиск Купера.
 * Кнопка «Заказать в Купере» внизу — для тех, кому нужен весь список сразу.
 *
 * ВАЖНО (ОРД / закон о рекламе):
 * - KUPER_CPA_URL менять НЕЛЬЗЯ — в ней трекинг партнёрки и erid (маркировка);
 * - текст «Нужно купить: закажите продукты…» дословно зарегистрирован как
 *   креатив, заголовок и текст не менять;
 * - под блоком обязательна видимая пометка KUPER_AD_LABEL.
 *
 * Цель Метрики ingredient_buy_click шлётся при тапе по чипу и по кнопке.
 */
export default function KuperBuyBlock({ ingredients }: { ingredients: string[] }) {
  const names = (ingredients || []).map((n) => (n || "").trim()).filter(Boolean);
  if (names.length === 0) return null;

  // Тап по чипу: копируем название, показываем тост, шлём цель. Переход на
  // Купер выполняет НАТИВНЫЙ клик по ссылке (target=_blank) — не отменяем
  // событие, иначе мобильные блокировщики попапов не откроют новую вкладку.
  const handleChip = (name: string) => {
    reachGoal("ingredient_buy_click", { ingredient: name });
    // fire-and-forget: старт копирования внутри жеста, ждать не нужно.
    void copyText(name);
    toast(`«${name}» скопирован — вставьте в поиск Купера`);
  };

  // «В список покупок»: добавляет все ингредиенты рецепта в локальный список
  // покупок (localStorage) с дедупликацией по названию. Список читает раздел
  // /shopping. Цель Метрики — как у ручного добавления позиции.
  const handleAddToList = () => {
    const result = addNamesToStorage(names);
    reachGoal("shopping_item_added", { source: "recipe" });
    if (result.added > 0) {
      toast.success(`Добавлено в список покупок: ${result.added}`, {
        action: { label: "Открыть", onClick: () => (window.location.href = "/shopping") },
      });
    } else if (result.limited) {
      toast.error("Список покупок полон");
    } else {
      toast("Всё это уже в списке покупок");
    }
  };

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        margin: "var(--space-4) 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--color-text)",
        }}
      >
        <ShoppingCart size={20} color="var(--color-accent)" /> Нужно купить
      </div>
      <p
        style={{
          margin: "0 0 var(--space-3) 0",
          fontSize: "var(--font-size-body)",
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        Нужно купить: закажите продукты для рецепта с доставкой в Купере
      </p>

      {/* Чипы по каждому ингредиенту: тап → копирование + тост + Купер. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          marginBottom: "var(--space-3)",
        }}
      >
        {names.map((name, idx) => (
          <a
            key={idx}
            href={KUPER_CPA_URL}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => handleChip(name)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
              background: "var(--color-bg)",
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-full)",
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-medium)",
              color: "var(--color-text)",
              textDecoration: "none",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            {name}
          </a>
        ))}
      </div>

      {/* «В список покупок» — добавляет все ингредиенты в раздел /shopping. */}
      <button
        type="button"
        onClick={handleAddToList}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "var(--space-3) var(--space-4)",
          marginBottom: "var(--space-2)",
          background: "var(--color-accent-subtle)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          cursor: "pointer",
        }}
      >
        <ListPlus size={20} /> В список покупок
      </button>

      {/* Кнопка «весь список сразу» — последним элементом после чипов. */}
      <a
        href={KUPER_CPA_URL}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => reachGoal("ingredient_buy_click")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          width: "100%",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--color-surface)",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--font-size-body)",
          fontWeight: "var(--font-weight-semibold)",
          textDecoration: "none",
        }}
      >
        Заказать в Купере
      </a>

      {/* Обязательная маркировка рекламы (erid в ссылке) — мелко, серым, но видимо. */}
      <div
        style={{
          marginTop: "var(--space-2)",
          fontSize: "var(--font-size-caption)",
          color: "var(--color-text-muted)",
          lineHeight: 1.4,
        }}
      >
        {KUPER_AD_LABEL}
      </div>
    </div>
  );
}
