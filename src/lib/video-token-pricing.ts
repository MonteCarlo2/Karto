/**
 * Тарификация видео в абстрактных токенах (только видео; изображения — отдельно).
 * Аудио ×2 для «Стандарт» и «Студия» (pro). «Синхрон» — без множителя на звук.
 */

export type VideoModeKey = "standard" | "pro" | "sync";

export const VIDEO_TOKEN_PACKAGES = [
  { id: "test", name: "Тестовый", priceRub: 390, tokens: 1250 },
  { id: "basic", name: "Базовый", priceRub: 790, tokens: 2850 },
  { id: "advanced", name: "Продвинутый", priceRub: 1599, tokens: 6250 },
  { id: "max", name: "Максимальный", priceRub: 2999, tokens: 12500 },
] as const;

/** Базовая стоимость «Стандарт» (Seedance), без аудио */
const STANDARD_BASE: Record<
  "480p" | "720p" | "1080p",
  Record<4 | 8 | 12, number>
> = {
  "480p": { 4: 35, 8: 70, 12: 100 },
  "720p": { 4: 75, 8: 140, 12: 200 },
  "1080p": { 4: 150, 8: 300, 12: 450 },
};

/** «Студия» / Kling PRO — только 1080p */
const PRO_BASE: Record<5 | 10, number> = {
  5: 280,
  10: 550,
};

const SYNC_PER_SEC: Record<"720p" | "1080p", number> = {
  "720p": 30,
  "1080p": 45,
};

export interface FreeVideoCostInput {
  videoMode: VideoModeKey;
  resolution: "480p" | "720p" | "1080p";
  durationSec: number;
  generateAudio: boolean;
  /** Для sync: длина эталонного видео в секундах (округление вверх на сервере) */
  referenceVideoDurationSec?: number;
}

/**
 * Расчёт стоимости свободного видео (free / sync / pro).
 * Сервер обязан пересчитать и не доверять клиенту.
 */
export function computeFreeVideoTokenCost(input: FreeVideoCostInput): number {
  const { videoMode, resolution, durationSec, generateAudio, referenceVideoDurationSec } = input;

  let base = 0;

  if (videoMode === "standard") {
    const res = resolution as keyof typeof STANDARD_BASE;
    if (!STANDARD_BASE[res]) return 0;
    const d = durationSec as 4 | 8 | 12;
    const row = STANDARD_BASE[res];
    if (!(d in row)) return 0;
    base = row[d];
    if (generateAudio) base *= 2;
    return Math.ceil(base);
  }

  if (videoMode === "pro") {
    if (resolution !== "1080p") return 0;
    const d = durationSec as 5 | 10;
    if (!(d in PRO_BASE)) return 0;
    base = PRO_BASE[d];
    if (generateAudio) base *= 2;
    return Math.ceil(base);
  }

  if (videoMode === "sync") {
    const res = resolution === "720p" || resolution === "1080p" ? resolution : null;
    if (!res) return 0;
    const raw = referenceVideoDurationSec ?? 0;
    const sec = Math.max(1, Math.min(300, Math.ceil(Number(raw))));
    base = sec * SYNC_PER_SEC[res];
    return Math.ceil(base);
  }

  return 0;
}

export interface ProductVideoCostInput {
  resolution: "720p" | "1080p";
  durationSec: 5 | 10;
  /** Если появится звук у товара — учитываем как в «Студии» */
  generateAudio?: boolean;
}

/**
 * Видео «для товара»: по сути тот же класс, что Kling PRO (5/10 c).
 * 720p: коэффициент к базе 1080p (в тарифе задана только 1080p).
 */
export function computeProductVideoTokenCost(input: ProductVideoCostInput): number {
  const { resolution, durationSec, generateAudio } = input;
  const d = durationSec;
  if (!(d in PRO_BASE)) return 0;
  let base = PRO_BASE[d];
  if (resolution === "720p") {
    base = Math.ceil(base * 0.62);
  }
  if (generateAudio) base *= 2;
  return Math.ceil(base);
}

export function formatTokenShort(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Таблица для модалки «ценовая политика»: Стандарт, токены без звука (×2 со звуком). */
export function getVideoPolicyStandardRows(): {
  resolution: string;
  sec4: number;
  sec8: number;
  sec12: number;
}[] {
  return (["480p", "720p", "1080p"] as const).map((res) => ({
    resolution: res,
    sec4: STANDARD_BASE[res][4],
    sec8: STANDARD_BASE[res][8],
    sec12: STANDARD_BASE[res][12],
  }));
}

/** Студия PRO, 1080p, без звука (×2 со звуком). */
export function getVideoPolicyProRows(): { durationSec: 5 | 10; tokens: number }[] {
  return [
    { durationSec: 5, tokens: PRO_BASE[5] },
    { durationSec: 10, tokens: PRO_BASE[10] },
  ];
}

/** Синхронизация по эталону: токенов в секунду. */
export function getVideoPolicySyncPerSec(): { resolution: string; perSec: number }[] {
  return [
    { resolution: "720p", perSec: SYNC_PER_SEC["720p"] },
    { resolution: "1080p", perSec: SYNC_PER_SEC["1080p"] },
  ];
}
