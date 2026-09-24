"use client";

// Серая строка «На этой неделе осталось N подборов» под кнопками фото и поиска.
//
// Показывается ТОЛЬКО когда есть что сказать:
//   * флаг Премиума включён;
//   * у человека нет Премиума (у него лимита нет вовсе);
//   * счётчик посчитался (сбой подсчёта → молчим, а не врём «осталось 0»);
//   * остаток МЕНЬШЕ лимита, то есть человек уже что-то потратил на этой
//     неделе. Нетронутый лимит подписывать незачем — это просто шум на экране
//     у того, кто ещё ничего не сделал.
//
// В iOS строка остаётся: это счётчик, а не призыв к оплате — правило 3.1.1 не
// про него (SPEC 1).

import { pluralPodbor } from "@/lib/premiumPeriod";
import type { PremiumStatus } from "@/components/premium/usePremiumStatus";

export default function PodborsLeft({ status }: { status: PremiumStatus | null }) {
  if (!status || !status.featureEnabled || status.isPremium) return null;
  if (status.remaining === null) return null;
  if (status.remaining >= status.freePodborsPerWeek) return null;

  return (
    <p
      style={{
        margin: "var(--space-2) 0 0 0",
        textAlign: "center",
        fontSize: "var(--font-size-caption)",
        lineHeight: 1.4,
        color: "var(--color-text-muted)",
      }}
    >
      На этой неделе {status.remaining === 0 ? "не осталось подборов" : `осталось ${status.remaining} ${pluralPodbor(status.remaining)}`}
    </p>
  );
}
