"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

export const YANDEX_METRIKA_ID = 107027665;

export default function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Этот код срабатывает при переходе по страницам, чтобы Метрика видела смену URL
    // в одностраничных приложениях (SPA)
    const url = `${pathname}?${searchParams}`;
    // @ts-ignore
    if (typeof window !== "undefined" && window.ym) {
      // @ts-ignore
      window.ym(YANDEX_METRIKA_ID, "hit", url);
    }
  }, [pathname, searchParams]);

  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {`
        (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
        (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

        ym(${YANDEX_METRIKA_ID}, "init", {
             clickmap:true,
             trackLinks:true,
             accurateTrackBounce:true,
             webvisor:true
        });
      `}
    </Script>
  );
}