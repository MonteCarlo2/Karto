import { AD_BID_MAX_RAISE } from "@/lib/seller-hub/ads-bid";
import { suggestedDepositRub } from "@/lib/seller-hub/ads-advisor";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import type { AdvisorProduct } from "@/lib/seller-hub/ads-advisor";
import type { BidRow } from "@/lib/seller-hub/ads-bids";
import { extractJsonLoose } from "@/lib/seller-hub/json-loose";
import type { SellerAdCampaignRow, SellerAdCampaignStats } from "@/lib/seller-hub/types";

/**
 * Разбор рекламных кампаний: факты по каждой кампании (считает программа), вердикт и варианты действий (предлагает нейросеть
 * из закрытого списка), исполняемое действие и все числа в нём снова считает программа, а не нейросеть.
 */

export const REVIEW_PROTOCOL_VERSION = "v2";

export type ProductAdFacts = {
  nmId: string;
  title: string;
  spend: number;
  orders: number;
  orderSum: number;
  /** ДРР товара, %: расход ÷ сумма заказов по рекламе. null — заказов нет. */
  drr: number | null;
  marginPercent: number | null;
  stock: number | null;
  /** Текущая ставка в поиске, ₽; конкурентная ставка WB, ₽. */
  bidRub: number | null;
  competitiveRub: number | null;
};

export type CampaignFacts = {
  id: string;
  name: string;
  status: number | null;
  paymentType: string | null;
  bidType: string | null;
  budget: number | null;
  days: number;
  spend: number;
  orders: number;
  orderSum: number;
  views: number;
  clicks: number;
  ctr: number | null;
  drr: number | null;
  cpo: number | null;
  avgDailySpend: number;
  runwayDays: number | null;
  prev: { spend: number; orders: number; orderSum: number; drr: number | null } | null;
  products: ProductAdFacts[];
  /** Средняя цена заказа по рекламе магазина, ₽. */
  storeCpo: number | null;
  /** Предварительный вердикт по правилам: подсказка нейросети, не истина. */
  ruleVerdict: "no_data" | "bad" | "good" | "neutral";
};

/** Меньше стольких кликов за период: вывод об эффективности делать рано. */
export const MIN_CLICKS_FOR_VERDICT = 30;

export function ruleVerdictOf(f: Pick<CampaignFacts, "clicks" | "spend" | "orders" | "drr" | "storeCpo" | "products">): CampaignFacts["ruleVerdict"] {
  if (f.clicks < MIN_CLICKS_FOR_VERDICT) return "no_data";
  const margins = f.products.map((p) => p.marginPercent).filter((m): m is number => m != null);
  const margin = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
  if (f.orders === 0 && f.storeCpo != null && f.spend >= f.storeCpo * 2) return "bad";
  if (margin != null && f.drr != null && f.drr > margin) return "bad";
  if (margin != null && f.drr != null && f.orders >= 3 && f.drr <= margin * 0.7) return "good";
  return "neutral";
}

/** Закрытый список вариантов, из которых нейросеть выбирает. Остальное она предлагать не может. */
export const OPTION_KINDS = [
  "keep",
  "wait",
  "pause",
  "deposit",
  "lower_bid",
  "raise_bid",
  "remove_product",
  "lower_price",
  "join_promo",
  "improve_card",
  "new_campaign_cpc",
] as const;
export type OptionKind = (typeof OPTION_KINDS)[number];

export type ReviewOption = { kind: OptionKind; nmId: string | null; reason: string };
export type ReviewVerdict = "good" | "improve" | "bad" | "no_data";
export type CampaignReview = { id: string; verdict: ReviewVerdict; headline: string; summary: string; options: ReviewOption[] };

export const OPTION_LABEL: Record<OptionKind, string> = {
  keep: "Ничего не менять",
  wait: "Подождать данных",
  pause: "Поставить кампанию на паузу",
  deposit: "Пополнить бюджет",
  lower_bid: "Снизить ставку",
  raise_bid: "Поднять ставку",
  remove_product: "Убрать товар из кампании",
  lower_price: "Снизить цену товара",
  join_promo: "Войти в акцию",
  improve_card: "Улучшить карточку",
  new_campaign_cpc: "Создать кампанию с оплатой за клик",
};

