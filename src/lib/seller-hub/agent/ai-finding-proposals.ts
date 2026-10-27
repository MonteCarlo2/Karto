import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentProposal } from "@/lib/seller-hub/ads-agent-engine";
import { initiativeProposals } from "./ai-initiative";
import type { AiOutcome } from "./ai-orchestrator";
import type { ObserverAction } from "./ai-observer";
import type { PlaybookState } from "./playbooks";
import { batchLimit, type ScenarioProduct, type ScenarioRow, type ScenarioSkip } from "./scenario-run";

/**
 * Находки ИИ-наблюдателя с действием становятся обычными предложениями агента («Выполнить»), если они прошли второго ИИ.
 * Дальше всё как у остальных предложений по цене: число цены считает программа, ограничители главнее ИИ,
 * работает только внутри включённого сценария владельца, подтверждает человек.
 */

export type ActionableFinding = { nmId: string; title: string; humanAdvice: string; action: ObserverAction; /** Владелец принял действие: предложение появляется и без включённого сценария. */ ownerAccepted: boolean; /** Если это шаг плана: какой план и какой шаг, чтобы выполнение отметило шаг сделанным. */ stepRef?: { findingId: string; stepIndex: number } };

export async function loadActionableFindings(db: SupabaseClient, userId: string): Promise<ActionableFinding[]> {
  const { data, error } = await db
    .from("seller_hub_ai_findings")
    .select("nm_id, title, human_advice, action, owner_accepted")
    .eq("user_id", userId)
    .eq("marketplace_id", "wildberries")
    .eq("status", "open")
    .eq("second_opinion", "agree")
    .not("action", "is", null);
  if (error) throw new Error(`Находки ИИ не прочитались: ${error.message}`);
  return (data ?? [])
    .filter((row) => row.nm_id && row.action && (row.action as ObserverAction).type === "price")
    .map((row) => ({ nmId: String(row.nm_id), title: String(row.title), humanAdvice: String(row.human_advice ?? ""), action: row.action as ObserverAction, ownerAccepted: row.owner_accepted === true }));
}

export function findingProposals(input: {
  findings: ActionableFinding[];
  scenarios: ScenarioRow[];
  products: ScenarioProduct[];
  /** Товары, по которым уже есть предложение (алгоритма или ИИ-слоя). */
  taken: Set<string>;
  states: Map<string, PlaybookState>;
  lastChangeAt: Map<string, string>;
  nowMs: number;
  existingCount: number;
}): { proposals: AgentProposal[]; skipped: ScenarioSkip[] } {
  const byNm = new Map(input.products.map((p) => [p.nmId, p]));
  const outcomes = new Map<string, AiOutcome>();
  const products: ScenarioProduct[] = [];
  for (const f of input.findings) {
    const product = byNm.get(f.nmId);
    if (!product) continue;
    products.push(product);
    outcomes.set(f.nmId, {
      analysis: null,
      review: null,
      consensus: { state: "agreed", notes: [] },
      initiative: {
        state: "recommended",
        suggestion: { direction: f.action.direction, stepPercent: f.action.stepPercent, reason: f.action.reason, evidence: [] },
        notes: [`По мнению ИИ (наблюдатель и второй ИИ согласны): ${f.title}. ${f.action.reason}`.trim(), ...(f.humanAdvice ? [f.humanAdvice] : [])],
      },
      dataUsed: [],
    });
  }
  // Принятое владельцем действие работает без включённого сценария: на такие товары заводится сценарий-«разрешение» только по ним.
  const acceptedNms = input.findings.filter((f) => f.ownerAccepted).map((f) => f.nmId);
  const scenarios: ScenarioRow[] = acceptedNms.length > 0 ? [...input.scenarios, { id: "owner", playbook: "grow_no_price_war", name: "Принято владельцем", scope: { nmIds: acceptedNms }, enabled: true }] : input.scenarios;
  const universe = input.products.filter((p) => p.signals != null && p.base != null).length;
  const result = initiativeProposals({
    scenarios,
    products,
    outcomes,
    taken: input.taken,
    states: input.states,
    lastChangeAt: input.lastChangeAt,
    nowMs: input.nowMs,
    slots: batchLimit(universe) - input.existingCount,
  });
  // Шаг плана записывается в предложение: когда владелец его выполнит, шаг отметится сделанным.
  const refByNm = new Map(input.findings.filter((f) => f.stepRef).map((f) => [f.nmId, f.stepRef!]));
  return {
    skipped: result.skipped,
    proposals: result.proposals.map((p) => {
      const ref = p.action.type === "price" ? refByNm.get(p.action.nmId) : undefined;
      return ref ? { ...p, meta: { ...(p.meta ?? {}), strategy: { ...ref, price: true } } } : p;
    }),
  };
}
