import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import type { CardVerdict } from "@/lib/seller-hub/card-verdict";
import { extractJsonLoose } from "@/lib/seller-hub/json-loose";
import type { TextResult } from "@/lib/seller-hub/card-text-score";
import type { VisionResult } from "@/lib/seller-hub/card-vision-score";
import type { TaskFact } from "@/lib/seller-hub/task-engine/types";
import type { SellerCatalogItem, SellerPromotionRow } from "@/lib/seller-hub/types";

/**
 * План действий по товару: нейросеть выбирает из закрытого списка варианты, исходя из цифр (воронка, цена и маржа, остаток, реклама,
 * оценка фото и текста, акции). Все числа в исполняемых действиях считает программа.
 */

export const PRODUCT_ADVICE_PROTOCOL_VERSION = "v2";

export type ProductFacts = {
  nmId: string;
  title: string;
  verdict: CardVerdict["verdict"];
  pillars: { traffic: string; conversion: string; buyout: string; content: string; rating: string };
  priceRub: number | null;
  basePriceRub: number | null;
  discountPercent: number | null;
  breakEvenRub: number | null;
  marginPercent: number | null;
  stock: number | null;
  coverDays: number | null;
  orders28: number | null;
  ads: { advertised: boolean; spend: number; orders: number; drr: number | null } | null;
  photo: { score: number; band: string } | null;
  text: { score: number; band: string } | null;
  promotions: { available: number; joined: number };
};

export const PRODUCT_OPTION_KINDS = ["keep", "wait", "enter_cost", "start_ads", "lower_price", "join_promo", "improve_photo", "improve_text", "restock"] as const;
export type ProductOptionKind = (typeof PRODUCT_OPTION_KINDS)[number];

export const PRODUCT_OPTION_LABEL: Record<ProductOptionKind, string> = {
  keep: "Ничего не менять",
  wait: "Подождать данных",
  enter_cost: "Указать себестоимость",
  start_ads: "Запустить тестовую рекламу",
  lower_price: "Снизить цену",
  join_promo: "Войти в акцию",
  improve_photo: "Улучшить фото",
  improve_text: "Улучшить название и описание",
  restock: "Пополнить запас",
};

export type ProductOption = { kind: ProductOptionKind; reason: string };
export type ProductAdvice = { nmId: string; headline: string; summary: string; options: ProductOption[] };

/** Шаг снижения цены и подушка маржи над безубыточной ценой. */
export const PRICE_STEP = 0.05;
export const PRICE_FLOOR_CUSHION = 1.05;
/** Запас в днях, ниже которого пополнение имеет смысл предлагать. */
export const RESTOCK_BELOW_DAYS = 14;

export function optionApplies(kind: ProductOptionKind, f: ProductFacts): boolean {
  switch (kind) {
    case "enter_cost":
      return f.marginPercent == null;
    case "start_ads":
      return (f.marginPercent ?? 0) > 0 && (f.stock ?? 0) > 0 && !(f.ads?.advertised);
    case "lower_price":
      return actionForProductOption("lower_price", f) != null;
    case "join_promo":
      return f.promotions.available > 0;
    case "improve_photo":
      return f.photo != null && f.photo.band !== "strong";
    case "improve_text":
      return f.text != null && f.text.band !== "strong";
    case "restock":
      return f.coverDays != null && f.coverDays < RESTOCK_BELOW_DAYS;
    default:
      return true;
  }
}

export function parseProductAdvice(text: string, facts: ProductFacts[]): ProductAdvice[] | null {
  const data = extractJsonLoose(text) as { advice?: unknown } | null;
  if (!data || !Array.isArray(data.advice)) return null;
  const known = new Map(facts.map((f) => [f.nmId, f]));
  const out = new Map<string, ProductAdvice>();
  for (const item of data.advice) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nmId = String(o.nmId ?? "");
    const fact = known.get(nmId);
    if (!fact) continue;
    const options: ProductOption[] = [];
    for (const raw of Array.isArray(o.options) ? o.options : []) {
      if (!raw || typeof raw !== "object") continue;
      const opt = raw as Record<string, unknown>;
      const kind = PRODUCT_OPTION_KINDS.find((k) => k === opt.kind);
      if (!kind || !optionApplies(kind, fact)) continue;
      options.push({ kind, reason: String(opt.reason ?? "").trim().slice(0, 260) });
      if (options.length >= 3) break;
    }
    out.set(nmId, { nmId, headline: String(o.headline ?? "").trim().slice(0, 140), summary: String(o.summary ?? "").trim().slice(0, 500), options });
  }
  return facts.map((f) => out.get(f.nmId) ?? { nmId: f.nmId, headline: "Нет плана", summary: "Нейросеть не вернула план по этому товару.", options: [] });
}

