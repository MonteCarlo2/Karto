import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST: отметить прочитанным одно или все уведомления.
 * Body: { id: string } | { markAll: true }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: { id?: string; markAll?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (body.markAll === true) {
    const { error } = await supabase
      .from("user_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      console.error("[notifications/mark-read] markAll:", error);
      return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "Укажите id или markAll: true" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: now })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[notifications/mark-read] one:", error);
    return NextResponse.json({ error: "Не удалось обновить" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
