"use client";

import { toast } from "sonner";

import { copyText } from "@/lib/clipboard";
import { reachGoal } from "@/lib/metrika";
import { itemsToText, type ShoppingItem } from "@/lib/shoppingList";
import { buildShareUrl, canShareByLink } from "@/lib/shoppingShare";
import { siteUrl } from "@/lib/site";

// Способы отдать список — общие для хаба и экрана списка. Раньше жили внутри
// ShoppingListRoute; меню «⋯» переехало на карточки хаба, и копия этих функций
// там неминуемо разошлась бы с оригиналом.
//
// Вызывать строго из обработчика тапа: и системное окно «Поделиться», и буфер
// обмена требуют пользовательского жеста.

type NavigatorWithShare = Navigator & { share?: (d: ShareData) => Promise<void> };

/**
 * «Отправить копию»: весь список укладывается в ссылку, и получатель заводит
 * СВОЮ копию — дальше два списка живут независимо. Живой сценарий — только
 * «Позвать в общий список», поэтому тексты разведены.
 *
 * "too-big" — список не влезает в ссылку, вызывающий предложит текст.
 */
export async function shareListCopy(name: string, itemNames: string[]): Promise<"ok" | "too-big"> {
  reachGoal("shopping_share_click");
  if (!canShareByLink(itemNames.length)) return "too-big";

  const url = buildShareUrl(name, itemNames);
  const nav = typeof navigator !== "undefined" ? (navigator as NavigatorWithShare) : null;
  if (nav?.share) {
    try {
      await nav.share({ title: name, text: `Список покупок: ${name}`, url });
      return "ok";
    } catch {
      // Отменили системное окно или его нет — падаем в копирование.
    }
  }
  const ok = await copyText(url);
  toast(ok ? "Ссылка скопирована. Друг получит копию списка — изменения не синхронизируются" : "Не удалось скопировать ссылку");
  return "ok";
}

/**
 * Ссылка-приглашение в ОБЩИЙ список (/shopping/join/<id>): открывший становится
 * участником, отметки видят все. true — ссылка ушла (окно или буфер).
 */
export async function shareInviteLink(id: string, listName: string): Promise<boolean> {
  const url = siteUrl(`/shopping/join/${id}`);
  reachGoal("shopping_shared_invite_click");
  const nav = navigator as NavigatorWithShare;
  if (nav.share) {
    try {
      await nav.share({ title: listName, text: `Общий список покупок: ${listName}`, url });
      return true;
    } catch {
      // Отменили системное окно — падаем в копирование.
    }
  }
  const ok = await copyText(url);
  toast(ok ? "Ссылка скопирована. Список общий — галочки видны всем" : "Не удалось скопировать ссылку");
  return ok;
}

/** «Скопировать текстом». */
export async function copyItemsAsText(items: Pick<ShoppingItem, "id" | "name" | "checked">[], title?: string): Promise<void> {
  const body = itemsToText(items);
  const ok = await copyText(title ? `${title}\n${body}` : body);
  toast(ok ? "Список скопирован" : "Не удалось скопировать");
}
