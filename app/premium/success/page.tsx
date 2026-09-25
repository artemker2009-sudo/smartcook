import type { Metadata } from "next";
import { Suspense } from "react";
import NativeIosGuard from "@/components/premium/NativeIosGuard";
import { PremiumSuccessScreen } from "@/components/premium/PremiumResultScreen";

export const metadata: Metadata = {
  title: "Оплата принята — SmartCook",
  // Служебный экран возврата из платёжного сервиса: индексировать нечего.
  robots: { index: false, follow: false },
};

export default function PremiumSuccess() {
  return (
    <NativeIosGuard>
      {/* useSearchParams требует Suspense — иначе сборка падает на prerender. */}
      <Suspense fallback={null}>
        <PremiumSuccessScreen />
      </Suspense>
    </NativeIosGuard>
  );
}
