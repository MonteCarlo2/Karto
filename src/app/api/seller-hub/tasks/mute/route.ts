import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { validateDisabledTypes } from "@/lib/seller-hub/task-engine/settings-form";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Отключить (или вернуть) задачи одного типа по одному товару. Открытые такие задачи закроются при следующем пересчёте. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { nmId?: unknown; type?: unknown; disabled?: unknown; marketplaceId?: unknown } | null;
  const nmId = typeof body?.nmId === "string" ? body.nmId.trim() : "";
  const types = validateDisabledTypes([body?.type]);
  if (!body || !nmId || nmId.length > 40 || !types || types.length !== 1 || typeof body.disabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "Некорректный запрос" }, { status: 400 });
  }
  const marketplaceId = typeof body.marketplaceId === "string" && body.marketplaceId.trim() ? body.marketplaceId.trim() : "wildberries";
  const db = createServerClient();
  const { error } = await db.from("seller_hub_task_overrides").upsert(
    { user_id: auth.user.id, marketplace_id: marketplaceId, nm_id: nmId, task_type: types[0], disabled: body.disabled, updated_at: new Date().toISOString() },
    { onConflict: "user_id,marketplace_id,nm_id,task_type" },
  );
  if (error) {
    console.error("seller hub task mute:", error.message);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
