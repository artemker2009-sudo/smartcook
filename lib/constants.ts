// Ссылка на страницу доната для кнопки "Поддержать проект".
// Подставь сюда реальный адрес (Boosty/ЮMoney/Тинькофф и т.п.).
export const DONATE_URL = "https://pay.cloudtips.ru/p/6f66d8e3";

// Страница приложения SmartCook в RuStore (единственное место — правь здесь).
// ВАЖНО: это точный проверенный адрес. НЕ собирать его по шаблону из
// package_name — реальный package_name у нас со знаком подчёркивания
// (pro.smart_cook.twa), и «очевидная» сборка pro.smartcook.twa даёт 404.
export const RUSTORE_URL = "https://www.rustore.ru/catalog/app/pro.smart_cook.twa";

// CPA-партнёрка «Купер» (доставка продуктов) — блок «Нужно купить» на экране
// рецепта. Ссылка сгенерирована в кабинете партнёра, токен ОРД уже вшит в неё
// параметром erid. ВАЖНО: строку НЕ модифицировать и не пересобирать —
// erid обязан остаться ровно таким, иначе реклама будет немаркированной
// (нарушение закона о рекламе). Любые utm/oid/wid/statid/sub — часть трекинга
// партнёрки, менять их нельзя.
export const KUPER_CPA_URL =
  "https://kuper.ru/?utm_content=vfcpv&utm_medium=cpa&utm_term=undefined+&utm_campaign=site&utm_source=SmartCook&oid=rs1fv2hzo&wid=vfcpv&statid=7379_site&sub=site&linkId=abec39dc-0a5a-4129-b514-9feca4dfd461&erid=CQH36pWzJqMnsPNHRygVahbdHjQ8EjWBnbzK1XF9uPnWik";

// Маркировка рекламы под кнопкой (требование закона о рекламе / ОРД):
// рекламодатель + ИНН. Менять только по данным из кабинета ОРД.
export const KUPER_AD_LABEL = "Реклама. ООО «Инстамарт Сервис», ИНН 9705118142";
