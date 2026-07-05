"use client";

import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import DonateModal from "@/components/modals/DonateModal";
import { YANDEX_METRIKA_ID } from "@/components/YandexMetrika";

interface DonateButtonProps {
  variant?: "footer" | "inline";
}

export default function DonateButton({ variant = "inline" }: DonateButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = () => {
    // @ts-ignore
    if (typeof window !== "undefined" && window.ym) {
      // @ts-ignore
      window.ym(YANDEX_METRIKA_ID, "reachGoal", "donate_click");
    }
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
