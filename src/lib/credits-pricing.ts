/**
 * Единые «Кредиты» KARTO: фото + видео в Креативе и внутри Потока.
 * Якорь: 1 фото 4K = 100 кредитов (COGS ≈ $0.14).
 */

export const CREDIT_PHOTO_4K = 100;
export const CREDIT_PHOTO_2K = 75;
export const CREDIT_FLOW_ANIMATE = 110;

/** Кредитов на 1 Поток (базовый тариф 1×). */
export const FLOW_CREDITS_BASE = 1250;
/** Буст: 5 потоков → +5% на поток. */
export const FLOW_CREDITS_PER_FLOW_5 = 1313;
/** Буст: 15 потоков → +10% на поток. */
export const FLOW_CREDITS_PER_FLOW_15 = 1375;

export const FLOW_CREDITS_TOTAL_1 = FLOW_CREDITS_BASE;
export const FLOW_CREDITS_TOTAL_5 = 6565;
export const FLOW_CREDITS_TOTAL_15 = 20625;

/** Пакеты кредитов для «Креатив» (цены без изменений). */
export const CREDIT_PACKAGES = [
  {
    id: "mini",
    name: "Мини",
    priceRub: 249,
    credits: 800,
    photosEquiv: 8,
    blurb: "Чтобы попробовать",
  },
  {
    id: "standard",
    name: "Стандарт",
    priceRub: 590,
    credits: 2000,
    photosEquiv: 20,
    blurb: "Для серии карточек",
  },
  {
    id: "pro",
    name: "Про",
    priceRub: 1490,
    credits: 5000,
    photosEquiv: 50,
    blurb: "Выгодный объём",
  },
  {
    id: "max",
    name: "Максимум",
    priceRub: 2990,
    credits: 10000,
    photosEquiv: 100,
    blurb: "Максимум возможностей",
  },
] as const;

export type CreditPackageId = (typeof CREDIT_PACKAGES)[number]["id"];

/** Приветственные кредиты новому аккаунту (вместо 3 ген. + 100 видео-токенов). */
export const FREE_WELCOME_CREDITS = 400;

/** Миграция: 1 старая creative-генерация → кредиты. */
export const LEGACY_CREATIVE_GEN_TO_CREDITS = 100;
/** Миграция: старые video tokens → кредиты. */
export const LEGACY_VIDEO_TOKEN_TO_CREDITS = 0.7;

export type VideoModeKey = "standard" | "pro" | "sync";

/** Seedance «Стандарт»: кредиты без звука; со звуком ×2. */
const STANDARD_CREDITS: Record<
  "480p" | "720p" | "1080p",
  Record<4 | 8 | 12, number>
> = {
  "480p": { 4: 25, 8: 50, 12: 75 },
  "720p": { 4: 50, 8: 100, 12: 150 },
  "1080p": { 4: 110, 8: 215, 12: 320 },
};

/** Kling «Про» 1080p без звука; со звуком ×2. */
const PRO_CREDITS: Record<5 | 10, number> = {
  5: 200,
  10: 400,
};

const SYNC_PER_SEC: Record<"720p" | "1080p", number> = {
  "720p": 40,
  "1080p": 65,
};

/** Grok в Потоке: своё видео 3–10 с. */
const FLOW_GROK_CREDITS: Record<number, number> = {
  3: 35,
  4: 45,
  5: 50,
  6: 55,
  7: 65,
  8: 70,
  9: 80,
  10: 85,
};

export function creditsPerFlowGrant(flowPlanVolume: number): number {
  if (flowPlanVolume >= 15) return FLOW_CREDITS_PER_FLOW_15;
  if (flowPlanVolume >= 5) return FLOW_CREDITS_PER_FLOW_5;
  return FLOW_CREDITS_BASE;
}

export function photoCreditCost(resolution: "2k" | "4k" = "4k"): number {
  return resolution === "2k" ? CREDIT_PHOTO_2K : CREDIT_PHOTO_4K;
}

export interface FreeVideoCostInput {
  videoMode: VideoModeKey;
  resolution: "480p" | "720p" | "1080p";
  durationSec: number;
  generateAudio: boolean;
  referenceVideoDurationSec?: number;
}

