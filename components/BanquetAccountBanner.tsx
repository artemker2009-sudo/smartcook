"use client";

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { reachGoal } from "@/lib/metrika";

type Variant = "hub" | "creator" | "guest";

// creator и guest — это один баннер на странице банкета, поэтому делят ключ
// «свернуть». hub — отдельный, на странице списка.
const DISMISS_KEY: Record<Variant, string> = {
  hub: "sc_banquet_banner_hub",
  creator: "sc_banquet_banner_party",
  guest: "sc_banquet_banner_party",
};

const COPY: Record<Variant, { title: string; text: string }> = {
  hub: {
    title: "Сохраните свои банкеты",
    text: "Банкеты хранятся в этом браузере. Создайте аккаунт — имя и пароль, без email — чтобы они не потерялись и открывались с любого устройства.",
  },
  creator: {
    title: "Не потеряйте этот банкет",
    text: "Банкет привязан к этому браузеру. Создайте аккаунт: имя и пароль, без email, 30 секунд — и он будет доступен с любого устройства.",
  },
  guest: {
    title: "Вы участник этого банкета",
    text: "Чтобы он не потерялся и был доступен с любого устройства — создайте аккаунт: имя и пароль, без email, 30 секунд.",
  },
};

export default function BanquetAccountBanner({
  variant,
  onSignup,
}: {
  variant: Variant;
  onSignup: () => void;
}) {
  // null = ещё не прочитали localStorage (не мигаем баннером до гидрации).
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const key = DISMISS_KEY[variant];
  const isPartyPage = variant !== "hub";

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);

  if (dismissed === null) return null;

  const handleSignup = () => {
    reachGoal(variant === "guest" ? "banquet_guest_signup_prompt_click" : "banquet_signup_prompt_click");
    onSignup();
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* приватный режим — не критично */
    }
    setDismissed(true);
  };

  // Свёрнутое состояние: на странице списка — прячем полностью; на странице
  // банкета — оставляем компактную нераздражающую строку-напоминание.
  if (dismissed) {
    if (!isPartyPage) return null;
    return (
      <button
        type="button"
        onClick={handleSignup}
        className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        <UserPlus size={14} /> Создать аккаунт, чтобы не потерять банкет
      </button>
    );
  }

  const copy = COPY[variant];

  return (
    <div className="relative mb-5 overflow-hidden rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-5 shadow-[0_10px_30px_rgba(5,150,105,0.08)]">
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Скрыть"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-emerald-600 transition-colors hover:bg-white"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
          <UserPlus size={22} strokeWidth={2.4} />
        </span>
        <div>
          <h3 className="text-lg font-bold tracking-tight text-emerald-950">{copy.title}</h3>
          <p className="mt-1 text-sm leading-6 text-emerald-800/80">{copy.text}</p>
          <button
            type="button"
            onClick={handleSignup}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <UserPlus size={16} /> Создать аккаунт
          </button>
        </div>
      </div>
    </div>
  );
}
