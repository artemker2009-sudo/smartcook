import { createHash } from "crypto";
// Относительный путь, а не "@/lib/...": алиас @/ в vitest не резолвится, а этот
// файл покрыт тестами (lib/robokassa.test.ts).
import type { RobokassaConfig } from "./robokassaConfig";

// Robokassa: формирование ссылки оплаты и проверка подписей.
//
// БЕЗ "server-only" СОЗНАТЕЛЬНО, в отличие от соседнего robokassaConfig.ts.
// Здесь чистая арифметика подписей: ключи приходят аргументом, своих секретов
// модуль не читает и в клиентский бандл ничего не утащит (его никто из
// клиентских компонентов и не импортирует). Зато его можно прогнать тестами —
// а подпись это ровно то место, где ошибку надо ловить тестом, а не на живых
// платежах. Ключи по-прежнему только в env, см. robokassaConfig.ts.
//
// Сделано по документации docs.robokassa.ru (разделы «Приём платежей»,
// «Уведомления и переадресация», «Онлайн-касса»). Три вещи, на которых легко
// ошибиться и которые проверены тестами:
//
// 1. ПОРЯДОК ПОЛЕЙ В ПОДПИСИ. Исходящая ссылка:
//        MerchantLogin:OutSum:InvId:<модификаторы>:Пароль#1
//    Модификаторы идут строго в своём порядке — Receipt, StepByStep,
//    ResultUrl2, SuccessUrl2, SuccessUrl2Method, FailUrl2, FailUrl2Method,
//    Token — и «добавляются только при наличии»: пустых слотов между ними не
//    бывает. Мы используем Receipt и пару адресов возврата, поэтому строка —
//        MerchantLogin:OutSum:InvId:Receipt:SuccessUrl2:GET:FailUrl2:GET:Пароль#1
//
// 2. RECEIPT КОДИРУЕТСЯ РАЗНОЕ ЧИСЛО РАЗ В ПОДПИСИ И В АДРЕСЕ. В подпись идёт
//    ОДИН раз закодированный JSON — раздел «Фискализация»: «перед добавлением
//    в строку для подписи значение Receipt нужно URL-кодировать». Это строка
//    вида %7B%22items%22%3A…, ровно как в примере документации; сверено
//    побайтово тестом. А в GET-адрес та же строка идёт закодированной ВТОРОЙ
//    раз (%257B%2522items%2522…).
//
//    Почему так. Пример в документации — форма POST: браузер добавляет
//    транспортный слой URL-кодирования сам, сервер Robokassa его снимает и
//    получает ровно ту строку, которую мы подписали. В GET-ссылке такого слоя
//    нет, и если положить в адрес один раз закодированный Receipt, Robokassa
//    после своего единственного декодирования увидит СЫРОЙ JSON — не то, что
//    подписано, — и ответит кодом 29. Поэтому второй проход добавляем руками.
//
//    Проверено живой тестовой оплатой 26.09.2026: один раз — код 29, дважды
//    (с той же подписью) — открывается страница оплаты. До этого опыт врал
//    в обе стороны, потому что не сходился сам Пароль #1: тестовый режим
//    Robokassa требует ОТДЕЛЬНЫЙ тестовый пароль, и с рабочим 29 приходил на
//    любое кодирование, даже вообще без Receipt.
//
//    Отсюда же ручная сборка query: URLSearchParams закодировал бы и остальные
//    поля по-своему, а Receipt — третий раз.
//
// 3. РАЗНЫЕ ПАРОЛИ НА РАЗНЫХ КОНЦАХ. Исходящая ссылка — Пароль #1. ResultURL
//    (сервер Robokassa к нам) — Пароль #2. SuccessURL/FailURL (браузер человека
//    к нам) — снова Пароль #1. Перепутать пароли — значит либо не пускать
//    настоящие оплаты, либо принимать поддельные.

export const ROBOKASSA_PAYMENT_URL = "https://auth.robokassa.ru/Merchant/Index.aspx";

/** Позиция чека. Для самозанятого — одна услуга без НДС. */
export type ReceiptItem = {
  name: string;
  quantity: number;
  sum: number;
  payment_method: "full_payment";
  payment_object: "service";
  tax: "none";
};

export type Receipt = { items: ReceiptItem[] };

