import type { CapacitorConfig } from "@capacitor/cli";

// Нативная оболочка iOS для SmartCook.
//
// Гибрид, а не статический бандл: WebView грузит БОЕВОЙ сайт (server.url), как и
// Android-TWA. Статический экспорт невозможен — у Next.js здесь SSR и серверные
// роуты (/api/*), без них не работает ни распознавание фото, ни лента, ни списки.
//
// В webDir лежит ровно одна вещь — офлайн-экран. Он попадает в бандл приложения и
// показывается, когда сайт не открылся (server.errorPath): без него WKWebView
// рисует белый экран с системной ошибкой, а это гарантированный реджект по
// App Store 2.1 (ревьюеры проверяют в Airplane Mode).
const config: CapacitorConfig = {
  // ВНИМАНИЕ: это НЕ тот bundle id, с которым приложение уходит в App Store.
  //
  // Настоящий bundle id — pro.smart-cook.app (правильный reverse-DNS от домена
  // smart-cook.pro), он задан в Xcode как PRODUCT_BUNDLE_IDENTIFIER и именно он
  // регистрируется в App Store Connect.
  //
  // Здесь дефиса нет намеренно: CLI Capacitor валидирует appId по правилам
  // Java-пакета (ради Android) и с дефисом отказывается выполнять не только
  // `cap add`, но и любой `cap sync`/`cap copy`. Это поле используется только
  // при генерации платформы, на собранное приложение оно не влияет.
  // Менять bundle id — в Xcode (или в ios/App/App.xcodeproj/project.pbxproj).
  appId: "pro.smartcook.app",
  appName: "SmartCook",
  webDir: "capacitor-www",

  server: {
    // Боевой адрес. Для проверки сборки на превью-деплое (там уже есть новый
    // нативный слой, а в проде его ещё нет) достаточно собрать с переменной:
    //   CAP_SERVER_URL=https://<preview>.vercel.app npx cap sync ios
    // В коммит уходит всегда прод — переменная только для локальной проверки.
    //
    // ЭТОТ АДРЕС НАМЕРЕННО ОСТАЁТСЯ НА СТАРОМ ДОМЕНЕ. НЕ «ПРИВОДИТЬ К ПОРЯДКУ».
    //
    // Основной домен сайта — smartcook.pro (lib/site.ts), и выглядит логично
    // подтянуть сюда его же. Делать этого нельзя: server.url — это ORIGIN
    // WebView, а Web Storage в WKWebView живёт строго по origin. smartcook.pro
    // и smart-cook.pro — разные origin, у нового хранилище ПУСТОЕ, и старое из
    // него не видно. Что пропадёт у всех, кто просто обновит приложение:
    //   • smartcook_shopping_lists_v2 — ВСЕ личные списки покупок. У них нет
    //     БД вообще (см. шапку lib/shoppingLists.ts), это единственная копия;
    //   • cook_user_id — анонимная личность, под которой в Supabase лежат
    //     рецепты и избранное (components/SearchApp.tsx). Ключ потерян —
    //     история осталась в БД осиротевшей, доступа к ней больше нет;
    //   • smartcook_shared_shopping_lists_v1 + smartcook_shared_member_* —
    //     указатель на общие семейные списки. Сами списки в БД, но найти их
    //     заново можно только по исходной ссылке-приглашению;
    //   • sb-<ref>-auth-token — сессия (lib/supabase.ts, persistSession в
    //     localStorage). Все залогиненные увидят экран входа после обновления;
    //   • sc_allergies / sc_dislikes у анонима, прогресс игры, флаги онбординга.
    // Плюс httpOnly-cookie sc_guest — она тоже привязана к домену.
    //
    // Старый домен работает НАВСЕГДА и без редиректа — это зафиксировано в
    // lib/site.ts (LEGACY_SITE_HOST) и в proxy.ts, он остаётся «настоящим»
    // хостом с боевым robots.txt и разрешённым Origin для API. Поэтому держать
    // здесь smart-cook.pro бессрочно ничего не стоит, а канонический адрес,
    // share-ссылки, SEO и вебмастеры и так живут на smartcook.pro.
    //
    // Двигать origin можно ТОЛЬКО вместе с одноразовым мостом-хэндофом
    // (страница на старом домене отдаёт свой localStorage на новый через
    // фрагмент URL, с жёстким allowlist получателя) — иначе это потеря данных
    // пользователей. Выгода при этом косметическая, цена — чужие списки.
    url: process.env.CAP_SERVER_URL || "https://smart-cook.pro",
    // hostname здесь НЕ задаём. Он предназначен для режима с локальным бандлом
    // (когда Capacitor сам раздаёт файлы) и при удалённом server.url ломает
    // разрешение относительных путей: запросы за /_next/static/... уходили на
    // чужой origin, и приложение открывалось вообще без стилей.
    // Origin и куки при удалённом адресе и так берутся с самого сайта.
    androidScheme: "https",
    iosScheme: "https",
    // Локальная страница из бандла на случай, когда сайт недоступен.
    errorPath: "offline.html",
    // Куда WebView может уходить, НЕ передавая ссылку системному браузеру.
    //
    // Без этого списка приёмка поймала неприятное: офлайн-экран лежит в бандле
    // (схема capacitor://), и переход с него на https://smart-cook.pro Capacitor
    // считал уходом на сторонний адрес — кнопка «Повторить» открывала сайт в
    // Safari, с адресной строкой, вместо возврата в приложение.
    //
    // Список намеренно узкий: только наши домены. Всё остальное (Kuper, Telegram,
    // RuStore) по-прежнему обязано уходить наружу — этим занимается openExternal
    // в lib/native.ts, и подменять это поведение здесь нельзя.
    //
    // smartcook.pro — основной домен: на него ведут share-ссылки (lib/site.ts),
    // и тап по такой ссылке внутри приложения не должен выкидывать в Safari.
    // server.url при этом остаётся на smart-cook.pro: старый домен работает
    // навсегда, а на нём у установивших приложение лежат сессия и localStorage.
    allowNavigation: ["smart-cook.pro", "www.smart-cook.pro", "smartcook.pro", "www.smartcook.pro"],
  },

  ios: {
    // Фон под WebView в цвет фирменного полотна (--color-bg сайта): пока идёт
    // первый рендер, не мигает белым/чёрным.
    backgroundColor: "#faf9f7",
    // Ссылки вида target="_blank" не открываем во встроенном окне: внешние
    // адреса уходят в системный браузер через lib/native.ts (openExternal).
    limitsNavigationsToAppBoundDomains: false,
    // Резинка/оттяжка у краёв — признак «это браузер». Выключаем.
    scrollEnabled: true,
    contentInset: "never",
  },

  plugins: {
    SplashScreen: {
      // Прячем из JS, как только сайт отрисовался (lib/native.ts → hideSplash).
      // Но НЕ полагаемся на это целиком: launchAutoHide с потолком в 3 секунды —
      // страховка. Если JS почему-то не выполнится (сеть тупит, ошибка в бандле),
      // без неё сплэш висел бы вечно и приложение выглядело бы зависшим.
      // Повторный hide() из JS — no-op, конфликта нет.
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: "#faf9f7",
      showSpinner: false,
    },
  },
};

export default config;
