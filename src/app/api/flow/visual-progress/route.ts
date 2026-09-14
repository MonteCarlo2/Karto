import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVisualBatchProgress } from "@/lib/flow/visual-batch-progress";
import { guardFlowApiSession } from "@/lib/flow/guard-flow-api-session";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId обязателен" }, { status: 400 });
  }

  const supabase = createServerClient();
  const guard = await guardFlowApiSession(request, supabase as any, sessionId);
  if (!guard.ok) {
    return guard.response;
  }

  const progress = getVisualBatchProgress(sessionId);
  if (!progress) {
    return NextResponse.json({ slots: null, inProgress: false });
  }

  return NextResponse.json({
    slots: progress.slots,
    inProgress: progress.inProgress,
    updatedAt: progress.updatedAt,
    generationUsed: progress.quota?.generationUsed,
    generationRemaining: progress.quota?.generationRemaining,
    generationLimit: progress.quota?.generationLimit,
  });
}
