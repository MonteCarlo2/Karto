/**
 * Оценка фото карточки нейросетью: рубрика, расчёт балла, проверка ответа и сверка с реальными продажами.
 *
 * Принципы справедливости:
 * 1. Оценивает одна модель по подробному аналитическому протоколу (см. card-vision.ts): сначала описывает, что видит,
 *    затем разбирает шесть сторон карточки с доказательствами, сверяет себя с распределением карточек WB и только потом
 *    ставит итог и называет ожидаемую продаваемость. Итог ставит сама модель.
 * 2. Код не пересчитывает оценку, а лишь проверяет связность: итог не должен расходиться со своим же разбором по
 *    критериям больше чем на 10 баллов. Иначе берём итог разбора.
 * 3. Низкая оценка без названного видимого недостатка не принимается: такой критерий поднимается до нейтральной.
 * 4. Одинаковые фото дают одинаковую оценку: температура 0, фиксированный seed, результат хранится по содержимому фото.
 * 5. Реальные продажи сильнее мнения нейросети: если карточка значимо конвертирует лучше магазина, мы это показываем
 *    и не называем её слабой.
 */

/**
 * Версия протокола оценки. Входит в отпечаток оценки: при смене протокола старые оценки считаются устаревшими
 * и пересчитываются по явной команде.
 */
export const VISION_PROTOCOL_VERSION = "p4";

export const VISION_CRITERIA = [
  { id: "clarity", label: "Товар понятен с первого взгляда", weight: 25 },
  { id: "legibility", label: "Читаемость: миниатюра и текст", weight: 20 },
  { id: "composition", label: "Привлекает внимание: композиция, свет, цвет", weight: 20 },
  { id: "info", label: "Показаны выгоды, размер, комплект", weight: 15 },
  { id: "category", label: "Соответствует ожиданиям категории", weight: 10 },
  { id: "trust", label: "Доверие и соблюдение правил площадки", weight: 10 },
] as const;

export type VisionCriterionId = (typeof VISION_CRITERIA)[number]["id"];

/** Объективные замеры одного фото (считает программа, не нейросеть). */
export type PhotoMetrics = {
  width: number;
  height: number;
  /** Отношение силы мелких деталей после повторного размытия к исходной. Чем больше, тем размытее кадр. */
  blurRatio: number;
  /** Средняя яркость 0–255 и разброс яркости. */
  mean: number;
  std: number;
  sharpness: "sharp" | "slightly_soft" | "blurry";
  exposure: "good" | "dark" | "overexposed" | "low_contrast";
  resolution: "good" | "low";
};

export type VisionCriterion = { score: number; evidence: string };

export type VisionDefect = { what: string; fix: string };

/** Ожидаемая продаваемость фото относительно типичной карточки этой категории на маркетплейсе. */
export type SellabilityLevel = "high" | "above_average" | "average" | "below_average" | "low";

export const SELLABILITY_LABEL: Record<SellabilityLevel, string> = {
  high: "Высокая",
  above_average: "Выше средней",
  average: "Средняя",
  below_average: "Ниже средней",
  low: "Низкая",
};

export type VisionSellability = { level: SellabilityLevel; reason: string };

export type VisionRaw = {
  category: string;
  /** Что покупателю этой категории важно увидеть на фото. */
  categoryNorm: string;
  /** Что модель увидела на обложке и втором фото, до оценки. */
  observations: { cover: string; second: string } | null;
  criteria: Record<VisionCriterionId, VisionCriterion>;
  defects: VisionDefect[];
  strengths: string[];
  /** Итог, который поставила сама модель после разбора. null — не поставила. */
  overall: number | null;
  sellability: VisionSellability | null;
  confidence: "high" | "medium" | "low";
};

export type VisionBand = "strong" | "good" | "average" | "weak";

export type VisionResult = {
  /** 0–100, итог поставила модель после разбора (см. coherentScore). */
  score: number;
  band: VisionBand;
  category: string;
  categoryNorm: string;
  observations: { cover: string; second: string } | null;
  sellability: VisionSellability | null;
  criteria: Record<VisionCriterionId, VisionCriterion>;
  defects: VisionDefect[];
  strengths: string[];
  confidence: "high" | "medium" | "low";
  /** Версия протокола, по которому сделана оценка. */
  protocol?: string;
  /** Замеры программы по каждому из двух фото. */
  metrics?: Array<PhotoMetrics | null>;
  /** Отпечаток содержимого двух фото: если фото заменили, оценка устаревает. */
  contentHash?: string;
  /** Какие модели оценивали (одна или две, если была вторая проверка). */
  models: string[];
  /** true — оценку усреднили по двум моделям. */
  doubleChecked: boolean;
  /** Фактическая стоимость этой оценки в долларах по данным OpenRouter. */
  costUsd?: number;
};

