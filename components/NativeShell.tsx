"use client";

import { useEffect } from "react";
import { isNativePlatform, isNativeIOS, hideSplash, initStatusBar } from "@/lib/native";

// Инициализация нативной оболочки. Монтируется в root-layout и в ВЕБЕ не делает
// ровно ничего: весь код внутри `if (isNativePlatform())`, а плагины Capacitor
// подгружаются динамически уже оттуда. Ни одного нового байта в веб-бандл.
//
// Что делает в нативе:
//   1. Ставит на <html> классы native-shell / native-ios — под них написаны
//      стили в globals.css (safe-area, отключение резинки и long-press).
//   2. Дописывает viewport-fit=cover в мета-вьюпорт. ТОЛЬКО здесь: добавь мы это
//      в next-конфиг viewport, изменилась бы и веб-версия (env(safe-area-*)
//      начали бы отдавать ненулевые значения в мобильной Safari).
//   3. Прячет стартовый экран, когда сайт уже отрисован.
//   4. Настраивает статус-бар под светлый фон приложения.
export default function NativeShell() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    const root = document.documentElement;
    root.classList.add("native-shell");
    if (isNativeIOS()) root.classList.add("native-ios");

    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      const content = meta.getAttribute("content") || "";
      if (!content.includes("viewport-fit")) {
        meta.setAttribute("content", `${content}, viewport-fit=cover`);
      }
    }

    void initStatusBar();
    // Сплэш убираем на следующем кадре — к этому моменту первый экран уже
    // нарисован, поэтому перехода «сплэш → белое полотно» не видно.
    const raf = requestAnimationFrame(() => {
      void hideSplash();
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
