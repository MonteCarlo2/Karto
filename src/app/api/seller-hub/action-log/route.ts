import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 20;

/** Последние записи журнала действий пользователя: что менялось в кабинете и с каким результатом. Только чтение. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { data, error } = await createServerClient()
    .from("seller_hub_agent_actions")
    .select("id, agent, action, target_id, nm_id, request, result, message, initiator, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, error: "Журнал не прочитался" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, entries: data ?? [] });
}
