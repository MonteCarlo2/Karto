import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAutoRepliesUser } from "@/lib/auto-replies/api-auth";
import { fetchAutoReplySubscriptionInfo } from "@/lib/auto-replies-subscription-info";

export async function GET(request: NextRequest) {
  const auth = await requireAutoRepliesUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServerClient();
  const info = await fetchAutoReplySubscriptionInfo(supabase, auth.user.id);
  return NextResponse.json(
    { success: true, ...info },
    { headers: { "Cache-Control": "no-store" } }
  );
}
