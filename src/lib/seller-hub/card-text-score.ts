import { shortHash } from "./data-cache";
import type { SellabilityLevel, VisionSellability } from "./card-vision-score";
import { WB_TITLE_MAX, type TextMetrics } from "./card-text-metrics";

/**
 * Оценка названия и описания карточки нейросетью. Те же принципы, что у оценки фото:
 * одна модель по подробному протоколу, итог ставит она, код проверяет связность и накладывает ограничения по замерам,
 * результат хранится по содержимому текста и не пересчитывается, пока текст не изменился.
 */

/** Версия протокола: входит в отпечаток текста, при смене старые оценки считаются устаревшими. */
export const TEXT_PROTOCOL_VERSION = "t1";

export const TEXT_CRITERIA = [
  { id: "title", label: "Название: тип товара, ключевые признаки, длина", weight: 20 },
  { id: "keywords", label: "Ключевые слова: естественно и по делу", weight: 25 },
  { id: "info", label: "Полнота информации о товаре", weight: 20 },
  { id: "structure", label: "Структура и читаемость", weight: 15 },
  { id: "volume", label: "Объём текста по норме площадки", weight: 10 },
  { id: "compliance", label: "Без запрещённого и переспама", weight: 10 },
] as const;

export type TextCriterionId = (typeof TEXT_CRITERIA)[number]["id"];
export type TextCriterion = { score: number; evidence: string };
export type TextDefect = { what: string; fix: string };
export type KeywordIdea = { word: string; why: string };

export type TextRaw = {
  category: string;
  criteria: Record<TextCriterionId, TextCriterion>;
  defects: TextDefect[];
  strengths: string[];
  /** Слова и обороты, которых не хватает карточке по смыслу товара. Это предложения нейросети, а не частотность запросов WB. */
  missingKeywords: KeywordIdea[];
  /** Предложение лучшего названия не длиннее нормы WB. */
  titleSuggestion: string | null;
  overall: number | null;
  sellability: VisionSellability | null;
  confidence: "high" | "medium" | "low";
};

export type TextBand = "strong" | "good" | "average" | "weak";

export type TextResult = {
  score: number;
  band: TextBand;
  category: string;
  criteria: Record<TextCriterionId, TextCriterion>;
  defects: TextDefect[];
  strengths: string[];
  missingKeywords: KeywordIdea[];
  titleSuggestion: string | null;
  sellability: VisionSellability | null;
  confidence: "high" | "medium" | "low";
  metrics: TextMetrics;
  contentHash: string;
  protocol: string;
  model?: string;
  costUsd?: number;
};

export const TEXT_BAND_LABEL: Record<TextBand, string> = {
  strong: "Сильный текст",
  good: "Хороший текст",
  average: "Средний текст",
  weak: "Слабый текст",
};

export function textBandOf(score: number): TextBand {
  if (score >= 75) return "strong";
  if (score >= 58) return "good";
  if (score >= 42) return "average";
  return "weak";
}

const clamp10 = (v: number) => Math.min(10, Math.max(0, v));

export function textWeightedScore(criteria: Record<TextCriterionId, { score: number }>): number {
  const total = TEXT_CRITERIA.reduce((s, c) => s + c.weight, 0);
  return Math.round((TEXT_CRITERIA.reduce((acc, c) => acc + clamp10(criteria[c.id].score) * c.weight, 0) / total) * 10);
}

/** Отпечаток содержимого: меняется при правке названия, описания или протокола. Одинаков в браузере и на сервере. */
export function textContentHash(title: string, description: string | null | undefined): string {
  return shortHash(`${TEXT_PROTOCOL_VERSION}|${title.trim()}|${(description ?? "").trim()}`);
}

export function parseTextJson(text: string): TextRaw | null {
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
  const criteria = {} as Record<TextCriterionId, TextCriterion>;
  for (const { id } of TEXT_CRITERIA) {
    const entry = (rawCriteria as Record<string, unknown>)[id];
    if (!entry || typeof entry !== "object") return null;
    const score = Number((entry as { score?: unknown }).score);
    if (!Number.isFinite(score)) return null;
    criteria[id] = { score: clamp10(score), evidence: String((entry as { evidence?: unknown }).evidence ?? "").trim().slice(0, 300) };
  }
  const list = <T,>(value: unknown, map: (item: Record<string, unknown>) => T | null, max: number): T[] =>
    Array.isArray(value) ? value.flatMap((v) => (v && typeof v === "object" ? [map(v as Record<string, unknown>)] : [])).filter((v): v is T => v != null).slice(0, max) : [];
  const defects = list<TextDefect>(obj.defects, (d) => {
    const what = String(d.what ?? "").trim().slice(0, 240);
    return what ? { what, fix: String(d.fix ?? "").trim().slice(0, 240) } : null;
  }, 3);
  const missingKeywords = list<KeywordIdea>(obj.missing_keywords, (k) => {
    const word = String(k.word ?? "").trim().slice(0, 60);
    return word ? { word, why: String(k.why ?? "").trim().slice(0, 160) } : null;
  }, 8);
  const strengths = Array.isArray(obj.strengths) ? obj.strengths.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 3) : [];
  const overallNum = Number(obj.overall);
  const levels: SellabilityLevel[] = ["high", "above_average", "average", "below_average", "low"];
  const like = obj.purchase_likelihood && typeof obj.purchase_likelihood === "object" ? (obj.purchase_likelihood as Record<string, unknown>) : null;
  const suggestion = typeof obj.title_suggestion === "string" ? obj.title_suggestion.trim().slice(0, 120) : "";
  return {
    category: String(obj.category ?? "").trim().slice(0, 120),
    criteria,
    defects,
    strengths,
    missingKeywords,
    titleSuggestion: suggestion && suggestion.length <= WB_TITLE_MAX ? suggestion : null,
    overall: Number.isFinite(overallNum) ? Math.min(100, Math.max(0, Math.round(overallNum))) : null,
    sellability: like && levels.includes(like.level as SellabilityLevel) ? { level: like.level as SellabilityLevel, reason: String(like.reason ?? "").trim().slice(0, 400) } : null,
    confidence: obj.confidence === "high" || obj.confidence === "low" ? obj.confidence : "medium",
  };
}

