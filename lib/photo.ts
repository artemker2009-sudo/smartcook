import { supabase } from "@/lib/supabase";
import { getDisplayMode } from "@/components/YandexMetrika";

// Единая точка подготовки фото на клиенте: декод HEIC (если нужно) → сжатие/
// ресайз/очистка EXIF. Используется во всех местах приёма фото (скан, лента, аватар).
//
// ВАЖНО про HEIC (этап 9 O): Chrome на Android НЕ декодирует HEIC нативно.
// Клиентский декодер heic2any использует WASM/new Function — и блокируется
// строгим CSP в ПРОДЕ (unsafe-eval есть только в dev), поэтому фикс I работал в
// dev-тестах, но падал на реальном устройстве. Решение — конвертировать HEIC на
// СЕРВЕРЕ (/api/convert-heic, Node без CSP). На iOS система сама отдаёт JPEG.

const HEIC_EXT = /\.(heic|heif)$/i;

const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

// Дефолтный потолок ожидания сетевых шагов пайплайна (конвертация HEIC, анализ).
// Раньше эти fetch'и висели без таймаута: на плохой сети вкладка «залипала»
// молча, без телеметрии. 30с — заведомо больше нормального ответа, но спасает
// от бесконечного ожидания.
export const PHOTO_STEP_TIMEOUT_MS = 30_000;

// Таймаут сетевого шага пайплайна. Несёт свой `stage` (напр. "analyze-timeout"),
// чтобы репорт лёг в error_reports с честным шагом, а не с обобщённым "scan".
export class PhotoTimeoutError extends Error {
  constructor(public readonly stage: string) {
    super(`${stage} (превышено ${PHOTO_STEP_TIMEOUT_MS / 1000}s)`);
    this.name = "PhotoTimeoutError";
  }
}

// fetch с жёстким таймаутом через AbortController. На срабатывании таймаута
// бросает PhotoTimeoutError(timeoutStage); сетевые/иные ошибки пробрасывает как есть.
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutStage: string,
  ms: number = PHOTO_STEP_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new PhotoTimeoutError(timeoutStage);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type CompressionOptions = {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  useWebWorker: boolean;
};

export function isHeic(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  // Android часто отдаёт HEIC с пустым или неверным mime — смотрим на имя.
  return HEIC_EXT.test(file.name || "");
}

// Конвертация HEIC → JPEG на сервере. Бросает при ошибке (ловит вызывающий).
async function convertHeicOnServer(file: File): Promise<File> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetchWithTimeout(
    "/api/convert-heic",
    { method: "POST", body: form },
    "convert-heic-timeout",
  );
  if (!res.ok) throw new Error(`HEIC convert failed (${res.status})`);
  const blob = await res.blob();
  const baseName = (file.name || "photo").replace(HEIC_EXT, "");
  return new File([blob], `${baseName || "photo"}.jpg`, { type: "image/jpeg" });
}

// Декодирует HEIC/HEIF → JPEG (через сервер). Не-HEIC возвращается как есть.
export async function decodeHeicIfNeeded(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  return convertHeicOnServer(file);
}

// Полный пайплайн: HEIC-декод (сервер, если нужно) → сжатие/ресайз в JPEG.
// EXIF (в т.ч. гео) вычищается: browser-image-compression перерисовывает кадр
// через canvas и не сохраняет метаданные; серверный JPEG тоже без EXIF.
export async function preparePhoto(
  file: File,
  options: CompressionOptions,
  outName: string,
): Promise<File> {
  const decoded = await decodeHeicIfNeeded(file);
  const imageCompression = (await import("browser-image-compression")).default;
  try {
    const compressed = await imageCompression(decoded, { ...options, fileType: "image/jpeg" });
    return new File([compressed], outName, { type: "image/jpeg" });
  } catch (compressErr) {
    // Возможен HEIC с пустым mime/без расширения (камера Android): не распознали
    // как HEIC, а canvas-декод не смог. Последняя попытка — серверная конвертация.
    if (!isHeic(file)) {
      const converted = await convertHeicOnServer(file);
      const compressed = await imageCompression(converted, { ...options, fileType: "image/jpeg" });
      return new File([compressed], outName, { type: "image/jpeg" });
    }
    throw compressErr;
  }
}

// Best-effort чтение размеров исходника. Для HEIC на Android упадёт (декодер
// браузера не поддерживает формат) — тогда вернём null, это нормально.
async function readDimensions(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return dims;
  } catch {
    return null;
  }
}

// Автоматический репорт о сбое обработки фото в error_reports (тип
// photo_processing_error) — метаданные файла, НИКОГДА сам файл. Никогда не
// бросает. Сделан «пуленепробиваемым» (этап 9 O.1): ни один промежуточный шаг
// не должен помешать отправке — иначе мы теряем телеметрию с устройства.
export async function reportPhotoError(
  stage: string,
  file: File | null,
  err: unknown,
  opts?: { marker?: string; httpStatus?: number },
): Promise<void> {
  try {
    const reason = err instanceof Error ? err.message : String(err ?? "unknown");

    // Таймаут-шаг знает честное имя (напр. "convert-heic-timeout") — оно
    // важнее обобщённого stage вызывающего ("scan"/"analyze"): подменяем.
    const effectiveStage = err instanceof PhotoTimeoutError ? err.stage : stage;
    // Маркер по умолчанию — сбой ОБРАБОТКИ фото; вызывающий может пометить сбой
    // как photo_client_error (ошибка сетевого запроса, а не canvas/декода).
    const marker = opts?.marker ?? "photo_processing_error";
    const headline =
      marker === "photo_client_error" ? "Сбой запроса при обработке фото" : "Не удалось обработать фото";

    let fileLine = "нет файла";
    if (file) {
      const sizeKB = Math.round(file.size / 1024);
      let dimsStr = "размеры неизвестны";
      try {
        const dims = await readDimensions(file);
        if (dims) dimsStr = `${dims.width}×${dims.height}`;
      } catch {}
      fileLine = `${file.name || "—"} · ${file.type || "mime неизвестен"} · ${sizeKB} КБ · ${dimsStr}`;
    }

    const message =
      `[${marker}] ${headline}\n` +
      `Этап: ${effectiveStage}\n` +
      (opts?.httpStatus != null ? `HTTP: ${opts.httpStatus}\n` : "") +
      `Файл: ${fileLine}\n` +
      `Причина: ${reason.slice(0, 500)}`;

    let displayMode = "unknown";
    try { displayMode = getDisplayMode(); } catch {}

    const context = {
      message,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      display_mode: displayMode,
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      app_version: APP_VERSION,
    };
    const payload = JSON.stringify(context);

    // Токен — опционально: его получение НЕ должно блокировать отправку.
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {}

    try {
      await fetch("/api/report-error", {
        method: "POST",
        keepalive: true, // переживёт уход со страницы
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: payload,
      });
    } catch {
      // Крайний фолбэк — sendBeacon (работает даже при выгрузке страницы; анон-репорт ок).
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon("/api/report-error", new Blob([payload], { type: "application/json" }));
        }
      } catch {}
    }
  } catch {
    // Телеметрия не должна мешать основному потоку.
  }
}
