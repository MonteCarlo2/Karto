import type { SupabaseClient } from "@supabase/supabase-js";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { taskFactsFromSnapshot } from "@/lib/seller-hub/task-engine/facts";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { PlaybookState } from "./playbooks";
import { loadOwnerPriceGuard } from "./owner-rules";
import { buildScenarioProposals, type AdCampaignInfo, type ScenarioProduct, type ScenarioRow, type ScenarioRunResult, type ScenarioScope } from "./scenario-run";
import { loadFeedbackRatings, loadOrdersByNm, playbookSignals } from "./signals";

/**
 * Сбор входных данных для сценариев цен из снимка кабинета и нашей базы, затем сборка предложений.
 * Общая часть для фонового пересчёта и для скрипта «что бы сделал» (scripts/seller-hub-agent-dryrun.ts).
 */

const MARKETPLACE = "wildberries";
const HISTORY_DAYS = 40;

/** Свежие негативные отзывы по товарам: короткие выдержки для ИИ. Берём оценки 1–3★, видимые на карточке, не старше 30 дней. */
export async function loadNegativeSnippets(db: SupabaseClient, userId: string, nowMs: number): Promise<Map<string, string[]>> {
  const since = new Date(nowMs - 30 * 86_400_000).toISOString();
  const { data, error } = await db
    .from("seller_hub_feedbacks")
    .select("nm_id, rating, created_at, counts_on_card, cons, body_text")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .lte("rating", 3)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Негативные отзывы не прочитались: ${error.message}`);
  const out = new Map<string, string[]>();
  for (const row of data ?? []) {
    if (row.counts_on_card === false) continue;
    const text = String((row.cons as string | null) || (row.body_text as string | null) || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!text) continue;
    const nm = row.nm_id as string;
    const list = out.get(nm) ?? [];
    if (list.length < 3) list.push(`${row.rating}★: ${text}`);
    out.set(nm, list);
  }
  return out;
}

/** Товары с сигналами для сценариев по снимку. Отзывы и заказы по дням читаются из нашей базы. */
export async function loadScenarioProducts(db: SupabaseClient, userId: string, snapshot: SellerCatalogSnapshot, nowMs: number): Promise<ScenarioProduct[]> {
  const todayKey = moscowDateKey(nowMs);
  const since = new Date(nowMs - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [ordersByNm, ratings, snippets] = await Promise.all([loadOrdersByNm(db, userId, since), loadFeedbackRatings(db, userId), loadNegativeSnippets(db, userId, nowMs).catch(() => new Map<string, string[]>())]);
  const feedbacksRead = snapshot.feedbacks != null && (snapshot.feedbacks.status === "ok" || snapshot.feedbacks.status === "partial");
  const facts = taskFactsFromSnapshot(snapshot, { taxRatePercent: null }).products;
  const itemByNm = new Map(snapshot.items.map((item) => [String(item.externalId), item]));
  const adsByNm = new Map<string, AdCampaignInfo[]>();
  for (const c of snapshot.ads?.campaigns ?? []) {
    for (const bid of c.bids ?? []) {
      const list = adsByNm.get(bid.nmId) ?? [];
      list.push({ placements: c.placements ?? null, campaignId: c.id, name: c.name ?? `Кампания ${c.id}`, status: c.status ?? null, statusLabel: c.statusLabel ?? "", searchRub: bid.searchRub ?? null, recommendationsRub: bid.recommendationsRub ?? null, budget: c.budget ?? null, paymentType: c.paymentType ?? null, dailyLimit: c.dailyLimit ? { limitRub: c.dailyLimit.limitRub, carryOver: c.dailyLimit.carryOver } : null });
      adsByNm.set(bid.nmId, list);
    }
  }

  const ownerGuard = await loadOwnerPriceGuard(db, userId).catch(() => undefined);
  return facts.map((fact) => {
    const item = itemByNm.get(fact.nmId);
    const stock = fact.stockFbo != null || fact.stockFbs != null ? (fact.stockFbo ?? 0) + (fact.stockFbs ?? 0) : null;
    const signals = playbookSignals(
      {
        nmId: fact.nmId,
        discountedPrice: item?.discountedPrice ?? null,
        stock,
        coverDays: fact.coverDays,
        deadStock: fact.funnelStatus === "ok" && fact.orders === 0 && fact.priorOrders === 0,
        cartPercent: fact.addToCartPercent,
        openCount: fact.openCount,
        ordersByDate: ordersByNm.get(fact.nmId) ?? new Map<string, number>(),
        feedbacks: feedbacksRead ? (ratings.get(fact.nmId) ?? []) : null,
      },
      todayKey,
      nowMs,
    );
    return {
      nmId: fact.nmId,
      title: fact.title,
      vendorCode: fact.vendorCode,
      base: item?.price ?? null,
      discount: item?.discountPercent ?? null,
      breakEvenPrice: fact.breakEvenPrice,
      stock,
      signals,
      ads: adsByNm.get(fact.nmId) ?? [],
      adsOther: (snapshot.ads?.campaigns ?? []).filter((c) => !(c.bids ?? []).some((b) => b.nmId === fact.nmId)).map((c) => ({ campaignId: c.id, name: c.name ?? `Кампания ${c.id}`, status: c.status ?? null, statusLabel: c.statusLabel ?? "" })),
      clubDiscount: item?.clubDiscount ?? null,
      promoOpen: (fact.promoOffers ?? [])
        .filter((o) => o.inPromo === false && o.canManage && o.planPrice != null && o.cohort !== "loss")
        .map((o) => ({ promoId: o.promoId, name: o.promoName, endAt: o.endAt, cohort: o.cohort, marginPromoPercent: o.marginPromoPercent, planPrice: o.planPrice, planDiscount: snapshot.promotionEntryTerms?.[o.promoId]?.[fact.nmId]?.planDiscount ?? null })),
      promos: (fact.promoOffers ?? []).filter((o) => o.inPromo === true && o.canManage).map((o) => ({ promoId: o.promoId, name: o.promoName, endAt: o.endAt, cohort: o.cohort, marginPromoPercent: o.marginPromoPercent, planPrice: o.planPrice })),
      card: { description: item?.description ?? "", brand: item?.brand ?? "", category: item?.category ?? "", characteristics: item?.characteristics ?? [], categoryCharcs: item?.categoryCharcs ?? [] },
      ai: signals
        ? {
            facts: {
              price_buyer: signals.buyerPrice,
              break_even: fact.breakEvenPrice,
              gap_to_break_even_pct: fact.breakEvenPrice != null && signals.buyerPrice > 0 ? Math.round((fact.breakEvenPrice / signals.buyerPrice - 1) * 1000) / 10 : null,
              stock,
              oos_days: signals.oosDays,
              turnover_days: signals.turnoverDays,
              opens_28d: fact.openCount,
              cart_pct: fact.addToCartPercent,
              cart_to_order_pct: fact.cartToOrderPercent,
              orders_28d: fact.orders,
              orders_prev_28d: fact.priorOrders,
              decline_days: signals.declineDays,
              rise_days: signals.riseDays,
              rating: fact.reviewRatingAvg,
              negative_recent: signals.recentNegative == null ? null : signals.recentNegative ? 1 : 0,
              margin_pct: fact.marginPercent,
              jam_data: snapshot.jam?.active === true ? 1 : snapshot.jam?.active === false ? 0 : null,
            },
            snippets: snippets.get(fact.nmId) ?? [],
          }
        : undefined,
    };
  }).map((p) => ({ ...p, guard: ownerGuard }));
}

export async function loadScenarios(db: SupabaseClient, userId: string): Promise<ScenarioRow[]> {
  const { data, error } = await db
    .from("seller_hub_agent_scenarios")
    .select("id, playbook, name, scope, enabled")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Сценарии не прочитались: ${error.message}`);
  return (data ?? []).map((row) => ({ id: row.id as string, playbook: row.playbook as ScenarioRow["playbook"], name: row.name as string, scope: (row.scope ?? { all: true }) as ScenarioScope, enabled: row.enabled === true }));
}