/**
 * Ограничения по замерам: это факты. Запрещённое содержимое, крик заглавными, слишком короткий или пустой текст
 * не оставляют высоких оценок соответствующим сторонам, как бы гладко ни был написан текст.
 */
export function applyTextCaps(raw: TextRaw, m: TextMetrics): TextRaw {
  const criteria = { ...raw.criteria };
  const defects = [...raw.defects];
  let capped = false;
  const cap = (id: TextCriterionId, max: number, evidence: string) => {
    if (criteria[id].score > max) {
      criteria[id] = { score: max, evidence };
      capped = true;
    }
  };
  const add = (what: string, fix: string) => {
    if (!defects.some((d) => d.what === what)) defects.unshift({ what, fix });
  };
  if (m.descriptionLength === 0) {
    cap("volume", 0, "описания нет (измерено)");
    cap("info", 2, "описания нет (измерено)");
    cap("keywords", 3, "описания нет (измерено)");
    add("Описания нет (измерено)", "Добавьте описание от 1000 знаков: назначение, материал, размер, комплектация, преимущества.");
  } else if (m.descriptionLength < 400) {
    cap("volume", 3, "описание очень короткое (измерено)");
    add(`Описание слишком короткое: ${m.descriptionLength} знаков (измерено)`, "Доведите описание до 1000 знаков и более, добавив конкретные сведения о товаре.");
  } else if (m.descriptionLength < 800) {
    cap("volume", 6, "описание короче нормы (измерено)");
  }
  if (m.descriptionLength > 5000) {
    cap("volume", 3, "описание длиннее допустимого (измерено)");
    add("Описание длиннее 5000 знаков (измерено)", "Сократите описание: WB не принимает больше 5000 знаков.");
  }
  if (m.titleOverWb) {
    cap("title", 4, `название длиннее ${WB_TITLE_MAX} знаков (измерено)`);
    add(`Название длиннее ${WB_TITLE_MAX} знаков (измерено)`, `Сократите название до ${WB_TITLE_MAX} знаков, оставив тип товара и главные признаки.`);
  }
  if (m.forbidden.length > 0) {
    cap("compliance", 3, `найдено запрещённое: ${m.forbidden.join(", ")} (измерено)`);
    add(`Запрещённое в тексте: ${m.forbidden.join(", ")} (измерено)`, "Уберите контакты, ссылки и цены: это нарушение правил площадки.");
  }
  if (m.shouting) {
    cap("compliance", 5, "сплошные заглавные (измерено)");
    cap("structure", 6, "сплошные заглавные (измерено)");
    add("Текст набран заглавными (измерено)", "Перепишите обычным регистром: крик ухудшает читаемость.");
  }
  if (m.overused.length > 0) {
    cap("keywords", 5, `переспам словом «${m.overused[0]!.word}» (измерено)`);
    cap("compliance", 6, "переспам ключами (измерено)");
    add(`Слово «${m.overused[0]!.word}» повторяется ${m.overused[0]!.count} раз: похоже на переспам (измерено)`, "Замените часть повторов синонимами и описывайте свойства, а не перечисляйте слова.");
  }
  if (!capped) return { ...raw, defects: defects.slice(0, 3) };
  return { ...raw, criteria, defects: defects.slice(0, 3), overall: null };
}

/** Допустимое расхождение итога модели с её же разбором по критериям. */
export const TEXT_COHERENCE_TOLERANCE = 10;

export function buildTextResult(raw: TextRaw, extra: { metrics: TextMetrics; title: string; description: string | null | undefined; model?: string; costUsd?: number }): TextResult {
  const fromCriteria = textWeightedScore(raw.criteria);
  const score = raw.overall != null && Math.abs(raw.overall - fromCriteria) <= TEXT_COHERENCE_TOLERANCE ? raw.overall : fromCriteria;
  return {
    score,
    band: textBandOf(score),
    category: raw.category,
    criteria: raw.criteria,
    defects: raw.defects,
    strengths: raw.strengths,
    missingKeywords: raw.missingKeywords,
    titleSuggestion: raw.titleSuggestion,
    sellability: raw.sellability,
    confidence: raw.confidence,
    metrics: extra.metrics,
    contentHash: textContentHash(extra.title, extra.description),
    protocol: TEXT_PROTOCOL_VERSION,
    model: extra.model,
    costUsd: extra.costUsd,
  };
}
