import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { PLAYBOOKS, type PlaybookId } from "@/lib/seller-hub/agent/playbooks";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MARKETPLACE = "wildberries";
const isPlaybook = (v: unknown): v is PlaybookId => typeof v === "string" && v in PLAYBOOKS;
const UUID = /^[0-9a-f-]{36}$/i;

/** Сценарии цен агента пользователя. Настройка сценария только настраивает, что агент предлагает: в кабинет WB здесь ничего не пишется. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { data, error } = await createServerClient()
    .from("seller_hub_agent_scenarios")
    .select("id, playbook, name, scope, mode, enabled, created_at, updated_at, last_run_at")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", MARKETPLACE)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: "Сценарии не прочитались" }, { status: 502 });
  return NextResponse.json({
    ok: true,
    scenarios: data ?? [],
    available: (Object.keys(PLAYBOOKS) as PlaybookId[]).map((id) => ({ id, title: PLAYBOOKS[id].title, goal: PLAYBOOKS[id].goal })),
  });
}

/**
 * create — создать сценарий (по умолчанию выключен); set_enabled — включить или выключить; delete — удалить.
 * Режим всегда «только предлагать»: автоматическая смена цен не предусмотрена.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  let body: { action?: unknown; playbook?: unknown; name?: unknown; scope?: unknown; id?: unknown; enabled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const db = createServerClient();
  const userId = auth.user.id;

  if (body.action === "create") {
    if (!isPlaybook(body.playbook)) return NextResponse.json({ ok: false, error: "Неизвестная стратегия" }, { status: 400 });
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 100) : PLAYBOOKS[body.playbook].title;
    let scope: Record<string, unknown> = { all: true };
    if (body.scope && typeof body.scope === "object" && Array.isArray((body.scope as { nmIds?: unknown }).nmIds)) {
      const nmIds = ((body.scope as { nmIds: unknown[] }).nmIds as unknown[]).filter((v): v is string => typeof v === "string" && /^\d{1,15}$/.test(v)).slice(0, 500);
      if (nmIds.length === 0) return NextResponse.json({ ok: false, error: "Укажите хотя бы один артикул или выберите все товары" }, { status: 400 });
      scope = { nmIds };
    }
    const { data, error } = await db
      .from("seller_hub_agent_scenarios")
      .insert({ user_id: userId, marketplace_id: MARKETPLACE, playbook: body.playbook, name, scope, mode: "suggest", enabled: false })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: "Сценарий не создался" }, { status: 502 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.action === "set_enabled") {
    if (typeof body.id !== "string" || !UUID.test(body.id) || typeof body.enabled !== "boolean") return NextResponse.json({ ok: false, error: "Нужны сценарий и значение" }, { status: 400 });
    const { error } = await db.from("seller_hub_agent_scenarios").update({ enabled: body.enabled, updated_at: new Date().toISOString() }).eq("id", body.id).eq("user_id", userId);
    if (error) return NextResponse.json({ ok: false, error: "Не удалось изменить сценарий" }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    if (typeof body.id !== "string" || !UUID.test(body.id)) return NextResponse.json({ ok: false, error: "Нужен сценарий" }, { status: 400 });
    const { error } = await db.from("seller_hub_agent_scenarios").delete().eq("id", body.id).eq("user_id", userId);
    if (error) return NextResponse.json({ ok: false, error: "Не удалось удалить сценарий" }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Неизвестное действие" }, { status: 400 });
}
