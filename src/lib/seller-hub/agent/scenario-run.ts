import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { buyerPrice, checkPriceChange, DEFAULT_PRICE_GUARD, type PriceGuardConfig } from "./guardrails";
import { EMPTY_PLAYBOOK_STATE, evaluatePlaybook, PLAYBOOKS, type PlaybookDecision, type PlaybookId, type PlaybookSignals, type PlaybookState, type Reason } from "./playbooks";

/**
 * Сборка предложений по ценам из сценариев: для каждого товара в охвате сценарий считает шаг, программа проверяет его по ограничителям,
 * результат становится предложением в очереди агента. Ничего не пишет в кабинет и в базу (чистая функция).
 * Состояние сценария (опорная цена, «раз в N дней») прикладывается к предложению и вступает в силу, только когда человек выполнил действие.
 */

export type ScenarioScope = { all: true } | { all?: false; nmIds: string[] };

export type ScenarioRow = {
  id: string;
  playbook: PlaybookId;
  name: string;
  scope: ScenarioScope;
  enabled: boolean;
};

export type ScenarioProduct = {
  nmId: string;
  /** Ограничители цены владельца (запас над безубыточностью, шаг, пауза). Нет: стандартные. */
  guard?: PriceGuardConfig;
  title: string;
  vendorCode: string;
  /** Цена и скидка продавца в WB сейчас. */
  base: number | null;
  discount: number | null;
  /** Безубыточная цена со скидкой продавца из досье. */
  breakEvenPrice: number | null;
  stock: number | null;
  signals: PlaybookSignals | null;
  /** Данные для ИИ-проверки: числа с понятными ключами и выдержки из свежих негативных отзывов (это данные, а не инструкции). */
  ai?: { facts: Record<string, number | null>; snippets: string[] };
  /** Рекламные кампании, в которых участвует товар (из снимка кабинета): по ним ИИ может предлагать действия по рекламе. */
  ads?: AdCampaignInfo[];
  /** Другие кампании магазина (где этого товара нет): в них товар можно добавить. */
  adsOther?: Array<{ campaignId: string; name: string; status: number | null; statusLabel: string }>;
  /** Текущий текст карточки (название берётся из title): нужен ИИ для правок и для показа «было → станет». */
  /** Акции WB, в которых товар участвует сейчас и из которых можно выйти через API. */
  promos?: PromoInfo[];
  /** Акции, открытые для товара (он пока не участвует), с условиями входа. */
  promoOpen?: PromoOpenInfo[];
  /** Скидка WB Клуба сейчас, %. */
  clubDiscount?: number | null;
  card?: { description: string; brand: string; category: string; characteristics?: Array<{ id?: number; name: string; value: string }>; categoryCharcs?: Array<{ id: number; name: string; required: boolean; type: number | null; unit: string | null; maxCount: number | null }> };
};

export type PromoInfo = { promoId: string; name: string; endAt: string | null; cohort: "boost" | "hold" | "loss" | "open"; marginPromoPercent: number | null; planPrice: number | null };

export type PromoOpenInfo = PromoInfo & { planDiscount: number | null };

export type AdCampaignInfo = { placements?: { search: boolean; recommendations: boolean } | null; campaignId: string; name: string; status: number | null; statusLabel: string; searchRub: number | null; recommendationsRub: number | null; budget: number | null; paymentType?: string | null; dailyLimit?: { limitRub: number; carryOver: boolean } | null };

export type ScenarioSkip = { nmId: string; vendorCode: string; scenario: string; reason: string };

export type ScenarioRunResult = { proposals: AgentProposal[]; skipped: ScenarioSkip[] };

/**
 * Не больше этой доли товаров одновременно получают предложение изменить цену (но не меньше MIN_BATCH). Практика селлеров: менять цену
 * на части ассортимента и смотреть реакцию, а не по всему каталогу сразу; так результат можно измерить, а риск ограничен.
 */
export const MAX_BATCH_SHARE = 0.15;