export function parseReviews(text: string, facts: CampaignFacts[]): CampaignReview[] | null {
  const data = extractJsonLoose(text) as { reviews?: unknown } | null;
  if (!data || !Array.isArray(data.reviews)) return null;
  const known = new Map(facts.map((f) => [f.id, f]));
  const out = new Map<string, CampaignReview>();
  for (const item of data.reviews) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = String(o.id ?? "");
    const fact = known.get(id);
    if (!fact) continue;
    const verdict = o.verdict === "good" || o.verdict === "improve" || o.verdict === "bad" || o.verdict === "no_data" ? o.verdict : null;
    if (!verdict) continue;
    const productIds = new Set(fact.products.map((p) => p.nmId));
    const options: ReviewOption[] = [];
    for (const raw of Array.isArray(o.options) ? o.options : []) {
      if (!raw || typeof raw !== "object") continue;
      const opt = raw as Record<string, unknown>;
      const kind = OPTION_KINDS.find((k) => k === opt.kind);
      if (!kind) continue;
      const nmId = opt.nmId != null && productIds.has(String(opt.nmId)) ? String(opt.nmId) : null;
      // Варианты про конкретный товар без товара из кампании отбрасываем: нейросеть не должна придумывать цели.
      if (["lower_bid", "raise_bid", "remove_product", "lower_price", "join_promo", "improve_card"].includes(kind) && !nmId) continue;
      // Вариант должен быть применим к фактам: поднимать ставку можно только ниже конкурентной, снижать только заданную.
      const target = nmId ? fact.products.find((p) => p.nmId === nmId) : null;
      if (kind === "raise_bid" && !(target && target.bidRub != null && target.competitiveRub != null && target.bidRub < target.competitiveRub)) continue;
      if (kind === "lower_bid" && !(target && target.bidRub != null && target.bidRub > 0)) continue;
      if (kind === "remove_product" && fact.products.length <= 1) continue;
      options.push({ kind, nmId, reason: String(opt.reason ?? "").trim().slice(0, 260) });
      if (options.length >= 3) break;
    }
    out.set(id, { id, verdict, headline: String(o.headline ?? "").trim().slice(0, 140), summary: String(o.summary ?? "").trim().slice(0, 500), options });
  }
  // Кампания без ответа модели не пропадает: показываем «нет разбора», а не молчим.
  return facts.map((f) => out.get(f.id) ?? { id: f.id, verdict: "no_data" as const, headline: "Нет разбора", summary: "Нейросеть не вернула разбор этой кампании.", options: [] });
}

/**
 * Исполняемое действие для варианта. Все числа считаем здесь: ставка — на шаг от текущей в границах WB, пополнение — по расходу.
 * null — вариант без кнопки (совет или переход в другой раздел).
 */
