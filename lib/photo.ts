import { supabase } from "@/lib/supabase";
import { getDisplayMode } from "@/components/YandexMetrika";

// Единая точка подготовки фото на клиенте: декод HEIC (если нужно) → сжатие/
// ресайз/очистка EXIF. Используется во всех местах, где мы принимаем фото от
// пользователя (главный сценарий скана, публикация в ленту, аватар).
//
// Зачем отдельный HEIC-декод: Chrome на Android НЕ умеет декодировать HEIC
// нативно, а browser-image-compression рисует картинку в <canvas> через
// <img>/createImageBitmap — на Android это падает с ошибкой загрузки, и раньше
// весь пайплайн валился в «Не удалось обработать фото». На iOS «работало»
// только потому, что система конвертит HEIC в JPEG ещё на этапе выбора файла.
// Поэтому HEIC мы декодируем сами через heic2any (грузится лениво, только когда
// реально выбрали .heic — чтобы не раздувать бандл всем остальным).

const HEIC_EXT = /\.(heic|heif)$/i;

const APP_VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "dev").slice(0, 7);

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

// Декодирует HEIC/HEIF → JPEG File. Не-HEIC возвращается как есть.
// Бросает ошибку, если декодер не справился (её ловит вызывающий и репортит).
export async function decodeHeicIfNeeded(file: File): Promise<File> {
  if (!isHeic(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = (Array.isArray(converted) ? converted[0] : converted) as Blob;
  const baseName = (file.name || "photo").replace(HEIC_EXT, "");
  return new File([blob], `${baseName || "photo"}.jpg`, { type: "image/jpeg" });
}

// Полный пайплайн подготовки: HEIC-декод (лениво) → сжатие/ресайз в JPEG.
// EXIF (в т.ч. гео) вычищается: browser-image-compression перерисовывает кадр
// через canvas и не сохраняет метаданные (preserveExif по умолчанию false).
export async function preparePhoto(
  file: File,
  options: CompressionOptions,
  outName: string,
): Promise<File> {
  const decoded = await decodeHeicIfNeeded(file);
  const imageCompression = (await import("browser-image-compression")).default;
  const compressed = await imageCompression(decoded, { ...options, fileType: "image/jpeg" });
  return new File([compressed], outName, { type: "image/jpeg" });
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
// photo_processing_error). Пишем ТОЛЬКО метаданные файла (тип/размеры/размер),
// НИКОГДА сам файл. Цель — увидеть следующий такой кейс в админке самим, не
// дожидаясь скринов от пользователя. Никогда не бросает наверх.
export async function reportPhotoError(stage: string, file: File | null, err: unknown): Promise<void> {
  try {
    const reason = err instanceof Error ? err.message : String(err ?? "unknown");
    let fileLine = "нет файла";
    if (file) {
      const sizeKB = Math.round(file.size / 1024);
      const dims = await readDimensions(file);
      const dimsStr = dims ? `${dims.width}×${dims.height}` : "размеры неизвестны";
      fileLine = `${file.name || "—"} · ${file.type || "mime неизвестен"} · ${sizeKB} КБ · ${dimsStr}`;
    }

    const message =
      `[photo_processing_error] Не удалось обработать фото\n` +
      `Этап: ${stage}\n` +
      `Файл: ${fileLine}\n` +
      `Причина: ${reason.slice(0, 500)}`;

    const context = {
      message,
      url: typeof window !== "undefined" ? window.location.href : undefined,
      display_mode: getDisplayMode(),
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : undefined,
      app_version: APP_VERSION,
    };

    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch("/api/report-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(context),
    });
  } catch {
    // Репорт — сугубо телеметрия, его сбой не должен мешать основному потоку.
  }
}
