import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { recordAction } from "@/lib/seller-hub/action-log";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { openSellerHubWbToken } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { decideAutopilot, executeAutopilotAction, loadAutopilotSettings, loadUsageToday, logName, type RoutineId, type ServerExecResult } from "./autopilot";
import { ensureWeeklyReport } from "./report";
import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import type { ScenarioProduct } from "./scenario-run";
import { loadAdQueries, type AdQuery } from "./ads-queries";
import { loadScenarioProducts } from "./scenario-inputs";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Регулярные задачи автопилота: выполняются раз в сутки сами, когда автопилот включён владельцем и эта задача отмечена в его правилах.
 * Сейчас одна: минус-фразы для запросов, которые много раз кликнули и ни разу не заказали. Действие идёт через те же правила, что шаги планов
 * (разрешённые виды, суточный предел действий), записывается в журнал действий и в журнал решений с пометкой «Автопилот».
 */

/** Запрос считается пустым, если на него много кликов и ни одного заказа за окно данных (порог выше, чем у подсказок ИИ: автоматика осторожнее). */
export const MIN_CLICKS_NO_ORDERS = 20;
export const MAX_PHRASES_PER_PAIR = 3;
export const MAX_PAIRS_PER_RUN = 3;

export type MinusCandidate = { advertId: string; nmId: string; queries: string[] };

/** Чистый отбор: самые затратные запросы без заказов по каждой паре «кампания, товар», не больше MAX_PHRASES_PER_PAIR на пару и MAX_PAIRS_PER_RUN пар за запуск. */
export function pickMinusCandidates(byNm: Map<string, AdQuery[]>): MinusCandidate[] {
  const out: MinusCandidate[] = [];
  for (const [nmId, rows] of byNm) {
    const perCampaign = new Map<string, AdQuery[]>();
    for (const r of rows.filter((x) => x.orders === 0 && x.clicks >= MIN_CLICKS_NO_ORDERS)) perCampaign.set(r.campaignId, [...(perCampaign.get(r.campaignId) ?? []), r]);
    for (const [advertId, list] of perCampaign) {
      const queries = list.sort((a, b) => b.clicks - a.clicks).slice(0, MAX_PHRASES_PER_PAIR).map((r) => r.query);
      if (queries.length > 0) out.push({ advertId, nmId, queries });
    }
  }
  return out.slice(0, MAX_PAIRS_PER_RUN);
}

export type RoutineResult = { considered: number; executed: number; failed: number; skipped: string[] };

export async function runMinusRoutine(input: {
  db: SupabaseClient;
  userId: string;
  nowMs: number;
  /** Запросы рекламы без заказов по товарам (по умолчанию читаются из WB тем же загрузчиком, что у плана ИИ). */
  queries: Map<string, AdQuery[]>;
  exec?: (token: string, action: AgentAction) => Promise<ServerExecResult>;
  dryRun?: boolean;
}): Promise<RoutineResult> {
  const { db, userId, nowMs } = input;
  const result: RoutineResult = { considered: 0, executed: 0, failed: 0, skipped: [] };
  const settings = await loadAutopilotSettings(db, userId);
  if (!settings.enabled || !settings.routines.includes("minus_queries")) return result;
  const candidates = pickMinusCandidates(input.queries);
  if (candidates.length === 0) return result;

  const usage = await loadUsageToday(db, userId, nowMs);
  const day = moscowDateKey(nowMs);
  const { data: existing } = await db.from("seller_hub_agent_proposals").select("proposal_key").eq("user_id", userId).eq("marketplace_id", "wildberries").in("proposal_key", candidates.map((c) => `routine-minus:${c.advertId}:${c.nmId}:${day}`));
  const doneKeys = new Set((existing ?? []).map((r) => String((r as { proposal_key: string }).proposal_key)));

  let token: string | null = null;
  for (const c of candidates) {
    const key = `routine-minus:${c.advertId}:${c.nmId}:${day}`;
    if (doneKeys.has(key)) continue;
    result.considered += 1;
    const action: AgentAction = { type: "minus_phrases", advertId: c.advertId, nmId: c.nmId, queries: c.queries };
    const decision = decideAutopilot({ action, planAutopilot: true, planRunning: true, settings, usage });
    if (!decision.run) {
      result.skipped.push(decision.reason);
      continue;
    }
    if (input.dryRun) {
      result.executed += 1;
      usage.actionsToday += 1;
      continue;
    }
    if (!token) {
      const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
      if (!opened.ok) {
        result.skipped.push("не удалось открыть доступ к кабинету");
        break;
      }
      token = opened.token;
    }
    const res = await (input.exec ?? executeAutopilotAction)(token, action);
    // Все фразы уже стояли: ничего не записано, журнал не засоряем.
    if (res.ok && res.changed === false) continue;
    const title = `Минус-фразы по кампании ${c.advertId}, товар ${c.nmId}: ${c.queries.join(", ")}`;
    const note = res.ok ? "Автопилот: регулярная задача, минус-фразы добавлены" : `Автопилот не смог выполнить: ${res.error ?? "ошибка WB"}`;
    await recordAction({ userId, agent: "ads", action: logName(action), targetId: Number(c.advertId), request: { routine: "minus_queries", nmId: c.nmId, queries: c.queries }, result: res.ok ? "ok" : "error", message: res.ok ? "Автопилот: регулярная задача, минус-фразы" : (res.error ?? "Ошибка"), initiator: "agent" });
    await db.from("seller_hub_agent_proposals").upsert(
      { user_id: userId, marketplace_id: "wildberries", proposal_key: key, rule: "playbook", title, facts: [`кликов без заказов не меньше ${MIN_CLICKS_NO_ORDERS} на каждый запрос`], effect: "Запросы без заказов перестанут тратить бюджет", risk: "low", action, status: res.ok ? "done" : "failed", resolution_note: note, resolved_at: new Date(nowMs).toISOString(), last_seen_at: new Date(nowMs).toISOString() },
      { onConflict: "user_id,marketplace_id,proposal_key" },
    );
    if (res.ok) {
      result.executed += 1;
      usage.actionsToday += 1;
    } else result.failed += 1;
  }
  return result;
}

