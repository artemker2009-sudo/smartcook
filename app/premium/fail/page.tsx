import type { Metadata } from "next";
import NativeIosGuard from "@/components/premium/NativeIosGuard";
import { PremiumFailScreen } from "@/components/premium/PremiumResultScreen";

export const metadata: Metadata = {
  title: "Оплата не прошла — SmartCook",
  robots: { index: false, follow: false },
};

export default function PremiumFail() {
  return (
    <NativeIosGuard>
      <PremiumFailScreen />
    </NativeIosGuard>
  );
}