export async function loadPlaybookStates(db: SupabaseClient, userId: string): Promise<Map<string, PlaybookState>> {
  const { data, error } = await db.from("seller_hub_agent_playbook_state").select("nm_id, playbook, state").eq("user_id", userId).eq("marketplace_id", MARKETPLACE);
  if (error) throw new Error(`Состояние сценариев не прочиталось: ${error.message}`);
  const out = new Map<string, PlaybookState>();
  for (const row of data ?? []) {
    const state = (row.state ?? {}) as Partial<PlaybookState>;
    out.set(`${row.nm_id}:${row.playbook}`, {
      anchorBuyer: typeof state.anchorBuyer === "number" ? state.anchorBuyer : null,
      lastStepAt: state.lastStepAt && typeof state.lastStepAt === "object" ? (state.lastStepAt as Record<string, string>) : {},
      overstockActive: state.overstockActive === true,
      negativeClearSince: typeof state.negativeClearSince === "string" ? state.negativeClearSince : null,
    });
  }
  return out;
}

/** Когда цену товара меняли в последний раз: наши выполненные действия и любые изменения цены из событий (в том числе правки человека в WB). */
export async function loadLastPriceChanges(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const put = (nm: string | null | undefined, at: string | null | undefined) => {
    if (!nm || !at) return;
    const prev = out.get(nm);
    if (!prev || at > prev) out.set(nm, at);
  };
  const decisions = await db.from("seller_hub_agent_decisions").select("nm_id, executed_at").eq("user_id", userId).eq("action_type", "price").eq("status", "executed").order("executed_at", { ascending: false }).limit(2000);
  if (decisions.error) throw new Error(`Журнал решений не прочитался: ${decisions.error.message}`);
  for (const row of decisions.data ?? []) put(row.nm_id as string | null, row.executed_at as string | null);
  const events = await db
    .from("seller_hub_product_events")
    .select("nm_id, created_at")
    .eq("user_id", userId)
    .eq("marketplace_id", MARKETPLACE)
    .in("kind", ["price_changed", "discount_changed", "promo_price_changed"])
    .order("created_at", { ascending: false })
    .limit(2000);
  if (events.error) throw new Error(`События цен не прочитались: ${events.error.message}`);
  for (const row of events.data ?? []) put(row.nm_id as string | null, row.created_at as string | null);
  return out;
}