export const BAND_LABEL: Record<VisionBand, string> = {
  strong: "Сильные фото",
  good: "Хорошие фото",
  average: "Средние фото",
  weak: "Слабые фото",
};

/** Ниже этого итога оценку проверяет вторая модель. */
export const SECOND_OPINION_BELOW = 50;
/** Критерий ниже этого порога обязан иметь названное доказательство. */
const EVIDENCE_REQUIRED_BELOW = 5;
const NEUTRAL = 6;

export function bandOf(score: number): VisionBand {
  if (score >= 75) return "strong";
  if (score >= 58) return "good";
  if (score >= 42) return "average";
  return "weak";
}

const clamp10 = (value: number) => Math.min(10, Math.max(0, value));

export function weightedScore(criteria: Record<VisionCriterionId, { score: number }>): number {
  const totalWeight = VISION_CRITERIA.reduce((sum, c) => sum + c.weight, 0);
  const sum = VISION_CRITERIA.reduce((acc, c) => acc + clamp10(criteria[c.id].score) * c.weight, 0);
  return Math.round((sum / totalWeight) * 10);
}

/** Достаём JSON из ответа модели и проверяем форму. null — ответ непригоден. */
export function parseVisionJson(text: string): VisionRaw | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const rawCriteria = obj.criteria;
  if (!rawCriteria || typeof rawCriteria !== "object") return null;
  const criteria = {} as Record<VisionCriterionId, VisionCriterion>;
  for (const { id } of VISION_CRITERIA) {
    const entry = (rawCriteria as Record<string, unknown>)[id];
    if (!entry || typeof entry !== "object") return null;
    const score = Number((entry as { score?: unknown }).score);
    if (!Number.isFinite(score)) return null;
    const evidence = String((entry as { evidence?: unknown }).evidence ?? "").trim().slice(0, 300);
    criteria[id] = { score: clamp10(score), evidence };
  }
  const defects = Array.isArray(obj.defects)
    ? obj.defects.flatMap((d): VisionDefect[] => {
        if (!d || typeof d !== "object") return [];
        const what = String((d as { what?: unknown }).what ?? "").trim().slice(0, 240);
        const fix = String((d as { fix?: unknown }).fix ?? "").trim().slice(0, 240);
        return what ? [{ what, fix }] : [];
      })
    : [];
  const strengths = Array.isArray(obj.strengths) ? obj.strengths.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 3) : [];
  const confidence = obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : "medium";
  const obsRaw = obj.observations && typeof obj.observations === "object" ? (obj.observations as Record<string, unknown>) : null;
  const observations = obsRaw
    ? { cover: String(obsRaw.cover ?? "").trim().slice(0, 500), second: String(obsRaw.second ?? "").trim().slice(0, 500) }
    : null;
  const overallNum = Number(obj.overall);
  const overall = Number.isFinite(overallNum) ? Math.min(100, Math.max(0, Math.round(overallNum))) : null;
  const likeRaw = obj.purchase_likelihood && typeof obj.purchase_likelihood === "object" ? (obj.purchase_likelihood as Record<string, unknown>) : null;
  const levels: SellabilityLevel[] = ["high", "above_average", "average", "below_average", "low"];
  const sellability =
    likeRaw && levels.includes(likeRaw.level as SellabilityLevel)
      ? { level: likeRaw.level as SellabilityLevel, reason: String(likeRaw.reason ?? "").trim().slice(0, 400) }
      : null;
  return {
    category: String(obj.category ?? "").trim().slice(0, 120),
    categoryNorm: String(obj.category_norm ?? "").trim().slice(0, 300),
    observations,
    criteria,
    defects: defects.slice(0, 3),
    strengths,
    overall,
    sellability,
    confidence,
  };
}

/**
 * Оценка ниже порога без названного видимого недостатка — это впечатление, а не наблюдение.
 * Поднимаем такой критерий до нейтрального: не наказываем карточку за то, что модель не смогла объяснить.
 */
export function enforceEvidence(raw: VisionRaw): VisionRaw {
  const criteria = { ...raw.criteria };
  for (const { id } of VISION_CRITERIA) {
    const c = criteria[id];
    if (c.score < EVIDENCE_REQUIRED_BELOW && c.evidence.length < 12) criteria[id] = { score: NEUTRAL, evidence: "" };
  }
  return { ...raw, criteria };
}

