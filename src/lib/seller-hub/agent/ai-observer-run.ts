import type { SupabaseClient } from "@supabase/supabase-js";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { supabaseCacheStore, type CacheStore } from "@/lib/seller-hub/data-cache";
import { agentModel, askHubModel } from "@/lib/seller-hub/llm";
import { buildStoreProfile, withStoreMedians } from "./ai-context";
import type { AiAsk } from "./ai-orchestrator";
import {
  OBSERVER_REVIEWER_SYSTEM,
  OBSERVER_SYSTEM,
  algorithmView,
  applySecondOpinion,
  findingFingerprint,
  observerFingerprint,
  observerPayload,
  parseObserver,
  parseObserverReview,
  shouldRunObserver,
  type ObserverEvent,
  type ObserverTask,
  type ReviewedFinding,
} from "./ai-observer";
import { monthCapUsd, monthSpend, recordAiUsage, remainingBudget } from "./ai-usage";
import type { ScenarioProduct } from "./scenario-run";

const MARKETPLACE = "wildberries";
const stateKey = (userId: string) => `agent-observer-state:${userId}`;
type ObserverState = { atMs: number; fingerprint: string };

export type ObserverRun = {
  ran: boolean;
  reason: string;
  verdict?: "quiet" | "findings";
  summary?: string;
  findings: ReviewedFinding[];
  dropped: number;
  costUsd: number;
  calls: number;
};

const defaultAsk: AiAsk = ({ system, user, maxTokens, role }) => askHubModel({ system, user, maxTokens, model: agentModel(role), timeoutMs: 90_000 });

/** Последние заголовки находок: ИИ не должен повторять то же самое. */
async function recentTitles(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await db.from("seller_hub_ai_findings").select("title").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).in("status", ["open", "dismissed"]).order("last_seen_at", { ascending: false }).limit(12);
  return (data ?? []).map((r) => String(r.title));
}

async function persist(db: SupabaseClient, userId: string, findings: ReviewedFinding[], tasks: ObserverTask[], nowIso: string): Promise<void> {
  const seen = new Set<string>();
  for (const f of findings) {
    const fp = findingFingerprint(f);
    seen.add(fp);
    const row = {
      nm_id: f.nmId,
      kind: f.kind,
      severity: f.severity,
      title: f.title,
      what: f.what,
      why_now: f.whyNow,
      evidence: f.evidence,
      human_advice: f.humanAdvice,
      action: f.action,
      algorithm_view: algorithmView(f, tasks),
      second_opinion: f.second,
      second_reason: f.secondReason,
      last_seen_at: nowIso,
    };
    const existing = await db.from("seller_hub_ai_findings").select("id, status").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("fingerprint", fp).maybeSingle();
    if (existing.data) {
      // Скрытое владельцем остаётся скрытым; вернувшееся после «угасло» открывается снова.
      const status = existing.data.status === "dismissed" ? "dismissed" : "open";
      await db.from("seller_hub_ai_findings").update({ ...row, status }).eq("id", existing.data.id);
    } else {
      await db.from("seller_hub_ai_findings").insert({ user_id: userId, marketplace_id: MARKETPLACE, fingerprint: fp, first_seen_at: nowIso, ...row });
    }
  }
  // Открытые находки, которых ИИ в этот раз не назвал, больше не актуальны.
  const { data: open } = await db.from("seller_hub_ai_findings").select("id, fingerprint").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("status", "open");
  const faded = (open ?? []).filter((r) => !seen.has(String(r.fingerprint))).map((r) => r.id as string);
  if (faded.length > 0) await db.from("seller_hub_ai_findings").update({ status: "faded" }).in("id", faded);
}

