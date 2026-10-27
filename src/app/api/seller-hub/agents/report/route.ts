import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Последние недельные отчёты о работе агентов. Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { data, error } = await createServerClient()
    .from("seller_hub_agent_reports")
    .select("id, kind, period_start, period_end, payload, created_at")
    .eq("user_id", auth.user.id)
    .eq("marketplace_id", "wildberries")
    .order("period_end", { ascending: false })
    .limit(4);
  if (error) return NextResponse.json({ ok: false, error: "Отчёты не прочитались" }, { status: 502 });
  return NextResponse.json({ ok: true, reports: data ?? [] });
}
