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
//    Модификаторы идут строго в своём порядке, и Receipt в нём первый. Мы
//    используем только Receipt, поэтому строка — ровно
//        MerchantLogin:OutSum:InvId:Receipt:Пароль#1
//
// 2. RECEIPT ПОДПИСЫВАЕТСЯ УЖЕ URL-КОДИРОВАННЫМ. В документации пример именно
//    такой: в md5 уходит строка вида %7B%22items%22%3A… Поэтому кодируем один
//    раз и ту же строку кладём и в подпись, и в адрес. Отсюда же ручная сборка
//    query: URLSearchParams закодировал бы её ВТОРОЙ раз, и подпись перестала
//    бы сходиться.
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

/** Тот самый «один раз закодированный» Receipt: и в подпись, и в адрес. */
export function encodeReceipt(receipt: Receipt): string {
  return encodeURIComponent(JSON.stringify(receipt));
}

/** Подпись исходящей ссылки: MerchantLogin:OutSum:InvId:Receipt:Пароль#1. */
export function signPayment(
  config: RobokassaConfig,
  parts: { outSum: string; invId: number; receiptEncoded: string },
): string {
  const base = [
    config.merchantLogin,
    parts.outSum,
    String(parts.invId),
    parts.receiptEncoded,
    config.password1,
  ].join(":");
  return hash(config.hashAlgo, base);
}

/** Адрес оплаты, куда уводим человека. */
export function buildPaymentUrl(
  config: RobokassaConfig,
  order: { invId: number; amountRub: number; description: string },
): string {
  const outSum = formatOutSum(order.amountRub);
  const receiptEncoded = encodeReceipt(buildReceipt(order.description, order.amountRub));
  const signature = signPayment(config, { outSum, invId: order.invId, receiptEncoded });

  // Собираем query руками: Receipt уже закодирован, и второй проход
  // кодирования сломал бы подпись (см. пункт 2 в шапке файла).
  const pairs: string[] = [
    `MerchantLogin=${encodeURIComponent(config.merchantLogin)}`,
    `OutSum=${encodeURIComponent(outSum)}`,
    `InvId=${order.invId}`,
    `Description=${encodeURIComponent(order.description)}`,
    `Receipt=${receiptEncoded}`,
    `SignatureValue=${signature}`,
    `Culture=ru`,
    `Encoding=utf-8`,
  ];
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