/** Точка входа для фонового пересчёта: читает данные только если регулярная задача включена владельцем. */
export async function runRoutines(input: { db: SupabaseClient; userId: string; snapshot: SellerCatalogSnapshot; nowMs: number }): Promise<RoutineResult> {
  const settings = await loadAutopilotSettings(input.db, input.userId);
  if (!settings.enabled || !settings.routines.includes("minus_queries")) return { considered: 0, executed: 0, failed: 0, skipped: [] };
  const products = await loadScenarioProducts(input.db, input.userId, input.snapshot, input.nowMs);
  const queries = await loadAdQueries(input.db, input.userId, products, input.nowMs);
  return runMinusRoutine({ db: input.db, userId: input.userId, nowMs: input.nowMs, queries });
}

/**
 * Регулярная проверка акций (только предлагает, выполняет владелец кнопкой): товар участвует в акции, где по нашим расчётам вы теряете деньги
 * (когорта «loss», маржа в акции отрицательная). Предложение «Убрать товар из акции»: выход сбрасывает скидку продавца до 0%, цена для покупателя вырастет.
 */
export function promoWatchProposals(products: ScenarioProduct[]): AgentProposal[] {
  const out: AgentProposal[] = [];
  for (const product of products) {
    for (const promo of product.promos ?? []) {
      if (promo.cohort !== "loss" || promo.marginPromoPercent == null || promo.marginPromoPercent >= 0) continue;
      out.push({
        id: `promo-watch-${promo.promoId}-${product.nmId}`,
        rule: "playbook",
        title: `Товар ${product.vendorCode || product.nmId} теряет деньги в акции «${promo.name}»`,
        facts: [`Маржа в акции: ${promo.marginPromoPercent}%`, promo.planPrice != null ? `Цена в акции: ${Math.round(promo.planPrice)} ₽` : "", promo.endAt ? `Акция до ${promo.endAt.slice(0, 10)}` : ""].filter(Boolean),
        effect: "Выход из акции сбрасывает скидку продавца до 0%: цена для покупателя вырастет, заказы могут упасть. Вернуться в акцию позже можно только вручную.",
        risk: "high",
        action: { type: "promo_exit", promoId: promo.promoId, promoName: promo.name, nmId: product.nmId },
      });
    }
  }
  return out;
}

/** Нужна ли регулярная проверка акций у этого владельца (читается из правил автопилота; сам автопилот при этом может быть выключен: проверка только предлагает). */
export async function routineEnabled(db: SupabaseClient, userId: string, id: RoutineId): Promise<boolean> {
  const settings = await loadAutopilotSettings(db, userId);
  return settings.routines.includes(id);
}

/** Недельный отчёт: создаётся один раз за закончившуюся неделю, если задача включена. */
export async function runReportRoutine(db: SupabaseClient, userId: string, nowMs: number): Promise<boolean> {
  if (!(await routineEnabled(db, userId, "weekly_report"))) return false;
  return ensureWeeklyReport(db, userId, nowMs);
}