export function actionForOption(option: ReviewOption, facts: CampaignFacts): AgentAction | null {
  const product = option.nmId ? facts.products.find((p) => p.nmId === option.nmId) : null;
  const cpmManual = facts.paymentType === "cpm" && (facts.bidType == null || facts.bidType === "manual") && (facts.status === 9 || facts.status === 4 || facts.status === 11);
  switch (option.kind) {
    case "pause":
      return facts.status === 9 ? { type: "pause", campaignId: facts.id } : null;
    case "deposit":
      return facts.status === 9 || facts.status === 4 || facts.status === 11 ? { type: "deposit", campaignId: facts.id, sumRub: suggestedDepositRub(facts.avgDailySpend) } : null;
    case "remove_product":
      return product && facts.products.length > 1 ? { type: "remove_nm", campaignId: facts.id, nmId: product.nmId } : null;
    case "lower_bid": {
      if (!cpmManual || !product || !(product.bidRub && product.bidRub > 0)) return null;
      const next = Math.round(product.bidRub * 0.8 * 100) / 100;
      return next > 0 && next < product.bidRub ? { type: "bid", advertId: facts.id, nmId: product.nmId, bidRub: next } : null;
    }
    case "raise_bid": {
      if (!cpmManual || !product || !(product.bidRub && product.bidRub > 0) || product.competitiveRub == null || product.competitiveRub <= product.bidRub) return null;
      const cap = Math.min(product.bidRub * 1.25, product.bidRub * AD_BID_MAX_RAISE);
      const next = Math.round(Math.min(product.competitiveRub, cap) * 100) / 100;
      return next > product.bidRub ? { type: "bid", advertId: facts.id, nmId: product.nmId, bidRub: next } : null;
    }
    default:
      return null;
  }
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const pctOf = (num: number, den: number): number | null => (den > 0 ? round1((num / den) * 100) : null);

/** Факты по каждой активной или готовой кампании для разбора. Только данные WB и себестоимость продавца. */
export function buildCampaignFacts(input: {
  campaigns: SellerAdCampaignRow[];
  stats: SellerAdCampaignStats[];
  prevStats?: SellerAdCampaignStats[] | null;
  products: AdvisorProduct[];
  bids: BidRow[];
  days: number;
  storeCpo: number | null;
}): CampaignFacts[] {
  const statsById = new Map(input.stats.map((s) => [s.advertId, s]));
  const prevById = new Map((input.prevStats ?? []).map((s) => [s.advertId, s]));
  const productById = new Map(input.products.map((p) => [p.nmId, p]));
  const bidByPair = new Map(input.bids.map((b) => [`${b.advertId}:${b.nmId}`, b]));
  const out: CampaignFacts[] = [];
  for (const c of input.campaigns) {
    if (c.status !== 9 && c.status !== 11 && c.status !== 4) continue;
    const s = statsById.get(c.id);
    if (!s && c.status !== 9) continue;
    const spend = s?.spend ?? 0;
    const orders = s?.orders ?? 0;
    const orderSum = s?.orderSum ?? 0;
    const clicks = s?.clicks ?? 0;
    const views = s?.views ?? 0;
    const avgDailySpend = spend / Math.max(1, input.days);
    const products: ProductAdFacts[] = Object.entries(s?.byNm ?? {})
      .map(([nmId, row]) => {
        const p = productById.get(nmId);
        const b = bidByPair.get(`${c.id}:${nmId}`);
        return {
          nmId,
          title: p?.title || row.name || nmId,
          spend: Math.round(row.spend),
          orders: row.orders,
          orderSum: Math.round(row.orderSum),
          drr: pctOf(row.spend, row.orderSum),
          marginPercent: p?.marginPercent ?? null,
          stock: p?.stock ?? null,
          bidRub: b?.currentRub ?? (c.bids ?? []).find((x) => x.nmId === nmId)?.searchRub ?? null,
          competitiveRub: b?.competitiveRub ?? null,
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8);
    const prev = prevById.get(c.id);
    const base = {
      id: c.id,
      name: c.name ?? c.id,
      status: c.status ?? null,
      paymentType: c.paymentType ?? null,
      bidType: c.bidType ?? null,
      budget: c.budget ?? null,
      days: input.days,
      spend: Math.round(spend),
      orders,
      orderSum: Math.round(orderSum),
      views,
      clicks,
      ctr: pctOf(clicks, views),
      drr: pctOf(spend, orderSum),
      cpo: orders > 0 ? Math.round(spend / orders) : null,
      avgDailySpend: Math.round(avgDailySpend),
      runwayDays: c.budget != null && avgDailySpend > 0 ? round1(c.budget / avgDailySpend) : null,
      prev: prev ? { spend: Math.round(prev.spend), orders: prev.orders, orderSum: Math.round(prev.orderSum), drr: pctOf(prev.spend, prev.orderSum) } : null,
      products,
      storeCpo: input.storeCpo != null ? Math.round(input.storeCpo) : null,
    };
    out.push({ ...base, ruleVerdict: ruleVerdictOf(base) });
  }
  return out;
}