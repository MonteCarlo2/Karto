import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { AUTOPILOT_TYPES, ROUTINES, ROUTINE_LABEL, isAutopilotType, isRoutine, loadAutopilotSettings, normalizeSettings } from "@/lib/seller-hub/agent/autopilot";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MARKETPLACE = "wildberries";

/** Правила автопилота владельца и последние действия, которые он выполнил. Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    const settings = await loadAutopilotSettings(db, auth.user.id);
    const { data } = await db
      .from("seller_hub_agent_proposals")
      .select("id, title, status, resolution_note, resolved_at")
      .eq("user_id", auth.user.id)
      .eq("marketplace_id", MARKETPLACE)
      .in("status", ["done", "failed"])
      .like("resolution_note", "Автопилот%")
      .order("resolved_at", { ascending: false })
      .limit(15);
    return NextResponse.json({
      ok: true,
      settings,
      types: AUTOPILOT_TYPES,
      routines: ROUTINES.map((id) => ({ id, label: ROUTINE_LABEL[id] })),
      recent: (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title), status: String(r.status), note: String(r.resolution_note ?? ""), at: String(r.resolved_at ?? "") })),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Правила автопилота не прочитались" }, { status: 502 });
  }
}

/** Сохранить правила автопилота. Включение остаётся решением владельца: по умолчанию автопилот выключен. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; allowedTypes?: unknown; maxActionsPerDay?: unknown; maxDepositPerDayRub?: unknown; routines?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Неверный запрос" }, { status: 400 });
  const settings = normalizeSettings({
    enabled: body.enabled === true,
    allowed_types: Array.isArray(body.allowedTypes) ? body.allowedTypes.filter((t) => typeof t === "string" && isAutopilotType(t)) : undefined,
    max_actions_per_day: body.maxActionsPerDay,
    max_deposit_per_day_rub: body.maxDepositPerDayRub,
    routines: Array.isArray(body.routines) ? body.routines.filter((t) => typeof t === "string" && isRoutine(t)) : [],
  });
  const { error } = await createServerClient()
    .from("seller_hub_autopilot_settings")
    .upsert({ user_id: auth.user.id, marketplace_id: MARKETPLACE, enabled: settings.enabled, allowed_types: settings.allowedTypes, max_actions_per_day: settings.maxActionsPerDay, max_deposit_per_day_rub: settings.maxDepositPerDayRub, routines: settings.routines, updated_at: new Date().toISOString() }, { onConflict: "user_id,marketplace_id" });
  if (error) return NextResponse.json({ ok: false, error: "Не удалось сохранить правила" }, { status: 502 });
  return NextResponse.json({ ok: true, settings });
}
