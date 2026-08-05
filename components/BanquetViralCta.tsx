"use client";

import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

/**
 * Виральная петля банкетов. Гость, открывший чужой банкет, видит внизу меню
 * аккуратный блок-приглашение собрать свой банкет в SmartCook. Ведёт на главную
 * с меткой ?utm_source=banquet_guest; при клике отправляется цель Метрики
 * banquet_guest_cta (через безопасный reachGoal — аналитика не ломает переход).
 *
 * Блок стоит последним в меню и не участвует в основном сценарии гостя
 * (голосование за блюда, список покупок), поэтому ему не мешает.
 */
export default function BanquetViralCta() {
  return (
    <div className="overflow-hidden rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-5 text-center shadow-[0_10px_30px_rgba(5,150,105,0.08)]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
        <PartyPopper size={24} strokeWidth={2.2} />
      </span>
      <h3 className="mt-3 text-lg font-bold tracking-tight text-emerald-950">
        Это меню собрано в SmartCook за минуту
      </h3>
      <p className="mt-1 text-sm leading-6 text-emerald-800/80">
        Соберите свой банкет — бесплатно.
      </p>
      <Link
        href="/?utm_source=banquet_guest"
        onClick={() => reachGoal("banquet_guest_cta")}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        <PartyPopper size={16} /> Собрать свой банкет
      </Link>
    </div>
  );
}