const SHARPNESS_TEXT = { sharp: "чёткий", slightly_soft: "слегка мягкий", blurry: "размытый" } as const;
const EXPOSURE_TEXT = { good: "нормальная", dark: "тёмный кадр", overexposed: "пересвет", low_contrast: "плоский, без контраста" } as const;

/** Замеры в виде строки для нейросети: они объективны и приоритетнее её впечатления. */
export function metricsForPrompt(metrics: Array<PhotoMetrics | null>): string {
  const lines = metrics.map((m, i) =>
    m
      ? `Фото ${i + 1}: резкость — ${SHARPNESS_TEXT[m.sharpness]} (коэффициент размытия ${m.blurRatio}; у чётких кадров 0,04–0,13, у слегка мягких 0,16–0,4, у размытых выше 0,4); яркость ${m.mean} из 255 (${EXPOSURE_TEXT[m.exposure]}), разрешение ${m.width}×${m.height}${m.resolution === "low" ? " (низкое)" : ""}.`
      : `Фото ${i + 1}: замеры недоступны.`,
  );
  return `Объективные замеры программы (им нужно доверять больше, чем впечатлению):\n${lines.join("\n")}`;
}

/**
 * Жёсткие ограничения по замерам: это факты, а не мнение. Размытый кадр не может иметь высокую читаемость и привлекательность,
 * как бы красиво ни выглядел крупный заголовок. Недостаток добавляем в список, чтобы продавец видел причину.
 * Если ограничения сработали, итог модели считаем несвязным с ними и берём итог разбора.
 */
export function applyMeasuredCaps(raw: VisionRaw, metrics: Array<PhotoMetrics | null>): VisionRaw {
  const cover = metrics[0] ?? null;
  const known = metrics.filter((m): m is PhotoMetrics => m != null);
  if (known.length === 0) return raw;
  const criteria = { ...raw.criteria };
  const defects = [...raw.defects];
  let capped = false;
  const cap = (id: VisionCriterionId, max: number, evidence: string) => {
    if (criteria[id].score > max) {
      criteria[id] = { score: max, evidence };
      capped = true;
    }
  };
  const addDefect = (what: string, fix: string) => {
    if (!defects.some((d) => d.what === what)) defects.unshift({ what, fix });
  };
  if (known.some((m) => m.sharpness === "blurry")) {
    cap("legibility", 4, "кадр размыт (измерено)");
    cap("composition", 4, "кадр размыт (измерено)");
    // Размытая подача: товар узнаётся хуже, а надписи и значки не прочитать, поэтому информация тоже недоступна.
    cap("clarity", 6, "кадр размыт (измерено)");
    cap("info", 5, "надписи на размытом кадре не прочитать (измерено)");
    addDefect("Фото размыто (измерено программой)", "Сделайте резкий кадр или загрузите оригинал в полном разрешении.");
  } else if (cover?.sharpness === "slightly_soft") {
    cap("legibility", 6, "кадр слегка мягкий (измерено)");
    cap("composition", 6, "кадр слегка мягкий (измерено)");
    addDefect("Обложка слегка мягкая, мелкие детали теряются (измерено)", "Загрузите более резкое изображение в полном размере.");
  }
  if (known.some((m) => m.exposure === "dark" || m.exposure === "overexposed")) {
    cap("composition", 5, "неудачная экспозиция (измерено)");
    addDefect(known.some((m) => m.exposure === "dark") ? "Кадр тёмный (измерено)" : "Кадр пересвечен (измерено)", "Выровняйте экспозицию: товар должен быть хорошо освещён и отделён от фона.");
  }
  if (known.some((m) => m.resolution === "low")) {
    cap("composition", 5, "низкое разрешение (измерено)");
    addDefect("Низкое разрешение фото (измерено)", "Загрузите изображение не меньше 900×1200 пикселей.");
  }
  if (!capped) return { ...raw, defects: defects.slice(0, 3) };
  return { ...raw, criteria, defects: defects.slice(0, 3), overall: null };
}

/** Итог разбора может расходиться с оценками критериев не больше чем на столько баллов, иначе он несвязный. */
export const COHERENCE_TOLERANCE = 10;

/**
 * Итог, который поставила сама модель, принимаем, если он согласуется с её же разбором по критериям.
 * Несвязный итог (например, 85 при критериях в среднем 5) или не названный моделью заменяем итогом разбора.
 * Если критерии пришлось поправить из-за отсутствия доказательств, тоже берём итог разбора: исходный итог на них опирался.
 */
