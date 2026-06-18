import { NextRequest, NextResponse } from "next/server";
import { getVisualBatchProgress } from "@/lib/flow/visual-batch-progress";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId обязателен" }, { status: 400 });
  }

  const progress = getVisualBatchProgress(sessionId);
  if (!progress) {
    return NextResponse.json({ slots: null, inProgress: false });
  }

  return NextResponse.json({
    slots: progress.slots,
    inProgress: progress.inProgress,
    updatedAt: progress.updatedAt,
  });
}