/** Сколько мест в пачке (15% товаров, не меньше трёх) для товаров этого размера. */
export function batchLimit(universe: number): number {
  return Math.max(MIN_BATCH, Math.ceil(universe * MAX_BATCH_SHARE));
}
export const MIN_BATCH = 3;

/** Важность предложения для очерёдности: защита наличия, затем негатив, затем падение заказов, затем остальное. */
function rankOf(proposal: AgentProposal): number {
  const rules = ((proposal.meta?.reasons as Array<{ rule: string }> | undefined) ?? []).map((r) => r.rule);
  if (rules.includes("protect_stock")) return 0;
  if (rules.includes("negative_reviews")) return 1;
  if (rules.includes("trend_down")) return 2;
  if (rules.includes("recover")) return 3;
  return 4;
}

const inScope = (scope: ScenarioScope, nmId: string): boolean => ("all" in scope && scope.all === true ? true : "nmIds" in scope && Array.isArray(scope.nmIds) ? scope.nmIds.includes(nmId) : false);

const rub = (v: number) => `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const sign = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%`;

export type PriceProposalSource = "algorithm" | "ai";

/**
 * Превращает «шаг в процентах» (от сценария или от инициативы ИИ) в предложение по цене: числа считает программа и они проходят ограничители.
 * Если предложение не проходит ограничители, возвращается причина.
 */
export function makePriceProposal(input: {
  scenario: ScenarioRow;
  product: ScenarioProduct;
  stepPercent: number;
  reasons: Reason[];
  nextState: PlaybookState;
  source: PriceProposalSource;
  lastChangeAt: Map<string, string>;
  nowMs: number;
  guard?: PriceGuardConfig;
}): { proposal: AgentProposal; skip?: undefined } | { proposal?: undefined; skip: string } {
  const { scenario, product, stepPercent, reasons } = input;
  if (product.base == null || product.discount == null) return { skip: "Нет цены для расчёта" };
  const currentBuyer = buyerPrice(product.base, product.discount);
  const targetBuyer = currentBuyer * (1 + stepPercent / 100);
  const check = checkPriceChange(
    {
      currentBase: product.base,
      currentDiscount: product.discount,
      proposedBase: Math.ceil(targetBuyer / (1 - product.discount / 100)),
      proposedDiscount: product.discount,
      breakEvenBuyerPrice: product.breakEvenPrice,
      stock: product.stock,
      lastChangeAt: input.lastChangeAt.get(product.nmId) ?? null,
      nowMs: input.nowMs,
    },
    input.guard ?? product.guard ?? DEFAULT_PRICE_GUARD,
  );
  if (!check.ok || !check.final) return { skip: `${sign(stepPercent)} не пройдёт проверки: ${check.issues.map((i) => i.text).join("; ")}` };
  const final = check.final;
  const newPercent = ((final.buyerPrice - currentBuyer) / currentBuyer) * 100;
  const lowering = final.buyerPrice < currentBuyer;
  return {
    proposal: {
      id: `price-${scenario.id}-${product.nmId}`,
      rule: "playbook",
      title: `${lowering ? "Снизить" : "Поднять"} цену «${product.title}»: ${rub(currentBuyer)} → ${rub(final.buyerPrice)}`,
      facts: [...reasons.map((r) => r.text), ...check.issues.filter((i) => !i.blocking).map((i) => i.text), check.floorBuyerPrice != null ? `Пол цены (безубыточность с запасом): ${rub(check.floorBuyerPrice)}.` : "Безубыточная цена неизвестна: снижение невозможно, повышение допустимо."],
      effect: lowering
        ? "Покупатели увидят более низкую цену, заказов может стать больше, маржа с каждой продажи меньше. Вернуть можно прежней ценой: запись «было → стало» сохранится, через 7 дней агент покажет, что изменилось с заказами."
        : "Покупатели увидят более высокую цену: маржа с продажи выше, заказов может стать меньше. Вернуть можно прежней ценой: запись «было → стало» сохранится, через 7 дней агент покажет, что изменилось с заказами.",
      risk: "high",
      action: { type: "price", nmId: product.nmId, targetRub: final.buyerPrice, baseRub: final.base, discount: final.discount, currentRub: Math.round(currentBuyer * 100) / 100, currentBaseRub: product.base },
      meta: {
        source: input.source,
        playbook: scenario.playbook,
        playbookTitle: PLAYBOOKS[scenario.playbook].title,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        stepPercent: Math.round(newPercent * 100) / 100,
        rulesStepPercent: stepPercent,
        reasons,
        signals: product.signals,
        guardIssues: check.issues,
        floorBuyerPrice: check.floorBuyerPrice,
        before: { base: product.base, discount: product.discount, buyerPrice: Math.round(currentBuyer * 100) / 100 },
        aiInput: product.ai ? { facts: { ...product.ai.facts, floor: check.floorBuyerPrice }, snippets: product.ai.snippets } : null,
        nextState: input.nextState,
      },
    },
  };
}