export function computeFreeVideoCreditCost(input: FreeVideoCostInput): number {
  const { videoMode, resolution, durationSec, generateAudio, referenceVideoDurationSec } =
    input;

  if (videoMode === "standard") {
    const res = resolution as keyof typeof STANDARD_CREDITS;
    if (!STANDARD_CREDITS[res]) return 0;
    const d = durationSec as 4 | 8 | 12;
    const row = STANDARD_CREDITS[res];
    if (!(d in row)) return 0;
    let base = row[d];
    if (generateAudio) base *= 2;
    return Math.ceil(base);
  }

  if (videoMode === "pro") {
    if (resolution !== "1080p" && resolution !== "720p") return 0;
    const d = durationSec as 5 | 10;
    if (!(d in PRO_CREDITS)) return 0;
    let base = PRO_CREDITS[d];
    if (resolution === "720p") base = Math.ceil(base * 0.62);
    if (generateAudio) base *= 2;
    return Math.ceil(base);
  }

  if (videoMode === "sync") {
    const res = resolution === "720p" || resolution === "1080p" ? resolution : null;
    if (!res) return 0;
    const raw = referenceVideoDurationSec ?? 0;
    const sec = Math.max(1, Math.min(300, Math.ceil(Number(raw))));
    return Math.ceil(sec * SYNC_PER_SEC[res]);
  }

  return 0;
}

export interface ProductVideoCostInput {
  resolution: "720p" | "1080p";
  durationSec: 5 | 10;
  generateAudio?: boolean;
}

/** «Для товара»: класс как Kling Pro. */
export function computeProductVideoCreditCost(input: ProductVideoCostInput): number {
  return computeFreeVideoCreditCost({
    videoMode: "pro",
    resolution: input.resolution === "720p" ? "720p" : "1080p",
    durationSec: input.durationSec,
    generateAudio: Boolean(input.generateAudio),
  });
}

export function estimateGrokImagine720CreditCost(durationSec: number): number {
  const d = Math.max(3, Math.min(10, Math.round(durationSec)));
  return FLOW_GROK_CREDITS[d] ?? 55;
}

export function estimateSeedance1080CreditCost(
  durationSec: number,
  generateAudio: boolean
): number {
  const d = Math.max(4, Math.min(12, Math.round(durationSec)));
  const row = STANDARD_CREDITS["1080p"];
  let base: number;
  if (d <= 4) base = row[4];
  else if (d <= 8) {
    const t = (d - 4) / 4;
    base = row[4] + t * (row[8] - row[4]);
  } else {
    const t = (d - 8) / 4;
    base = row[8] + t * (row[12] - row[8]);
  }
  if (generateAudio) base *= 2;
  return Math.ceil(base);
}

/** Алиасы под старые имена (постепенный рефактор импортов). */
export const computeFreeVideoTokenCost = computeFreeVideoCreditCost;
export const computeProductVideoTokenCost = computeProductVideoCreditCost;
export const estimateGrokImagine720TokenCost = estimateGrokImagine720CreditCost;
export const estimateSeedance1080TokenCost = estimateSeedance1080CreditCost;
export const VIDEO_TOKEN_PACKAGES = CREDIT_PACKAGES.map((p) => ({
  id: p.id,
  name: p.name,
  priceRub: p.priceRub,
  tokens: p.credits,
}));

export function formatCreditShort(n: number): string {
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export const formatTokenShort = formatCreditShort;

export function getVideoPolicyStandardRows(): {
  resolution: string;
  sec4: number;
  sec8: number;
  sec12: number;
}[] {
  return (["480p", "720p", "1080p"] as const).map((res) => ({
    resolution: res,
    sec4: STANDARD_CREDITS[res][4],
    sec8: STANDARD_CREDITS[res][8],
    sec12: STANDARD_CREDITS[res][12],
  }));
}

export function getVideoPolicyProRows(): { durationSec: 5 | 10; tokens: number }[] {
  return [
    { durationSec: 5, tokens: PRO_CREDITS[5] },
    { durationSec: 10, tokens: PRO_CREDITS[10] },
  ];
}

export function getVideoPolicySyncPerSec(): { resolution: string; perSec: number }[] {
  return [
    { resolution: "720p", perSec: SYNC_PER_SEC["720p"] },
    { resolution: "1080p", perSec: SYNC_PER_SEC["1080p"] },
  ];
}

export function enoughForCopy(credits: number): string {
  const photos = Math.floor(credits / CREDIT_PHOTO_4K);
  return `Хватит на ${photos} фото 4K или другой микс`;
}

/** Копирайт для блока Потока на лендинге. */
export const FLOW_CREDITS_PACK_BLURB =
  "1 250 кредитов на запуск — до 10 фото 4K и 2 видео, или другой микс";
