import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { supabaseCacheStore } from "@/lib/seller-hub/data-cache";
import { agentModel, askHubModel } from "@/lib/seller-hub/llm";
import { monthCapUsd, monthSpend, recordAiUsage, remainingBudget } from "./ai-usage";
import { buildStoreProfile, makeDataFetcher, withStoreMedians } from "./ai-context";
import { initiativeProposals } from "./ai-initiative";
import { runAiReview, type AiAsk } from "./ai-orchestrator";
import type { AiProductInput } from "./ai-review";
import type { PlaybookState } from "./playbooks";
import { batchLimit, type ScenarioProduct, type ScenarioRow } from "./scenario-run";

/**
 * ИИ-слой над предложениями по ценам: две нейросети проверяют предложения алгоритма и просматривают остальные товары на предмет
 * явных проблем, которых алгоритм не заметил. Старшинство: ограничители цены главнее всех, алгоритм предлагает, ИИ может скрыть или
 * пометить предложение, а собственная инициатива ИИ показывается только после согласия обоих и с пометкой.
 * Любой сбой оставляет предложения алгоритма как есть.
 */

/** Сколько товаров без предложения алгоритма просматривает ИИ за один пересчёт (самые заметные по заказам и просмотрам). */
export const AI_SCREEN_MAX = 12;
/** Минимум данных, чтобы тратить на товар платный разбор: иначе сказать нечего. */
const SCREEN_MIN_OPENS = 100;
const SCREEN_MIN_ORDERS = 3;

export type ScenarioContext = {
  proposals: AgentProposal[];
  products: ScenarioProduct[];
  scenarios: ScenarioRow[];
  states: Map<string, PlaybookState>;
  lastChangeAt: Map<string, string>;
};

const numberOf = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function applyAiLayer(input: { db: SupabaseClient; userId: string; context: ScenarioContext; nowMs: number; ask?: AiAsk }): Promise<{ proposals: AgentProposal[]; hidden: number; initiatives: number; costUsd: number; errors: string[] }> {
  const { db, userId, context, nowMs } = input;
  const profile = buildStoreProfile(context.products);
  const products = withStoreMedians(context.products, profile);
  const byNm = new Map(products.map((p) => [p.nmId, p]));

  const inputs: AiProductInput[] = [];
  const algorithmNms = new Set<string>();
  for (const p of context.proposals) {
    if (p.action.type !== "price") continue;
    const product = byNm.get(p.action.nmId);
    if (!product?.ai) continue;
    algorithmNms.add(product.nmId);
    inputs.push({
      nmId: product.nmId,
      title: product.title,
      facts: { ...product.ai.facts, floor: (p.meta?.floorBuyerPrice as number | null | undefined) ?? null },
      candidate: { stepPercent: Number(p.meta?.stepPercent ?? 0), rules: ((p.meta?.reasons as Array<{ rule: string }> | undefined) ?? []).map((r) => r.rule), playbook: String(p.meta?.playbook ?? "") },
      reviewSnippets: product.ai.snippets,
    });
  }

  // Просмотр остальных товаров: есть ли явная причина менять цену, которую алгоритм не увидел. Только в рамках включённого сценария владельца.
  const enabled = context.scenarios.filter((s) => s.enabled);
  const inAnyScope = (nm: string) => enabled.some((s) => ("all" in s.scope && s.scope.all === true) || ("nmIds" in s.scope && s.scope.nmIds.includes(nm)));
  const screening = products
    .filter((p) => p.ai && p.signals && p.base != null && !algorithmNms.has(p.nmId) && inAnyScope(p.nmId) && (numberOf(p.ai.facts.opens_28d) >= SCREEN_MIN_OPENS || numberOf(p.ai.facts.orders_28d) >= SCREEN_MIN_ORDERS))
    .sort((a, b) => numberOf(b.ai!.facts.orders_28d) + numberOf(b.ai!.facts.opens_28d) / 100 - (numberOf(a.ai!.facts.orders_28d) + numberOf(a.ai!.facts.opens_28d) / 100))
    .slice(0, AI_SCREEN_MAX);
  for (const p of screening) {
    inputs.push({ nmId: p.nmId, title: p.title, facts: { ...p.ai!.facts, floor: null }, candidate: null, reviewSnippets: p.ai!.snippets });
  }
  if (inputs.length === 0) return { proposals: context.proposals, hidden: 0, initiatives: 0, costUsd: 0, errors: [] };

  // Месячный потолок на кабинет: исчерпан — ИИ молчит, предложения алгоритма остаются как есть.
  const spent = await monthSpend(db, userId, nowMs);
  const left = remainingBudget(spent.costUsd, monthCapUsd(), nowMs);
  if (left.todayLeft <= 0) return { proposals: context.proposals, hidden: 0, initiatives: 0, costUsd: 0, errors: [`Месячный потолок на ИИ ($${monthCapUsd()}) исчерпан`] };

  const run = await runAiReview({
    products: inputs,
    profile,
    nowMs,
    ask: input.ask ?? (({ system, user, maxTokens, role }) => askHubModel({ system, user, maxTokens, model: agentModel(role), timeoutMs: 90_000 })),
    fetchData: makeDataFetcher({ db, userId, products, nowMs }),
    store: supabaseCacheStore(db, userId),
    takeBudget: () => takeAiBudget(userId, "agent-review", 40, nowMs).ok,
  });

  await recordAiUsage(db, userId, { kind: "agent-review", calls: run.calls, costUsd: run.costUsd, nowMs }).catch(() => undefined);
  console.info(`[seller-hub-agent] ИИ: товаров ${inputs.length}, вызовов ${run.calls}, из кэша ${run.reused}, стоимость $${run.costUsd.toFixed(4)}`);
  const out: AgentProposal[] = [];
  let hidden = 0;
  for (const p of context.proposals) {
    const nm = p.action.type === "price" ? p.action.nmId : null;
    const outcome = nm ? run.byNm.get(nm) : undefined;
    if (!outcome) {
      out.push(p);
      continue;
    }
    if (outcome.consensus.state === "hidden") {
      hidden += 1;
      console.info(`[seller-hub-agent] предложение по ${nm} скрыто двумя ИИ: ${outcome.consensus.notes.join(" | ")}`);
      continue;
    }
    out.push({
      ...p,
      facts: [...p.facts, ...outcome.consensus.notes.map((n) => `ИИ: ${n}`)],
      meta: { ...(p.meta ?? {}), ai: { state: outcome.consensus.state, analysis: outcome.analysis, review: outcome.review, dataUsed: outcome.dataUsed } },
    });
  }

  const universe = products.filter((p) => p.signals != null && p.base != null).length;
  const initiative = initiativeProposals({
    scenarios: context.scenarios,
    products: screening,
    outcomes: run.byNm,
    taken: algorithmNms,
    states: context.states,
    lastChangeAt: context.lastChangeAt,
    nowMs,
    slots: batchLimit(universe) - out.length,
  });
  return { proposals: [...out, ...initiative.proposals], hidden, initiatives: initiative.proposals.length, costUsd: run.costUsd, errors: run.errors };
}
