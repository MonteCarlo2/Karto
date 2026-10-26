import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bandOf,
  combineVision,
  enforceEvidence,
  estimateBatchCostUsd,
  parseVisionJson,
  reconcileWithSales,
  spearman,
  weightedScore,
  type VisionCriterionId,
  type VisionRaw,
} from "./card-vision-score";

const ids: VisionCriterionId[] = ["clarity", "legibility", "composition", "info", "category", "trust"];

function raw(scores: Partial<Record<VisionCriterionId, number>> & { all?: number }, evidence = "виден конкретный недостаток на фото", overall: number | null = null): VisionRaw {
  const criteria = {} as VisionRaw["criteria"];
  for (const id of ids) criteria[id] = { score: scores[id] ?? scores.all ?? 7, evidence };
  return { category: "Ведро", categoryNorm: "", observations: null, criteria, defects: [{ what: "тёмный фон", fix: "светлый фон" }], strengths: ["товар крупно"], overall, sellability: null, confidence: "high" };
}

describe("weightedScore", () => {
  it("взвешивает критерии: все десятки — 100, все пятёрки — 50", () => {
    assert.equal(weightedScore(raw({ all: 10 }).criteria), 100);
    assert.equal(weightedScore(raw({ all: 5 }).criteria), 50);
  });
  it("тяжёлый критерий влияет сильнее лёгкого", () => {
    const heavy = weightedScore(raw({ all: 8, clarity: 2 }).criteria);
    const light = weightedScore(raw({ all: 8, trust: 2 }).criteria);
    assert.ok(heavy < light);
  });
});

describe("bandOf", () => {
  it("границы уровней", () => {
    assert.equal(bandOf(80), "strong");
    assert.equal(bandOf(60), "good");
    assert.equal(bandOf(45), "average");
    assert.equal(bandOf(30), "weak");
  });
});

describe("parseVisionJson", () => {
  const good = JSON.stringify({
    category: "Ведро",
    criteria: Object.fromEntries(ids.map((id) => [id, { score: 7, evidence: "ok" }])),
    defects: [{ what: "блик", fix: "убрать блик" }],
    strengths: ["чёткий предмет"],
    confidence: "high",
  });
  it("разбирает ответ даже с обрамляющим текстом", () => {
    const parsed = parseVisionJson("Вот оценка:\n```json\n" + good + "\n```");
    assert.ok(parsed);
    assert.equal(parsed.criteria.clarity.score, 7);
    assert.equal(parsed.defects.length, 1);
  });
  it("мусор и неполный JSON отклоняются", () => {
    assert.equal(parseVisionJson("нет json"), null);
    assert.equal(parseVisionJson('{"criteria":{"clarity":{"score":5}}}'), null);
  });
  it("оценки обрезаются в диапазон 0–10", () => {
    const wild = JSON.stringify({ criteria: Object.fromEntries(ids.map((id) => [id, { score: 99, evidence: "x" }])) });
    assert.equal(parseVisionJson(wild)!.criteria.trust.score, 10);
  });
});

describe("справедливость", () => {
  it("низкая оценка без названного недостатка поднимается до нейтральной", () => {
    const fixed = enforceEvidence(raw({ all: 7, clarity: 2 }, ""));
    assert.equal(fixed.criteria.clarity.score, 6);
  });
  it("низкая оценка с доказательством сохраняется", () => {
    const kept = enforceEvidence(raw({ all: 7, clarity: 2 }, "товар занимает пятую часть кадра и обрезан"));
    assert.equal(kept.criteria.clarity.score, 2);
  });
  it("две модели усредняются, недостатки объединяются без дублей", () => {
    const a = raw({ all: 4 });
    const b = raw({ all: 8 });
    const result = combineVision([
      { model: "m1", raw: a },
      { model: "m2", raw: b },
    ])!;
    assert.equal(result.score, 60);
    assert.equal(result.doubleChecked, true);
    assert.equal(result.defects.length, 1);
    assert.deepEqual(result.models, ["m1", "m2"]);
  });
});

describe("итог, который ставит модель", () => {
  it("связный итог модели принимается как есть", () => {
    // критерии в среднем 8 → разбор даёт 80; модель поставила 84: расхождение в пределах допуска
    const result = combineVision([{ model: "m", raw: raw({ all: 8 }, "ok", 84) }])!;
    assert.equal(result.score, 84);
  });
  it("несвязный итог заменяется итогом разбора", () => {
    const result = combineVision([{ model: "m", raw: raw({ all: 5 }, "ok", 90) }])!;
    assert.equal(result.score, 50);
  });
  it("модель итог не назвала — итог разбора", () => {
    assert.equal(combineVision([{ model: "m", raw: raw({ all: 7 }, "ok", null) }])!.score, 70);
  });
  it("парсер читает итог, продаваемость и наблюдения", () => {
    const text = JSON.stringify({
      category: "Ведро",
      category_norm: "важны объём и количество",
      observations: { cover: "ведро крупно", second: "схема размеров" },
      criteria: Object.fromEntries(ids.map((id) => [id, { score: 8, evidence: "ok" }])),
      overall: 81,
      purchase_likelihood: { level: "above_average", reason: "понятно и крупно" },
      confidence: "high",
    });
    const parsed = parseVisionJson(text)!;
    assert.equal(parsed.overall, 81);
    assert.equal(parsed.sellability?.level, "above_average");
    assert.equal(parsed.observations?.cover, "ведро крупно");
    assert.equal(parseVisionJson(text.replace("above_average", "great"))!.sellability, null);
  });
});

describe("reconcileWithSales", () => {
  const weak = combineVision([{ model: "m", raw: raw({ all: 3 }) }])!;
  const strong = combineVision([{ model: "m", raw: raw({ all: 9 }) }])!;
  it("слабые фото при значимо лучшей конверсии: рынок сильнее нейросети", () => {
    const r = reconcileWithSales(weak, { convertsBetter: true, convertsWorse: false, orders: 20 });
    assert.equal(r.contradicted, true);
    assert.match(r.note ?? "", /Рынок голосует/);
  });
  it("сильные фото при худшей конверсии: причина вероятно не в фото", () => {
    const r = reconcileWithSales(strong, { convertsBetter: false, convertsWorse: true, orders: 20 });
    assert.equal(r.contradicted, true);
  });
  it("без данных продаж комментария нет", () => {
    assert.deepEqual(reconcileWithSales(weak, null), { note: null, contradicted: false });
    assert.equal(reconcileWithSales(weak, { convertsBetter: true, convertsWorse: false, orders: 2 }).contradicted, false);
  });
});

describe("spearman", () => {
  it("совпадающий порядок — 1, обратный — −1, мало данных — null", () => {
    const up: Array<[number, number]> = [1, 2, 3, 4, 5, 6, 7].map((x) => [x, x * 10]);
    assert.equal(spearman(up), 1);
    assert.equal(spearman(up.map(([x, y]) => [x, -y] as [number, number])), -1);
    assert.equal(spearman(up.slice(0, 4)), null);
  });
});

describe("estimateBatchCostUsd", () => {
  it("сотня карточек стоит доли доллара", () => {
    const cost = estimateBatchCostUsd(100);
    assert.ok(cost > 0 && cost < 1);
  });
});