/** Исполняемое действие. Цену считаем так: шаг вниз, но не ниже безубыточной цены с подушкой. */
export function actionForProductOption(kind: ProductOptionKind, f: ProductFacts): AgentAction | null {
  if (kind === "start_ads") {
    if (!((f.marginPercent ?? 0) > 0 && (f.stock ?? 0) > 0) || f.ads?.advertised) return null;
    return { type: "create_campaign", nmId: f.nmId, name: `KARTO тест: ${f.title}`.slice(0, 100) };
  }
  if (kind === "lower_price") {
    if (f.priceRub == null || !(f.priceRub > 0) || f.breakEvenRub == null || !(f.breakEvenRub > 0) || f.discountPercent == null) return null;
    if (!(f.discountPercent >= 0 && f.discountPercent < 95)) return null;
    const floor = Math.ceil(f.breakEvenRub * PRICE_FLOOR_CUSHION);
    const target = Math.max(Math.round(f.priceRub * (1 - PRICE_STEP)), floor);
    if (!(target < f.priceRub)) return null;
    return { type: "price", nmId: f.nmId, targetRub: target, baseRub: Math.ceil(target / (1 - f.discountPercent / 100)), discount: f.discountPercent, currentRub: Math.round(f.priceRub), currentBaseRub: f.basePriceRub };
  }
  return null;
}

/** Собирает факты по товарам для плана: всё из данных WB, оценок нейросети и себестоимости продавца. */
export function buildProductFacts(input: {
  verdicts: CardVerdict[];
  facts: TaskFact[];
  items: SellerCatalogItem[];
  vision: Record<string, VisionResult | undefined>;
  text: Record<string, TextResult | undefined>;
  promotions: SellerPromotionRow[];
  nowMs: number;
  /** Расход и заказы по рекламе артикула за период. */
  adsByNm: Map<string, { spend: number; orders: number; orderSum: number }>;
  /** Артикулы, которые уже есть в активных кампаниях. */
  advertised: Set<string>;
}): ProductFacts[] {
  const factByNm = new Map(input.facts.map((f) => [f.nmId, f]));
  const itemByNm = new Map(input.items.map((i) => [i.externalId, i]));
  const livePromos = input.promotions.filter((p) => p.type !== "auto" && (p.endAt == null || Date.parse(p.endAt) > input.nowMs));
  return input.verdicts.flatMap((v) => {
    const f = factByNm.get(v.nmId);
    const item = itemByNm.get(v.nmId);
    if (!f) return [];
    const joined = new Set(item?.promotionIds ?? []);
    const ad = input.adsByNm.get(v.nmId);
    const vr = input.vision[v.nmId];
    const tr = input.text[v.nmId];
    const price = item?.discountedPrice != null && item.discountedPrice > 0 ? item.discountedPrice : (f.price ?? null);
    return [
      {
        nmId: v.nmId,
        title: v.title,
        verdict: v.verdict,
        pillars: { traffic: v.traffic.note, conversion: v.conversion.note, buyout: v.buyout.note, content: v.content.note, rating: v.rating.note },
        priceRub: price,
        basePriceRub: item?.price ?? null,
        discountPercent: item?.discountPercent ?? null,
        breakEvenRub: f.breakEvenPrice ?? null,
        marginPercent: f.marginPercent ?? null,
        stock: f.stockFbo != null || f.stockFbs != null ? (f.stockFbo ?? 0) + (f.stockFbs ?? 0) : null,
        coverDays: f.coverDays ?? null,
        orders28: f.orders ?? null,
        ads: input.advertised.has(v.nmId) || ad ? { advertised: input.advertised.has(v.nmId), spend: Math.round(ad?.spend ?? 0), orders: ad?.orders ?? 0, drr: ad && ad.orderSum > 0 ? Math.round((ad.spend / ad.orderSum) * 1000) / 10 : null } : null,
        photo: vr ? { score: vr.score, band: vr.band } : null,
        text: tr ? { score: tr.score, band: tr.band } : null,
        promotions: { available: livePromos.filter((p) => !joined.has(p.id)).length, joined: livePromos.filter((p) => joined.has(p.id)).length },
      },
    ];
  });
}