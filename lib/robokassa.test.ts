import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import {
  buildPaymentUrl,
  buildReceipt,
  encodeReceipt,
  formatOutSum,
  sameAmount,
  signPayment,
  verifyRedirectSignature,
  verifyResultSignature,
  ROBOKASSA_PAYMENT_URL,
} from "./robokassa";
// Тип, а не значение: robokassaConfig.ts помечен server-only и в тесты не
// тянется — import type esbuild стирает целиком.
import type { RobokassaConfig } from "./robokassaConfig";

// Ключи здесь — заведомо игрушечные строки из примера документации.
// Настоящие живут только в переменных окружения.
const CONFIG: RobokassaConfig = {
  merchantLogin: "demo",
  password1: "password_1",
  password2: "password_2",
  isTest: false,
  hashAlgo: "md5",
};

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");

describe("подпись исходящей ссылки — пример из документации", () => {
  // docs.robokassa.ru, раздел с примерами кода:
  //   md5("$merchant_login:$out_sum:$invid:$receipt:$password_1")
  // где $receipt — УЖЕ URL-кодированный минимизированный JSON.
  it("повторяет формулу MerchantLogin:OutSum:InvId:Receipt:Пароль#1", () => {
    const receiptEncoded = encodeURIComponent('{"items":[{"name":"product","quantity":1,"sum":8.96}]}');
    const signature = signPayment(CONFIG, { outSum: "8.96", invId: 12345, receiptEncoded });

    expect(signature).toBe(md5(`demo:8.96:12345:${receiptEncoded}:password_1`));
  });

  it("sha256 берётся, когда так настроен магазин", () => {
    const receiptEncoded = encodeReceipt(buildReceipt("Премиум SmartCook — 1 месяц", 49));
    const sha = signPayment({ ...CONFIG, hashAlgo: "sha256" }, {
      outSum: "49.00",
      invId: 7,
      receiptEncoded,
    });
    expect(sha).toBe(
      createHash("sha256")
        .update(`demo:49.00:7:${receiptEncoded}:password_1`, "utf8")
        .digest("hex"),
    );
    expect(sha).toHaveLength(64);
  });
});

describe("buildReceipt — чек самозанятого", () => {
  const receipt = buildReceipt("Премиум SmartCook — 1 месяц", 49);

  it("одна позиция с названием заказа и суммой", () => {
    expect(receipt.items).toHaveLength(1);
    expect(receipt.items[0].name).toBe("Премиум SmartCook — 1 месяц");
    expect(receipt.items[0].sum).toBe(49);
    expect(receipt.items[0].quantity).toBe(1);
  });

  it("без НДС, услуга, полный расчёт", () => {
    expect(receipt.items[0].tax).toBe("none");
    expect(receipt.items[0].payment_object).toBe("service");
    expect(receipt.items[0].payment_method).toBe("full_payment");
  });

  it("название режется до 128 символов (потолок документации)", () => {
    expect(buildReceipt("я".repeat(200), 49).items[0].name).toHaveLength(128);
  });

  it("sno не передаём — берётся из настроек магазина", () => {
    expect(receipt).not.toHaveProperty("sno");
  });
});

describe("buildPaymentUrl", () => {
  const url = buildPaymentUrl(CONFIG, {
    invId: 42,
    amountRub: 390,
    description: "Премиум SmartCook — 1 год",
  });

  it("ведёт на адрес формы оплаты", () => {
    expect(url.startsWith(`${ROBOKASSA_PAYMENT_URL}?`)).toBe(true);
  });

  it("сумма с двумя знаками", () => {
    expect(url).toContain("OutSum=390.00");
  });

  it("Receipt в адресе — ровно та строка, что попала в подпись", () => {
    const receiptEncoded = encodeReceipt(buildReceipt("Премиум SmartCook — 1 год", 390));
    const expected = signPayment(CONFIG, { outSum: "390.00", invId: 42, receiptEncoded });

    expect(url).toContain(`Receipt=${receiptEncoded}`);
    expect(url).toContain(`SignatureValue=${expected}`);
  });

  it("Receipt не закодирован ВТОРОЙ раз — иначе подпись не сойдётся", () => {
    // Двойное кодирование превратило бы % в %25. Его тут быть не должно.
    const receiptPart = url.split("Receipt=")[1].split("&")[0];
    expect(receiptPart).not.toContain("%25");
    expect(decodeURIComponent(receiptPart)).toContain('"tax":"none"');
  });

  it("IsTest появляется только в тестовом режиме", () => {
    expect(url).not.toContain("IsTest");
    const test = buildPaymentUrl({ ...CONFIG, isTest: true }, {
      invId: 1,
      amountRub: 49,
      description: "Премиум SmartCook — 1 месяц",
    });
    expect(test).toContain("IsTest=1");
  });
});

describe("verifyResultSignature — ResultURL, Пароль #2", () => {
  const good = md5("49.00:42:password_2");

  it("принимает верную подпись", () => {
    expect(verifyResultSignature(CONFIG, { outSum: "49.00", invId: "42", signature: good })).toBe(true);
  });

  it("принимает ВЕРХНИЙ регистр — Robokassa шлёт именно его", () => {
    expect(
      verifyResultSignature(CONFIG, { outSum: "49.00", invId: "42", signature: good.toUpperCase() }),
    ).toBe(true);
  });

  it("отбивает чужую подпись", () => {
    expect(
      verifyResultSignature(CONFIG, { outSum: "49.00", invId: "42", signature: md5("что угодно") }),
    ).toBe(false);
  });

  it("отбивает подпись, посчитанную Паролем #1", () => {
    expect(
      verifyResultSignature(CONFIG, {
        outSum: "49.00",
        invId: "42",
        signature: md5("49.00:42:password_1"),
      }),
    ).toBe(false);
  });

  it("отбивает подмену суммы: подпись от 49 не подходит к 990", () => {
    expect(verifyResultSignature(CONFIG, { outSum: "990.00", invId: "42", signature: good })).toBe(false);
  });

  it("отбивает подмену номера заказа", () => {
    expect(verifyResultSignature(CONFIG, { outSum: "49.00", invId: "43", signature: good })).toBe(false);
  });
});

describe("verifyRedirectSignature — SuccessURL/FailURL, Пароль #1", () => {
  it("считается Паролем #1, а не #2", () => {
    expect(
      verifyRedirectSignature(CONFIG, {
        outSum: "49.00",
        invId: "42",
        signature: md5("49.00:42:password_1"),
      }),
    ).toBe(true);
    expect(
      verifyRedirectSignature(CONFIG, {
        outSum: "49.00",
        invId: "42",
        signature: md5("49.00:42:password_2"),
      }),
    ).toBe(false);
  });
});

describe("sameAmount — сравниваем числа, а не строки", () => {
  it.each([
    ["49.00", 49],
    ["49.0", 49],
    ["49", 49],
    [49, "49.00"],
  ])("%s == %s", (a, b) => {
    expect(sameAmount(a as string, b as number)).toBe(true);
  });

  it("другая сумма не проходит", () => {
    expect(sameAmount("48.99", 49)).toBe(false);
    expect(sameAmount("990.00", 49)).toBe(false);
  });

  it("мусор не проходит", () => {
    expect(sameAmount("не число", 49)).toBe(false);
  });
});

describe("formatOutSum", () => {
  it.each([
    [49, "49.00"],
    [390, "390.00"],
    [990, "990.00"],
  ])("%i → %s", (a, b) => expect(formatOutSum(a as number)).toBe(b));
});