export async function runObserver(input: {
  db: SupabaseClient;
  userId: string;
  products: ScenarioProduct[];
  tasks: ObserverTask[];
  events: ObserverEvent[];
  nowMs: number;
  ask?: AiAsk;
  store?: CacheStore;
  /** Запустить независимо от отпечатка и паузы (скрипты и ручной запуск). */
  force?: boolean;
  /** Не писать находки в базу (проверочный прогон). */
  dryRun?: boolean;
}): Promise<ObserverRun> {
  const { db, userId, nowMs } = input;
  const none = (reason: string): ObserverRun => ({ ran: false, reason, findings: [], dropped: 0, costUsd: 0, calls: 0 });
  const profile = buildStoreProfile(input.products);
  const withMedians = withStoreMedians(input.products, profile);
  const products = withMedians.filter((p) => p.ai).map((p) => ({ nmId: p.nmId, title: p.title, facts: p.ai!.facts }));
  if (products.length === 0) return none("нет данных по товарам");

  const store = input.store ?? supabaseCacheStore(db, userId);
  const state = (await store.read<ObserverState>(stateKey(userId)).catch(() => null))?.payload ?? null;
  const fingerprint = observerFingerprint({ products, tasks: input.tasks, events: input.events });
  const decision = input.force ? { run: true, reason: "ручной запуск" } : shouldRunObserver({ lastRunMs: state?.atMs ?? null, lastFingerprint: state?.fingerprint ?? null, fingerprint, nowMs });
  if (!decision.run) return none(decision.reason);

  const spent = await monthSpend(db, userId, nowMs);
  if (remainingBudget(spent.costUsd, monthCapUsd(), nowMs).todayLeft <= 0) return none(`месячный потолок $${monthCapUsd()} исчерпан`);
  if (!takeAiBudget(userId, "agent-observer", 12, nowMs).ok) return none("суточный предел разборов наблюдателя");

  const ask = input.ask ?? defaultAsk;
  const nowIso = new Date(nowMs).toISOString();
  const payloadInput = { profile, products, tasks: input.tasks, events: input.events, recentTitles: await recentTitles(db, userId).catch(() => []), nowIso };
  const user = observerPayload(payloadInput);
  let costUsd = 0;
  let calls = 1;
  const first = await ask({ system: OBSERVER_SYSTEM, user, maxTokens: 5000, role: "analyst" });
  costUsd += first.costUsd;
  const parsed = parseObserver(first.text, payloadInput);

  let verdicts = null;
  if (parsed.findings.some((f) => f.severity === "important")) {
    try {
      const findings = parsed.findings.map((f, index) => ({ index, nmId: f.nmId, kind: f.kind, title: f.title, what: f.what, evidence: f.evidence }));
      const second = await ask({ system: OBSERVER_REVIEWER_SYSTEM, user: JSON.stringify({ picture: JSON.parse(user), findings }), maxTokens: 3000, role: "reviewer" });
      calls += 1;
      costUsd += second.costUsd;
      verdicts = parseObserverReview(second.text, parsed.findings);
    } catch (error) {
      console.error("[seller-hub-agent] второй ИИ наблюдателя не ответил:", error instanceof Error ? error.message : String(error));
    }
  }
  const reviewed = applySecondOpinion(parsed.findings, verdicts);

  if (!input.dryRun) {
    await persist(db, userId, reviewed, input.tasks, nowIso);
    await store.write(stateKey(userId), { atMs: nowMs, fingerprint } satisfies ObserverState).catch(() => undefined);
    await recordAiUsage(db, userId, { kind: "agent-observer", calls, costUsd, nowMs }).catch(() => undefined);
  }
  console.info(`[seller-hub-agent] наблюдатель (${decision.reason}): ${reviewed.length > 0 ? `находок ${reviewed.length}` : "тихо"}, отброшено ${parsed.dropped}, вызовов ${calls}, $${costUsd.toFixed(4)}`);
  return { ran: true, reason: decision.reason, verdict: reviewed.length > 0 ? "findings" : "quiet", summary: parsed.summary, findings: reviewed, dropped: parsed.dropped, costUsd, calls };
}
