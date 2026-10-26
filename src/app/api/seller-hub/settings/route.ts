import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { defaultValues, rowFromValues } from "@/lib/seller-hub/task-engine/settings-form";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function asPercent(value: unknown): number | null | "invalid" {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return "invalid";
  return n;
}

/** Настройки маржи кабинета: целевая маржа и налог. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const marketplaceId = request.nextUrl.searchParams.get("marketplaceId") ?? "wildberries";
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("seller_hub_task_settings")
    .select("target_margin_percent, tax_rate_percent, low_margin_percent")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", marketplaceId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const target =
    data?.target_margin_percent != null
      ? Number(data.target_margin_percent)
      : data?.low_margin_percent != null
        ? Number(data.low_margin_percent)
        : null;
  return NextResponse.json({
    ok: true,
    targetMarginPercent: target,
    taxRatePercent: data?.tax_rate_percent != null ? Number(data.tax_rate_percent) : null,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  const marketplaceId =
    typeof body.marketplaceId === "string" && body.marketplaceId.trim()
      ? body.marketplaceId.trim()
      : "wildberries";
  const target = asPercent(body.targetMarginPercent);
  const tax = asPercent(body.taxRatePercent);
  if (target === "invalid" || tax === "invalid") {
    return NextResponse.json(
      { ok: false, error: "Значения от 0 до 100, либо пусто." },
      { status: 400 },
    );
  }
  const supabase = createServerClient();
  // Первая запись строки: остальные колонки пишем явными стандартами движка. Иначе база подставит свои значения по умолчанию
  // (например, 28 дней вместо 56 для «нет продаж»), и правила изменятся без ведома пользователя.
  const { data: existing } = await supabase.from("seller_hub_task_settings").select("user_id").eq("user_id", auth.user.id).eq("marketplace_id", marketplaceId).maybeSingle();
  const initial = existing ? {} : rowFromValues({ ...defaultValues(), targetMarginPercent: target });
  const { error } = await supabase.from("seller_hub_task_settings").upsert(
    {
      ...initial,
      user_id: auth.user.id,
      marketplace_id: marketplaceId,
      target_margin_percent: target,
      tax_rate_percent: tax,
      low_margin_percent: target,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,marketplace_id" },
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, targetMarginPercent: target, taxRatePercent: tax });
}
