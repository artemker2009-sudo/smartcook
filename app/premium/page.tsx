import type { Metadata } from "next";
import PremiumPage from "@/components/premium/PremiumPage";
import NativeIosGuard from "@/components/premium/NativeIosGuard";
import { getFreePodborsPerWeek } from "@/lib/premiumSettings";
import { isRobokassaConfigured } from "@/lib/robokassaConfig";
import { FEATURE_PREMIUM } from "@/lib/features";

export const metadata: Metadata = {
  title: "Премиум — SmartCook",
  description:
    "Премиум SmartCook: подборы рецептов без недельного лимита. Год 169 ₽, навсегда 490 ₽. Без автоплатежей, оплата через Robokassa.",
  alternates: { canonical: "/premium" },
};

// Число бесплатных подборов читается из настройки, поэтому страница не может
// быть полностью статичной. 300 секунд — компромисс: настройку меняют раз в
// месяц, а робот Robokassa и поисковик получают готовый HTML без похода в базу.
export const revalidate = 300;

export default async function Premium() {
  const freePodbors = await getFreePodborsPerWeek();

  return (
    <NativeIosGuard>
      <PremiumPage
        freePodbors={freePodbors}
        nowIso={new Date().toISOString()}
        // Оплата живая только когда включён флаг И заведены ключи Robokassa.
        // Ключи проверяются ЗДЕСЬ, на сервере: браузеру про них знать неоткуда,
        // а кнопка должна отличать «ещё не включили» от настоящей ошибки.
        paymentReady={FEATURE_PREMIUM && isRobokassaConfigured()}
      />
    </NativeIosGuard>
  );
}
