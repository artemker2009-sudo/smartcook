"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import SuggestSheet from "@/components/SuggestSheet";
import DonateButton from "@/components/DonateButton";

// Карточка обратной связи — последний блок Главной, прямо перед футером.
// Рядом с «Предложить» стоит существующая кнопка «Поддержать проект»: она сама
// решает, показываться ли (в нативном iOS — нет, App Store 3.1.1), поэтому
// никакого условия здесь не нужно, а вёрстка переживает её отсутствие —
// «Предложить» просто остаётся одна в ряду.
export default function SuggestCard() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="suggest-card">
        <div className="suggest-card-icon" aria-hidden>
          <Lightbulb size={22} />
        </div>
        <h2 className="suggest-card-title">Что добавить, а что убрать?</h2>
        <p className="suggest-card-sub">Расскажите — я читаю каждое сообщение.</p>
        <div className="suggest-card-actions">
          <button type="button" className="btn-primary suggest-card-cta" onClick={() => setOpen(true)}>
            Предложить
          </button>
          <DonateButton variant="inline" />
        </div>
      </section>

      <SuggestSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