/** «49.00» — сумма с двумя знаками, как в примерах документации. */
export function formatOutSum(amountRub: number): string {
  return amountRub.toFixed(2);
}

function hash(algo: RobokassaConfig["hashAlgo"], value: string): string {
  return createHash(algo).update(value, "utf8").digest("hex");
}

/**
 * Чек самозанятого: одна позиция с тем же названием, что и Description.
 * sno не передаём — у самозанятого («Робочеки СМЗ») система налогообложения
 * берётся из настроек магазина, и лишнее поле здесь только мешает.
 */
export function buildReceipt(description: string, amountRub: number): Receipt {
  return {
    items: [
      {
        // 128 символов — потолок из документации.
        name: description.slice(0, 128),
        quantity: 1,
        sum: Number(formatOutSum(amountRub)),
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
}

/** Receipt для СТРОКИ ПОДПИСИ: JSON, закодированный один раз. */
export function encodeReceipt(receipt: Receipt): string {
  return encodeURIComponent(JSON.stringify(receipt));
}

/**
 * Receipt для GET-АДРЕСА: то же значение плюс транспортный слой кодирования,
 * который в POST-форме из документации добавил бы браузер (см. пункт 2 в шапке).
 */
export function encodeReceiptForUrl(receiptEncoded: string): string {
  return encodeURIComponent(receiptEncoded);
}

/**
 * Адреса возврата, которые переопределяют Success/Fail URL из настроек
 * магазина. Нужны потому, что в настройках адрес ОДИН, а доменов у нас два.
 */
export type ReturnUrls = { success: string; fail: string };

/**
 * GET, а не POST: возврат — это переход браузера человека на нашу страницу.
 * POST привёл бы к тому, что страница открывается post-запросом, а обновление
 * по F5 спрашивает «отправить форму повторно».
 */
const RETURN_URL_METHOD = "GET";

/**
 * URL возврата для подписи И для адреса — ОДИН проход кодирования в обоих
 * местах, в отличие от Receipt.
 *
 * Асимметрия не наша выдумка, она прямо в примере документации (раздел
 * «Дополнительная переадресация»): там в адресе стоит
 * `SuccessUrl2=https%3A%2F%2Frobokassa.com%2F`, и ровно эта же строка стоит в
 * строке подписи, — тогда как Receipt в том же примере в адресе закодирован
 * дважды, а в подписи один раз. Похоже, Robokassa декодирует query один раз и
 * при сборке строки подписи кодирует адреса обратно, а Receipt берёт как есть.
 */
export function encodeReturnUrl(url: string): string {
  return encodeURIComponent(url);
}

/**
 * Подпись исходящей ссылки.
 *
 * Без адресов возврата: MerchantLogin:OutSum:InvId:Receipt:Пароль#1
 * С адресами:           …:Receipt:SuccessUrl2:SuccessUrl2Method:FailUrl2:FailUrl2Method:Пароль#1
 *
 * Порядок модификаторов задан документацией жёстко (Receipt, StepByStep,
 * ResultUrl2, SuccessUrl2, SuccessUrl2Method, FailUrl2, FailUrl2Method, Token)
 * и «добавляются только при наличии»: пустых слотов между ними не бывает.
 * Мы используем Receipt и пару адресов возврата, StepByStep и ResultUrl2 —
 * нет, поэтому их слоты не занимаем вовсе.
 */
export function signPayment(
  config: RobokassaConfig,
  parts: {
    outSum: string;
    invId: number;
    receiptEncoded: string;
    returnUrls?: ReturnUrls | null;
  },
): string {
  const modifiers = [parts.receiptEncoded];
  if (parts.returnUrls) {
    modifiers.push(
      encodeReturnUrl(parts.returnUrls.success),
      RETURN_URL_METHOD,
      encodeReturnUrl(parts.returnUrls.fail),
      RETURN_URL_METHOD,
    );
  }

  const base = [
    config.merchantLogin,
    parts.outSum,
    String(parts.invId),
    ...modifiers,
    config.password1,
  ].join(":");
  return hash(config.hashAlgo, base);
}

/** Адрес оплаты, куда уводим человека. */
export function buildPaymentUrl(
  config: RobokassaConfig,
  order: {
    invId: number;
    amountRub: number;
    description: string;
    /** Куда вернуть человека. null — сработают адреса из настроек магазина. */
    returnUrls?: ReturnUrls | null;
  },
): string {
  const outSum = formatOutSum(order.amountRub);
  const receiptEncoded = encodeReceipt(buildReceipt(order.description, order.amountRub));
  const returnUrls = order.returnUrls ?? null;
  const signature = signPayment(config, {
    outSum,
    invId: order.invId,
    receiptEncoded,
    returnUrls,
  });

  // Собираем query руками: у Receipt в адресе своё число проходов кодирования,
  // отличное от того, что ушло в подпись (см. пункт 2 в шапке файла).
  const pairs: string[] = [
    `MerchantLogin=${encodeURIComponent(config.merchantLogin)}`,
    `OutSum=${encodeURIComponent(outSum)}`,
    `InvId=${order.invId}`,
    `Description=${encodeURIComponent(order.description)}`,
    `Receipt=${encodeReceiptForUrl(receiptEncoded)}`,
  ];
  if (returnUrls) {
    pairs.push(
      `SuccessUrl2=${encodeReturnUrl(returnUrls.success)}`,
      `SuccessUrl2Method=${RETURN_URL_METHOD}`,
      `FailUrl2=${encodeReturnUrl(returnUrls.fail)}`,
      `FailUrl2Method=${RETURN_URL_METHOD}`,
    );
  }
  pairs.push(`SignatureValue=${signature}`, `Culture=ru`, `Encoding=utf-8`);
  if (config.isTest) pairs.push("IsTest=1");

  return `${ROBOKASSA_PAYMENT_URL}?${pairs.join("&")}`;
}

/**
 * Подпись ResultURL: OutSum:InvId:Пароль#2.
 *
 * Сравнение регистронезависимое: Robokassa присылает hex в верхнем регистре, а
 * crypto отдаёт в нижнем. Сравнение «как есть» отбивало бы все настоящие
 * оплаты — и выглядело бы как «Robokassa не работает».
 */
export function verifyResultSignature(
  config: RobokassaConfig,
  params: { outSum: string; invId: string; signature: string },
): boolean {
  const expected = hash(config.hashAlgo, `${params.outSum}:${params.invId}:${config.password2}`);
  return expected.toLowerCase() === params.signature.trim().toLowerCase();
}

/** Подпись SuccessURL / FailURL: OutSum:InvId:Пароль#1 (НЕ #2). */
export function verifyRedirectSignature(
  config: RobokassaConfig,
  params: { outSum: string; invId: string; signature: string },
): boolean {
  const expected = hash(config.hashAlgo, `${params.outSum}:${params.invId}:${config.password1}`);
  return expected.toLowerCase() === params.signature.trim().toLowerCase();
}

/**
 * Помечено ли уведомление как ТЕСТОВОЕ (Robokassa шлёт IsTest=1).
 *
 * Зачем это отдельно проверять, если подпись и так защищает. В тестовом режиме
 * Robokassa подписывает НЕ теми паролями, что в боевом, — значит тестовое
 * уведомление в боевом магазине обычно не пройдёт проверку подписи само собой.
 * Но «обычно» здесь держится на том, что пароли поменяли ОДНОВРЕМЕННО с
 * режимом. Реальная ошибка выглядит так: ROBOKASSA_IS_TEST переключили в false,
 * а пароли забыли — остались тестовые. Тогда тестовая оплата подписывается
 * верно, проходит проверку и выдаёт настоящий Премиум за ноль рублей.
 *
 * Отсюда правило: режим объявлен боевым — тестовые уведомления не принимаем,
 * какой бы правильной ни была подпись.
 *
 * Обратную сторону (боевое уведомление в тестовом режиме) не проверяем: там
 * человек уже заплатил настоящими деньгами, и отказать ему было бы хуже, чем
 * выдать Премиум.
 */
export function isTestNotification(params: URLSearchParams): boolean {
  const raw = (params.get("IsTest") ?? params.get("is_test") ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true";
}

/**
 * Совпадает ли присланная сумма с суммой заказа. Сравниваем ЧИСЛА, а не
 * строки: Robokassa может прислать «49.00», «49.0» или «49» — это одна и та же
 * сумма, а строковое сравнение отбило бы две трети настоящих оплат.
 */
export function sameAmount(a: string | number, b: string | number): boolean {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  // Копейка допуска: суммы приходят в рублях с двумя знаками.
  return Math.abs(x - y) < 0.005;
}