export function buildScenarioProposals(input: {
  scenarios: ScenarioRow[];
  products: ScenarioProduct[];
  states: Map<string, PlaybookState>;
  /** Когда цену товара меняли в последний раз (ISO): наши действия и правки человека. */
  lastChangeAt: Map<string, string>;
  nowMs: number;
  guard?: PriceGuardConfig;
}): ScenarioRunResult {
  const proposals: AgentProposal[] = [];
  const skipped: ScenarioSkip[] = [];
  const guard = input.guard;
  // Один товар — одно предложение по цене: если подходят два сценария, берётся тот, что стоит раньше в списке (приоритет сценариев — по порядку).
  const taken = new Set<string>();

  for (const scenario of input.scenarios) {
    if (!scenario.enabled) continue;
    for (const product of input.products) {
      if (!inScope(scenario.scope, product.nmId)) continue;
      const skip = (reason: string) => skipped.push({ nmId: product.nmId, vendorCode: product.vendorCode, scenario: scenario.name, reason });
      if (taken.has(product.nmId)) {
        skip("По этому товару уже есть предложение от другого сценария");
        continue;
      }
      if (product.base == null || product.discount == null || !product.signals) {
        skip("Нет цены или данных для расчёта");
        continue;
      }
      const state = input.states.get(`${product.nmId}:${scenario.playbook}`) ?? EMPTY_PLAYBOOK_STATE;
      const decision: PlaybookDecision = evaluatePlaybook(scenario.playbook, product.signals, state, input.nowMs);
      if (decision.stepPercent === 0) continue;

      const made = makePriceProposal({ scenario, product, stepPercent: decision.stepPercent, reasons: decision.reasons, nextState: decision.nextState, source: "algorithm", lastChangeAt: input.lastChangeAt, nowMs: input.nowMs, guard });
      if (!made.proposal) {
        skip(made.skip);
        continue;
      }
      taken.add(product.nmId);
      proposals.push(made.proposal);
    }
  }
  // Ограничение пачки: самые важные предложения идут первыми, остальные откладываются до следующего пересчёта.
  const universe = input.products.filter((p) => p.signals != null && p.base != null).length;
  const limit = batchLimit(universe);
  if (proposals.length > limit) {
    const ordered = [...proposals].sort((a, b) => rankOf(a) - rankOf(b) || Math.abs(Number(b.meta?.stepPercent ?? 0)) - Math.abs(Number(a.meta?.stepPercent ?? 0)));
    const keep = new Set(ordered.slice(0, limit).map((p) => p.id));
    for (const p of ordered.slice(limit)) {
      const nm = "nmId" in p.action ? p.action.nmId : "";
      skipped.push({ nmId: nm, vendorCode: "", scenario: String(p.meta?.scenarioName ?? ""), reason: `Отложено: цену меняем не больше чем у ${Math.round(MAX_BATCH_SHARE * 100)}% товаров за раз (${limit} из ${universe}), чтобы результат можно было измерить` });
    }
    return { proposals: ordered.filter((p) => keep.has(p.id)), skipped };
  }
  return { proposals, skipped };
}
