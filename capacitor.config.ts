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
