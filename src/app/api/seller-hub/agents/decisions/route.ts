import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { listAgentDecisions } from "@/lib/seller-hub/agent/repository";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Журнал решений агента: что предложено и выполнено, что было и что стало, что получилось через неделю. Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json({ ok: true, decisions: await listAgentDecisions(createServerClient(), auth.user.id) });
  } catch {
    return NextResponse.json({ ok: false, error: "Журнал решений не прочитался" }, { status: 502 });
  }
}
