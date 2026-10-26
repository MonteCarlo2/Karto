import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { defaultValues, rowFromValues, validateDisabledTypes, validateValues, valuesFromRow } from "@/lib/seller-hub/task-engine/settings-form";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MARKETPLACES = new Set(["wildberries", "ozon", "yandex"]);
const marketplaceOf = (v: unknown) => (typeof v === "string" && MARKETPLACES.has(v) ? v : "wildberries");

/** Настройки задач пользователя: значения рычагов, отключённые типы и товары, по которым задачи отключены. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const marketplaceId = marketplaceOf(request.nextUrl.searchParams.get("marketplaceId"));
  const db = createServerClient();
  const { data: row, error } = await db.from("seller_hub_task_settings").select("*").eq("user_id", auth.user.id).eq("marketplace_id", marketplaceId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Не удалось прочитать настройки" }, { status: 500 });
  const { data: mutes } = await db.from("seller_hub_task_overrides").select("nm_id, task_type").eq("user_id", auth.user.id).eq("marketplace_id", marketplaceId).eq("disabled", true);
  return NextResponse.json({
    ok: true,
    values: valuesFromRow(row as Record<string, unknown> | null),
    defaults: defaultValues(),
    disabledTypes: Array.isArray((row as { disabled_types?: unknown } | null)?.disabled_types) ? (row as { disabled_types: string[] }).disabled_types : [],
    mutedProducts: (mutes ?? []).map((m) => ({ nmId: (m as { nm_id: string }).nm_id, type: (m as { task_type: string }).task_type })),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { marketplaceId?: unknown; values?: unknown; disabledTypes?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  const checked = validateValues(body.values);
  if (!checked.ok) return NextResponse.json({ ok: false, error: "Проверьте значения", errors: checked.errors }, { status: 400 });
  const disabled = validateDisabledTypes(body.disabledTypes);
  if (disabled == null) return NextResponse.json({ ok: false, error: "Неизвестный тип задач" }, { status: 400 });
  const marketplaceId = marketplaceOf(body.marketplaceId);
  const db = createServerClient();
  const { error } = await db.from("seller_hub_task_settings").upsert(
    { ...rowFromValues(checked.values), disabled_types: disabled, user_id: auth.user.id, marketplace_id: marketplaceId, updated_at: new Date().toISOString() },
    { onConflict: "user_id,marketplace_id" },
  );
  if (error) {
    console.error("seller hub task settings:", error.message);
    return NextResponse.json({ ok: false, error: "Не удалось сохранить настройки" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, values: checked.values, disabledTypes: disabled });
}
