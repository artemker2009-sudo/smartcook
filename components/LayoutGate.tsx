"use client";

import { usePathname } from "next/navigation";

import Footer from "@/components/Footer";
import OnboardingModal from "@/components/modals/OnboardingModal";
import { isAdminRoute, isFooterHidden } from "@/lib/layoutGate";
import { SHOW_WELCOME } from "@/lib/features";

/**
 * Футер и онбординг, включаемые по маршруту — НА КЛИЕНТЕ.
 *
 * Раньше это условие считал серверный root-layout из заголовка x-pathname. У
 * такого решения было две беды, и обе закрывает этот компонент.
 *
 * 1. ОНО ЗАЛИПАЛО. root-layout не перерендеривается при переходе между своими
 *    детьми, поэтому при клиентской навигации значение оставалось от первой
 *    загруженной страницы. Таб-бар этим уже болел (PR #58) и лечился ровно так
 *    же — переносом гейта на usePathname. Футер и онбординг оставались с той же
 *    латентной болезнью, просто не такой заметной.
 *
 * 2. ОНО ДЕЛАЛО ВЕСЬ САЙТ ДИНАМИЧЕСКИМ. Вызов headers() в root-layout — это
 *    запрос к данным запроса, и Next.js обязан из-за него рендерить КАЖДУЮ
 *    страницу на сервере, по-настоящему, на каждый переход. Никакого
 *    статического рендера, никакого CDN — ответ всегда приходил с
 *    `cache-control: private, no-store` и `x-vercel-cache: MISS`.
 *    Из-за одной строки в layout секунду ждали все разделы, включая «Покупки»,
 *    которым от сервера не нужно вообще ничего: их данные лежат в localStorage.
 *
 * Компонент монтируется ПОСЛЕ {children} — чтобы футер остался там же в потоке
 * документа, где и был.
 */
export default function LayoutGate() {
  const pathname = usePathname() || "/";

  return (
    <>
      {!isFooterHidden(pathname) && <Footer />}
      {SHOW_WELCOME && !isAdminRoute(pathname) && <OnboardingModal />}
    </>
  );
}
