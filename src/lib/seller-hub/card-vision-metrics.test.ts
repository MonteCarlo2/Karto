import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { classifyMetrics, measurePhoto } from "./card-vision-metrics";
import { applyMeasuredCaps, type PhotoMetrics, type VisionCriterionId, type VisionRaw } from "./card-vision-score";

/** Кадр с резкими деталями: шахматка и крупный и мелкий узор. */
async function sharpImage(): Promise<Buffer> {
  const width = 900;
  const height = 1200;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = ((Math.floor(x / 6) + Math.floor(y / 6)) % 2 === 0 ? 40 : 215) + ((x * 7 + y * 3) % 9);
      const o = (y * width + x) * 3;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

describe("measurePhoto", () => {
  it("чёткий кадр — sharp, размытый — blurry, затемнённый — dark", async () => {
    const img = await sharpImage();
    assert.equal((await measurePhoto(img)).sharpness, "sharp");
    const blurred = await sharp(img).blur(7).png().toBuffer();
    assert.equal((await measurePhoto(blurred)).sharpness, "blurry");
    const dark = await sharp(img).modulate({ brightness: 0.3 }).png().toBuffer();
    assert.equal((await measurePhoto(dark)).exposure, "dark");
  });
});

describe("classifyMetrics", () => {
  it("границы резкости, экспозиции и разрешения", () => {
    assert.equal(classifyMetrics({ blurRatio: 0.1, mean: 150, std: 60, width: 900 }).sharpness, "sharp");
    assert.equal(classifyMetrics({ blurRatio: 0.25, mean: 150, std: 60, width: 900 }).sharpness, "slightly_soft");
    assert.equal(classifyMetrics({ blurRatio: 0.6, mean: 150, std: 60, width: 900 }).sharpness, "blurry");
    assert.equal(classifyMetrics({ blurRatio: 0.1, mean: 60, std: 60, width: 900 }).exposure, "dark");
    assert.equal(classifyMetrics({ blurRatio: 0.1, mean: 245, std: 20, width: 900 }).exposure, "overexposed");
    assert.equal(classifyMetrics({ blurRatio: 0.1, mean: 150, std: 20, width: 900 }).exposure, "low_contrast");
    assert.equal(classifyMetrics({ blurRatio: 0.1, mean: 150, std: 60, width: 500 }).resolution, "low");
  });
});

const ids: VisionCriterionId[] = ["clarity", "legibility", "composition", "info", "category", "trust"];
const rawOf = (score: number): VisionRaw => ({
  category: "Ведро",
  categoryNorm: "",
  observations: null,
  criteria: Object.fromEntries(ids.map((id) => [id, { score, evidence: "ok" }])) as VisionRaw["criteria"],
  defects: [],
  strengths: [],
  overall: 88,
  sellability: null,
  confidence: "high",
});
const m = (patch: Partial<PhotoMetrics>): PhotoMetrics => ({ width: 900, height: 1200, blurRatio: 0.1, mean: 150, std: 60, sharpness: "sharp", exposure: "good", resolution: "good", ...patch });

describe("applyMeasuredCaps", () => {
  it("размытый кадр ограничивает читаемость и привлекательность, добавляет недостаток и сбрасывает итог модели", () => {
    const out = applyMeasuredCaps(rawOf(9), [m({ sharpness: "blurry" }), m({})]);
    assert.equal(out.criteria.legibility.score, 4);
    assert.equal(out.criteria.composition.score, 4);
    // Товар на размытом кадре узнаётся хуже, а надписи не прочитать: понятность и информативность тоже ограничены.
    assert.equal(out.criteria.clarity.score, 6);
    assert.equal(out.criteria.info.score, 5);
    assert.equal(out.criteria.category.score, 9);
    assert.equal(out.overall, null);
    assert.match(out.defects[0]!.what, /размыто/);
  });
  it("тёмный кадр: привлекательность не выше 5", () => {
    const out = applyMeasuredCaps(rawOf(9), [m({ exposure: "dark" }), m({})]);
    assert.equal(out.criteria.composition.score, 5);
    assert.match(out.defects[0]!.what, /тёмный/);
  });
  it("чёткие нормальные кадры не трогаем, оценка модели остаётся", () => {
    const out = applyMeasuredCaps(rawOf(9), [m({}), m({})]);
    assert.equal(out.overall, 88);
    assert.equal(out.criteria.composition.score, 9);
  });
  it("замеров нет — оценка как есть; уже низкую оценку не повышаем", () => {
    assert.equal(applyMeasuredCaps(rawOf(9), [null, null]).overall, 88);
    assert.equal(applyMeasuredCaps(rawOf(2), [m({ sharpness: "blurry" }), m({})]).criteria.composition.score, 2);
  });
});