/** Предложения по ценам из включённых сценариев пользователя. Нет включённых сценариев — пусто без обращений к данным. */
export async function scenarioProposalsFor(db: SupabaseClient, userId: string, snapshot: SellerCatalogSnapshot, nowMs: number, options: { forceContext?: boolean } = {}): Promise<ScenarioRunResult & { enabledCount: number; context: { products: ScenarioProduct[]; scenarios: ScenarioRow[]; states: Map<string, PlaybookState>; lastChangeAt: Map<string, string> } | null }> {
  const scenarios = (await loadScenarios(db, userId)).filter((s) => s.enabled);
  if (scenarios.length === 0) {
    if (!options.forceContext) return { proposals: [], skipped: [], enabledCount: 0, context: null };
    // Включённых сценариев нет, но владелец принял действие из находки ИИ: данные нужны, чтобы посчитать цену и проверить ограничители.
    const [products, states, lastChangeAt] = await Promise.all([loadScenarioProducts(db, userId, snapshot, nowMs), loadPlaybookStates(db, userId), loadLastPriceChanges(db, userId)]);
    return { proposals: [], skipped: [], enabledCount: 0, context: { products, scenarios: [], states, lastChangeAt } };
  }
  const [products, states, lastChangeAt] = await Promise.all([loadScenarioProducts(db, userId, snapshot, nowMs), loadPlaybookStates(db, userId), loadLastPriceChanges(db, userId)]);
  return { ...buildScenarioProposals({ scenarios, products, states, lastChangeAt, nowMs }), enabledCount: scenarios.length, context: { products, scenarios, states, lastChangeAt } };
}
