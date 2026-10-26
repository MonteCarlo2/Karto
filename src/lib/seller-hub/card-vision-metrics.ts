import sharp from "sharp";
import type { PhotoMetrics } from "./card-vision-score";

/**
 * Объективные замеры фото программой. Нейросети плохо замечают размытость и затемнение, а числа не врут.
 *
 * Резкость: отношение силы мелких деталей (лапласиан) у кадра, слегка размытого повторно, к силе мелких деталей у
 * исходного кадра. У чёткого кадра повторное размытие стирает много деталей (отношение мало), у уже размытого почти не
 * меняет (отношение велико). Метод не зависит от содержимого: инфографика и спокойное фото дают сопоставимые значения.
 * Проверено на реальных карточках: чёткие кадры 0,04–0,13; размытие 1,5 — 0,22–0,27; размытие 3 и выше — 0,56–0,85.
 */

export const BLUR_SOFT_FROM = 0.16;
export const BLUR_BLURRY_FROM = 0.4;
/** Средняя яркость (0–255) ниже — кадр тёмный; выше — пересвет. */
export const DARK_BELOW = 90;
export const OVEREXPOSED_ABOVE = 235;
/** Разброс яркости ниже — кадр плоский, без контраста. */
export const LOW_CONTRAST_BELOW = 35;
/** Меньшая сторона в пикселях ниже — низкое разрешение (WB рекомендует от 900×1200). */
export const LOW_RESOLUTION_WIDTH = 700;

const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];
const WIDTH = 600;

/** Дисперсия отклика лапласиана на серой копии кадра шириной 600 пикселей (считаем сами по байтам). */
async function laplacianVariance(image: Buffer): Promise<number> {
  const lap = await sharp(image)
    .resize({ width: WIDTH })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: LAPLACIAN, scale: 1, offset: 128 })
    .raw()
    .toBuffer();
  let sum = 0;
  for (let i = 0; i < lap.length; i += 1) sum += lap[i]!;
  const mean = sum / lap.length;
  let sq = 0;
  for (let i = 0; i < lap.length; i += 1) sq += (lap[i]! - mean) ** 2;
  return sq / lap.length;
}
export function classifyMetrics(input: { blurRatio: number; mean: number; std: number; width: number }): Pick<PhotoMetrics, "sharpness" | "exposure" | "resolution"> {
  return {
    sharpness: input.blurRatio >= BLUR_BLURRY_FROM ? "blurry" : input.blurRatio >= BLUR_SOFT_FROM ? "slightly_soft" : "sharp",
    exposure:
      input.mean < DARK_BELOW ? "dark" : input.mean > OVEREXPOSED_ABOVE ? "overexposed" : input.std < LOW_CONTRAST_BELOW ? "low_contrast" : "good",
    resolution: input.width < LOW_RESOLUTION_WIDTH ? "low" : "good",
  };
}

export async function measurePhoto(image: Buffer): Promise<PhotoMetrics> {
  const meta = await sharp(image).metadata();
  const sourceVar = await laplacianVariance(image);
  // Тот же кадр после лёгкого повторного размытия: у чёткого он теряет много мелких деталей, у размытого почти ничего.
  const reblurred = await sharp(image).resize({ width: WIDTH }).blur(1.2).png().toBuffer();
  const blurredVar = await laplacianVariance(reblurred);
  const stats = await sharp(image).resize({ width: WIDTH }).greyscale().stats();
  const blurRatio = sourceVar < 1 ? 1 : blurredVar / sourceVar;
  const mean = stats.channels[0]!.mean;
  const std = stats.channels[0]!.stdev;
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    blurRatio: Math.round(blurRatio * 1000) / 1000,
    mean: Math.round(mean),
    std: Math.round(std),
    ...classifyMetrics({ blurRatio, mean, std, width: meta.width ?? 0 }),
  };
}
/** Достаём байты из data URL. */
export function bufferFromDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}
