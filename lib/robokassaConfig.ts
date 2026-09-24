import "server-only";

// Ключи Robokassa. ТОЛЬКО переменные окружения: ни одного значения в коде, в
// логах и в отчётах (CLAUDE.md, правило 4).
//
//   ROBOKASSA_MERCHANT_LOGIN — идентификатор магазина;
//   ROBOKASSA_PASSWORD_1     — пароль #1, подпись исходящей ссылки оплаты;
//   ROBOKASSA_PASSWORD_2     — пароль #2, проверка подписи на ResultURL;
//   ROBOKASSA_IS_TEST        — "true" → IsTest=1 (тестовый режим магазина);
//   ROBOKASSA_HASH_ALGO      — md5 | sha256, по умолчанию md5.
//
// Пока ключей нет, всё, что их требует, отвечает «оплата заработает в
// ближайшие дни» и НЕ падает пятисоткой (SPEC 3.4).

export type RobokassaHashAlgo = "md5" | "sha256";

export type RobokassaConfig = {
  merchantLogin: string;
  password1: string;
  password2: string;
  isTest: boolean;
  hashAlgo: RobokassaHashAlgo;
};

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function getRobokassaHashAlgo(): RobokassaHashAlgo {
  return env("ROBOKASSA_HASH_ALGO").toLowerCase() === "sha256" ? "sha256" : "md5";
}

/** Заведены ли ключи. Логин и оба пароля — все три обязательны. */
export function isRobokassaConfigured(): boolean {
  return !!(env("ROBOKASSA_MERCHANT_LOGIN") && env("ROBOKASSA_PASSWORD_1") && env("ROBOKASSA_PASSWORD_2"));
}

/** Конфиг целиком или null, если чего-то не хватает. */
export function getRobokassaConfig(): RobokassaConfig | null {
  if (!isRobokassaConfigured()) return null;
  return {
    merchantLogin: env("ROBOKASSA_MERCHANT_LOGIN"),
    password1: env("ROBOKASSA_PASSWORD_1"),
    password2: env("ROBOKASSA_PASSWORD_2"),
    isTest: env("ROBOKASSA_IS_TEST").toLowerCase() === "true",
    hashAlgo: getRobokassaHashAlgo(),
  };
}
