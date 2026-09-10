"use client";

import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import DonateModal from "@/components/modals/DonateModal";
import { reachGoal } from "@/lib/metrika";
import { useInstallEnv } from "@/lib/installEnv";

interface DonateButtonProps {
  variant?: "footer" | "inline";
}

export default function DonateButton({ variant = "inline" }: DonateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  // App Store 3.1.1: сбор донатов в пользу разработчика вне IAP запрещён.
  // В нативном iOS кнопку прячем целиком. В вебе и Android-TWA — без изменений.
  //
  // Среда берётся из единого детектора (lib/installEnv), а не из старого
  // useIsNativeIOS: формула определения среды должна быть ОДНА на все ветки,
  // иначе они снова разъедутся (ради этого и делался PR #99).
  //
  // Прячем и при "unknown" — это сервер и кадр гидрации, где среда ещё не
  // известна. Иначе в нативном iOS кнопка успевала бы мигнуть на один кадр до
  // того, как Capacitor будет опрошен, а мигающий донат в iOS-сборке — ровно
  // то, за что 3.1.1 и прилетает. Цена ошибки в другую сторону — кнопка в вебе
  // появляется кадром позже, чего человек не замечает.
  const env = useInstallEnv();
  if (env === "native-ios" || env === "unknown") return null;

  const handleClick = () => {
    // Через общий хелпер (lib/metrika): он сам переживает отсутствующий счётчик
    // и не тащит за собой @ts-ignore на каждый вызов.
    reachGoal("donate_click");
    setIsOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={variant === "footer" ? "btn-donate btn-donate-footer" : "btn-donate btn-donate-inline"}
      >
        <HeartHandshake size={16} />
        Поддержать проект
      </button>
      <DonateModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