export function coherentScore(
  opinions: Array<{ raw: VisionRaw }>,
  criteria: Record<VisionCriterionId, { score: number }>,
  adjusted = false,
): number {
  const fromCriteria = weightedScore(criteria);
  const overalls = opinions.map((o) => o.raw.overall);
  if (adjusted || overalls.some((v) => v == null)) return fromCriteria;
  const avg = Math.round((overalls as number[]).reduce((a, b) => a + b, 0) / overalls.length);
  return Math.abs(avg - fromCriteria) <= COHERENCE_TOLERANCE ? avg : fromCriteria;
}

/** Итог по одной или двум независимым оценкам: критерии усредняются, список недостатков объединяется. */
export function combineVision(opinions: Array<{ model: string; raw: VisionRaw }>): VisionResult | null {
  if (opinions.length === 0) return null;
  const cleaned = opinions.map((o) => ({ model: o.model, raw: enforceEvidence(o.raw) }));
  const adjusted = cleaned.some((o, i) => VISION_CRITERIA.some((c) => o.raw.criteria[c.id].score !== opinions[i]!.raw.criteria[c.id].score));
  const criteria = {} as Record<VisionCriterionId, VisionCriterion>;
  for (const { id } of VISION_CRITERIA) {
    const scores = cleaned.map((o) => o.raw.criteria[id].score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const lowest = cleaned.reduce((a, b) => (a.raw.criteria[id].score <= b.raw.criteria[id].score ? a : b));
    criteria[id] = { score: Math.round(avg * 10) / 10, evidence: lowest.raw.criteria[id].evidence };
  }
  const score = coherentScore(cleaned, criteria, adjusted);
  const seen = new Set<string>();
  const defects = cleaned
    .flatMap((o) => o.raw.defects)
    .filter((d) => {
      const key = d.what.toLowerCase().slice(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
  const confidences = cleaned.map((o) => o.raw.confidence);
  const confidence = confidences.includes("low") ? "low" : confidences.every((c) => c === "high") ? "high" : "medium";
  const first = cleaned[0]!.raw;
  return {
    score,
    band: bandOf(score),
    category: first.category,
    categoryNorm: first.categoryNorm,
    observations: first.observations,
    sellability: first.sellability,
    criteria,
    defects,
    strengths: cleaned[0]!.raw.strengths,
    confidence,
    models: cleaned.map((o) => o.model),
    doubleChecked: cleaned.length > 1,
  };
}

export type SalesEvidence = {
  /** Карточка значимо конвертирует лучше остального магазина (по тесту двух долей). */
  convertsBetter: boolean;
  /** Карточка значимо конвертирует хуже. */
  convertsWorse: boolean;
  orders: number;
};

export type Reconciled = {
  /** Что показать рядом с оценкой. null — комментарий не нужен. */
  note: string | null;
  /** Оценка нейросети противоречит продажам: ей не стоит верить на этой карточке. */
  contradicted: boolean;
};

/** Реальные продажи сильнее мнения нейросети. */
export function reconcileWithSales(result: VisionResult, sales: SalesEvidence | null): Reconciled {
  if (!sales) return { note: null, contradicted: false };
  if (result.band === "weak" || result.band === "average") {
    if (sales.convertsBetter && sales.orders >= 5) {
      return {
        note: "Нейросеть видит недостатки, но карточка продаёт лучше остального магазина. Рынок голосует за неё: относитесь к замечаниям как к идеям для проверки, а не как к приговору.",
        contradicted: true,
      };
    }
  }
  if (result.band === "strong" && sales.convertsWorse) {
    return {
      note: "Фото выглядят сильными, но конверсия карточки ниже, чем у остального магазина. Причина, вероятно, не в фото: смотрите цену, срок доставки и рейтинг.",
      contradicted: true,
    };
  }
  return { note: null, contradicted: false };
}

/** Коэффициент ранговой корреляции Спирмена. null — данных мало. */
export function spearman(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 6) return null;
  const rank = (values: number[]): number[] => {
    const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && order[j + 1]!.v === order[i]!.v) j += 1;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) ranks[order[k]!.i] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  const mean = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let k = 0; k < n; k += 1) {
    num += (rx[k]! - mean) * (ry[k]! - mean);
    dx += (rx[k]! - mean) ** 2;
    dy += (ry[k]! - mean) ** 2;
  }
  return dx > 0 && dy > 0 ? Math.round((num / Math.sqrt(dx * dy)) * 100) / 100 : null;
}

/**
 * Оценка стоимости пакета в долларах. Опора на замер по подробному протоколу (длинный промпт, два изображения):
 * около $0,003 за карточку с моделью Gemini 2.5 Flash.
 */
export const COST_PER_CARD_USD = 0.003;

export function estimateBatchCostUsd(cards: number): number {
  return Math.round(cards * COST_PER_CARD_USD * 1000) / 1000;
}