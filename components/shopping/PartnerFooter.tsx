"use client";

import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";

import { KUPER_AD_LABEL, KUPER_CPA_URL } from "@/lib/constants";
import { copyText } from "@/lib/clipboard";
import { isNativePlatform, openExternal } from "@/lib/native";
import { reachGoal } from "@/lib/metrika";
import { namesToBuyText } from "@/lib/shoppingList";

type Props = {
  items: Array<{ name: string; checked: boolean }>;
};

/**
 * Партнёрский блок под купленным. Одна копия на оба списка — раньше он стоял
 * двумя одинаковыми кусками в ShoppingListView и SharedShoppingListView.
 *
 * Текст кнопки, KUPER_CPA_URL (с erid) и KUPER_AD_LABEL перенесены БЕЗ
 * изменений: это данные ОРД, править их без новых данных нельзя.
 */
export default function PartnerFooter({ items }: Props) {
  // «Заказать всё в Купере». Купер не умеет принимать список позиций по ссылке,
  // поэтому перед переходом кладём в буфер то, что осталось купить, и говорим
  // об этом вслух — тот же приём работает на экране рецепта.
  //
  // Переход выполняет НАТИВНЫЙ клик по ссылке (target=_blank): событие не
  // отменяем и ничего не ждём, иначе мобильные блокировщики попапов не откроют
  // новую вкладку. copyText — fire-and-forget внутри жеста.
  const handleKuper = () => {
    reachGoal("shopping_kuper_click");
    const text = namesToBuyText(items);
    if (!text) return;
    void copyText(text);
    toast("Список скопирован — вставьте в поиск Купера");
  };

  return (
    <div className="sh-partner">
      <a
        href={KUPER_CPA_URL}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="sh-partner-btn"
        onClick={(e) => {
          handleKuper();
          // В нативной оболочке партнёрская ссылка уходит в СИСТЕМНЫЙ браузер,
          // а не внутрь WebView: «браузер внутри приложения» — прямая претензия
          // App Store 4.2, и точно так же уже сделано в RecipeMissingBlock.
          // Цель метрики и копирование списка к этому моменту отработали.
          // В вебе ветка не выполняется — обычная новая вкладка.
          if (isNativePlatform()) {
            e.preventDefault();
            void openExternal(KUPER_CPA_URL);
          }
        }}
      >
        <ShoppingCart size={22} /> Заказать всё в Купере
      </a>
      <div className="sh-partner-label">{KUPER_AD_LABEL}</div>
    </div>
  );
}
