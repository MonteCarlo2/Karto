import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { normalizeStoredStrategy } from "@/lib/seller-hub/agent/strategy";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const MARKETPLACE = "wildberries";

/** История работы ИИ: что стало с принятыми планами. Расходы на ИИ клиенту не показываются (это внутренняя статья). Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    const plans = await db
      .from("seller_hub_ai_findings")
      .select("id, nm_id, title, origin, status, owner_accepted, strategy, strategy_state, last_seen_at")
      .eq("user_id", auth.user.id)
      .eq("marketplace_id", MARKETPLACE)
      .not("strategy_state->>acceptedAt", "is", null)
      .order("last_seen_at", { ascending: false })
      .limit(30);
    if (plans.error) throw plans.error;

    return NextResponse.json({
      ok: true,
      plans: (plans.data ?? []).map((r) => ({
        id: String(r.id),
        nmId: (r.nm_id as string | null) ?? null,
        title: String(r.title),
        origin: String(r.origin ?? ""),
        accepted: r.owner_accepted === true,
        strategy: normalizeStoredStrategy(r.strategy),
        state: r.strategy_state ?? {},
        lastSeenAt: String(r.last_seen_at ?? ""),
      })),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "История ИИ не прочиталась" }, { status: 502 });
  }
}
