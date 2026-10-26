import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { taskFromEvent, type EventRowForTask } from "@/lib/seller-hub/task-engine/from-event";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

const MARKETPLACES = new Set(["wildberries", "ozon", "yandex"]);

/**
 * Создать задачу из уведомления «Событий». Событие читается из базы по id и по сессии пользователя, текст из запроса не принимается.
 * Повторный запрос по тому же событию возвращает уже созданную открытую задачу, а не новую.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { eventId?: unknown; marketplaceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const marketplaceId = typeof body.marketplaceId === "string" && MARKETPLACES.has(body.marketplaceId) ? body.marketplaceId : "wildberries";
  if (!eventId || eventId.length > 300) return NextResponse.json({ ok: false, error: "Не указано событие" }, { status: 400 });

  const db = createServerClient();
  try {
    const { data: event, error: eventError } = await db
      .from("seller_hub_product_events")
      .select("event_key, kind, event_group, severity, title, detail, product_title, vendor_code, nm_id, item_id")
      .eq("user_id", auth.user.id)
      .eq("marketplace_id", marketplaceId)
      .eq("event_key", eventId)
      .maybeSingle();
    if (eventError) throw new Error(eventError.message);
    if (!event) return NextResponse.json({ ok: false, error: "Событие не найдено" }, { status: 404 });

    const { data: existing, error: existingError } = await db
      .from("seller_hub_tasks")
      .select("id, status")
      .eq("user_id", auth.user.id)
      .eq("marketplace_id", marketplaceId)
      .eq("task_type", "TASK_FROM_EVENT")
      .eq("source_event_id", eventId)
      .in("status", ["active", "in_progress", "snoozed"])
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if (existing && existing.length > 0) return NextResponse.json({ ok: true, taskId: existing[0]!.id, existed: true });

    const now = new Date().toISOString();
    const task = taskFromEvent(event as EventRowForTask, marketplaceId, now, crypto.randomUUID());
    const { error: insertError } = await db.from("seller_hub_tasks").insert({
      id: task.id,
      user_id: auth.user.id,
      marketplace_id: marketplaceId,
      nm_id: task.nmId,
      item_id: task.itemId,
      product_title: task.productTitle,
      vendor_code: task.vendorCode,
      task_type: task.type,
      category: task.category,
      severity: task.severity,
      status: task.status,
      title: task.title,
      description: task.description,
      reason: task.reason,
      evidence: task.evidence,
      recommendation: task.recommendation,
      action_type: task.actionType,
      business_impact_type: task.businessImpactType,
      score: task.score,
      source_event_id: task.sourceEventId,
      snooze_until: null,
      resolved_at: null,
      resolution: null,
      created_at: now,
      updated_at: now,
    });
    if (insertError) throw new Error(insertError.message);
    return NextResponse.json({ ok: true, taskId: task.id, existed: false });
  } catch (error) {
    console.error("seller hub task from event:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: "Не удалось создать задачу" }, { status: 500 });
  }
}
