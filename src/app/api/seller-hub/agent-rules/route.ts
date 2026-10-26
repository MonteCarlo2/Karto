import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { moscowDateKey } from "@/lib/seller-hub/complete-days";
import { normalizeRules, validateRule } from "@/lib/seller-hub/ads-agent-engine";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 20;

/**
 * Правила агента рекламы (таблица seller_hub_agent_rules) и «сколько пополнено сегодня» для суточного лимита автопополнения.
 * action "list" — только чтение; "save" — сохранить одно правило (включено, режим, параметры). Деньги и кабинет WB здесь не затрагиваются:
 * правило лишь настраивает, что агент предлагает.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  let body: { action?: unknown; rule?: { kind?: unknown; enabled?: unknown; mode?: unknown; params?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const supabase = createServerClient();
  const userId = auth.user.id;

  if (body.action === "save") {
    const rule = body.rule;
    const params = rule?.params && typeof rule.params === "object" ? (rule.params as Record<string, unknown>) : {};
    const problem = validateRule({ kind: String(rule?.kind ?? ""), mode: String(rule?.mode ?? ""), params });
    if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
    const row = { user_id: userId, marketplace_id: "wildberries", agent: "ads", kind: String(rule!.kind), mode: String(rule!.mode), params, enabled: rule!.enabled === true, updated_at: new Date().toISOString() };
    const { data: existing, error: readError } = await supabase.from("seller_hub_agent_rules").select("id").eq("user_id", userId).eq("agent", "ads").eq("kind", row.kind).limit(1);
    if (readError) return NextResponse.json({ ok: false, error: "Правило не сохранилось" }, { status: 502 });
    const result = existing && existing.length > 0 ? await supabase.from("seller_hub_agent_rules").update(row).eq("id", existing[0]!.id).eq("user_id", userId) : await supabase.from("seller_hub_agent_rules").insert(row);
    if (result.error) return NextResponse.json({ ok: false, error: "Правило не сохранилось" }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  const { data: ruleRows, error } = await supabase.from("seller_hub_agent_rules").select("kind, enabled, mode, params").eq("user_id", userId).eq("agent", "ads");
  if (error) return NextResponse.json({ ok: false, error: "Правила не прочитались" }, { status: 502 });

  // Сколько пополнено сегодня по кампаниям (по Москве): основа суточного лимита автопополнения.
  const dayStart = new Date(`${moscowDateKey(Date.now())}T00:00:00+03:00`).toISOString();
  const { data: actions } = await supabase
    .from("seller_hub_agent_actions")
    .select("target_id, request")
    .eq("user_id", userId)
    .eq("agent", "ads")
    .eq("action", "ad_deposit")
    .eq("result", "ok")
    .gte("created_at", dayStart);
  const depositedToday: Record<string, number> = {};
  for (const a of actions ?? []) {
    const sum = (a.request as { sum?: unknown } | null)?.sum;
    if (a.target_id != null && typeof sum === "number") depositedToday[String(a.target_id)] = (depositedToday[String(a.target_id)] ?? 0) + sum;
  }
  return NextResponse.json({ ok: true, rules: normalizeRules(ruleRows ?? []), depositedToday });
}
