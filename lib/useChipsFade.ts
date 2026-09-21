"use client";

import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { chipsFadeVisible } from "./chipsFade";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Показывать ли затухание у строки чипов. Пересчёт — при смене ширины строки
 * (поворот, ресайз), при прокрутке и после каждого рендера: набор чипов
 * меняется без ресайза самой строки («Подходит мне» появляется после чтения
 * профиля вкуса).
 */
export function useChipsFade(ref: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el) setVisible(chipsFadeVisible(el));
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setVisible(chipsFadeVisible(el));
    el.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref]);

  return visible;
}
