import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import type { AiOutcome } from "./ai-orchestrator";
import type { PlaybookState } from "./playbooks";
import { EMPTY_PLAYBOOK_STATE } from "./playbooks";
import { makePriceProposal, type ScenarioProduct, type ScenarioRow, type ScenarioScope, type ScenarioSkip } from "./scenario-run";

/**
 * Инициатива ИИ: алгоритм цену менять не предлагал, а аналитик и независимый проверяющий вместе считают, что нужно.
 * Такая рекомендация проходит те же ограничители цены, занимает место в общей пачке и показывается с пометкой «по мнению ИИ».
 * Работает только в рамках включённого сценария владельца (охват товара): без включённого сценария ИИ ничего не предлагает.
 */

const inScope = (scope: ScenarioScope, nmId: string): boolean => ("all" in scope && scope.all === true ? true : "nmIds" in scope && Array.isArray(scope.nmIds) ? scope.nmIds.includes(nmId) : false);

export function initiativeProposals(input: {
  scenarios: ScenarioRow[];
  products: ScenarioProduct[];
  outcomes: Map<string, AiOutcome>;
  /** Товары, по которым уже есть предложение алгоритма. */
  taken: Set<string>;
  states: Map<string, PlaybookState>;
  lastChangeAt: Map<string, string>;
  nowMs: number;
  /** Сколько мест осталось в общей пачке. */
  slots: number;
}): { proposals: AgentProposal[]; skipped: ScenarioSkip[] } {
  const proposals: AgentProposal[] = [];
  const skipped: ScenarioSkip[] = [];
  if (input.slots <= 0) return { proposals, skipped };
  for (const product of input.products) {
    if (proposals.length >= input.slots) break;
    if (input.taken.has(product.nmId)) continue;
    const outcome = input.outcomes.get(product.nmId);
    const initiative = outcome?.initiative;
    if (!outcome || !initiative || initiative.state !== "recommended" || !initiative.suggestion) continue;
    const scenario = input.scenarios.find((s) => s.enabled && inScope(s.scope, product.nmId));
    if (!scenario) continue;
    const s = initiative.suggestion;
    const stepPercent = s.direction === "lower" ? -s.stepPercent : s.stepPercent;
    const state = input.states.get(`${product.nmId}:${scenario.playbook}`) ?? EMPTY_PLAYBOOK_STATE;
    const base = product.signals?.buyerPrice ?? null;
    const nextState: PlaybookState = { ...state, anchorBuyer: stepPercent < 0 ? (state.anchorBuyer ?? base) : state.anchorBuyer };
    const made = makePriceProposal({ scenario, product, stepPercent, reasons: [{ rule: "ai_initiative", text: initiative.notes[0] ?? "Предложение ИИ" }], nextState, source: "ai", lastChangeAt: input.lastChangeAt, nowMs: input.nowMs });
    if (!made.proposal) {
      skipped.push({ nmId: product.nmId, vendorCode: product.vendorCode, scenario: scenario.name, reason: `Предложение ИИ: ${made.skip}` });
      continue;
    }
    proposals.push({
      ...made.proposal,
      id: `price-ai-${scenario.id}-${product.nmId}`,
      facts: [...made.proposal.facts, ...initiative.notes.slice(1).map((n) => `ИИ: ${n}`)],
      meta: { ...made.proposal.meta, ai: { state: "initiative", analysis: outcome.analysis, review: outcome.review } },
    });
  }
  return { proposals, skipped };
}
