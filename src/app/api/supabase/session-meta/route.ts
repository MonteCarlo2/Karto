import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isDemoProductSession } from "@/lib/demo-flow-server";
import { getVisualQuota } from "@/lib/services/visual-generation-quota";

/**
 * GET ?session_id=… — метаданные сессии Потока (демо-флаг и квоты визуала).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("session_id")?.trim();
    if (!sessionId) {
      return NextResponse.json({ error: "session_id обязателен" }, { status: 400 });
    }

    const supabase = createServerClient();
    const isDemo = await isDemoProductSession(supabase as any, sessionId);
    const visual = await getVisualQuota(supabase as any, sessionId);

    return NextResponse.json({
      success: true,
      session_id: sessionId,
      is_demo: isDemo,
      visual_quota: {
        used: visual.used,
        remaining: visual.remaining,
        limit: visual.limit,
      },
    });
  } catch (error: unknown) {
    console.error("[session-meta]", error);
    return NextResponse.json({ error: "Внутренняя ошибка" }, { status: 500 });
  }
}
