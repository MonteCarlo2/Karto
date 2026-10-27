import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { FINDING_KIND_LABEL } from "@/lib/seller-hub/agent/ai-observer";
import { unifyFeed, type FeedFinding } from "@/lib/seller-hub/agent/feed";
import { normalizeStoredStrategy } from "@/lib/seller-hub/agent/strategy";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Единая лента: открытые задачи алгоритмов и находки ИИ, слитые по товару и вопросу. Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    const [tasks, found] = await Promise.all([
      listSellerHubTasks(auth.user.id, "wildberries"),
      db.from("seller_hub_ai_findings").select("id, nm_id, kind, severity, title, what, why_now, human_advice, evidence, second_opinion, second_reason, action, origin, task_id, task_ids, verdict, strategy, strategy_state, algorithm_view, status, owner_accepted, autopilot, action_note").eq("user_id", auth.user.id).eq("marketplace_id", "wildberries").in("status", ["open", "not_problem"]).limit(200),
    ]);
    if (found.error) throw found.error;
    const rows = found.data ?? [];
    const notProblem = new Map(rows.filter((r) => r.status === "not_problem").flatMap((r) => (Array.isArray(r.task_ids) ? (r.task_ids as string[]) : []).map((id) => [id, { title: String(r.title), diagnosis: String(r.what ?? "") }] as const)));
    const findings: FeedFinding[] = rows.filter((r) => r.status === "open").map((r) => ({
      id: String(r.id),
      nmId: (r.nm_id as string | null) ?? null,
      kind: r.kind as FeedFinding["kind"],
      severity: r.severity as FeedFinding["severity"],
      title: String(r.title),
      what: String(r.what ?? ""),
      whyNow: String(r.why_now ?? ""),
      humanAdvice: String(r.human_advice ?? ""),
      evidence: (r.evidence ?? []) as FeedFinding["evidence"],
      second: String(r.second_opinion ?? ""),
      secondReason: String(r.second_reason ?? ""),
      action: (r.action ?? null) as FeedFinding["action"],
      origin: String(r.origin ?? ""),
      taskKey: String(r.task_id ?? ""),
      taskIds: Array.isArray(r.task_ids) ? (r.task_ids as string[]) : [],
      ownerAccepted: r.owner_accepted === true,
      autopilot: r.autopilot === true,
      actionNote: String(r.action_note ?? ""),
      verdict: (r.verdict as string | null) ?? null,
      strategy: normalizeStoredStrategy(r.strategy),
      strategyState: (r.strategy_state ?? null) as FeedFinding["strategyState"],
      problems: ((r.algorithm_view as { problems?: FeedFinding["problems"] } | null)?.problems ?? []) as FeedFinding["problems"],
    }));
    const open = tasks.filter((t) => t.status === "active" || t.status === "in_progress").map((t) => ({ id: t.id, type: t.type, title: t.title, nmId: t.nmId, severity: t.severity }));
    return NextResponse.json({ ok: true, items: unifyFeed(open, findings, notProblem).map((item) => ({ ...item, kindLabel: item.finding ? FINDING_KIND_LABEL[item.finding.kind] : null })) });
  } catch {
    return NextResponse.json({ ok: false, error: "Лента не прочиталась" }, { status: 502 });
  }
}
