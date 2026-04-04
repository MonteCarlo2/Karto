import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const MAX_LEN = 8000;

/**
 * POST: один раз ответить на уведомление, если у него включён replies_enabled.
 * Body: { id: string, text: string }
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: { id?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "Укажите id уведомления" }, { status: 400 });
  }
  if (!text || text.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Текст ответа обязателен (до ${MAX_LEN} символов)` },
      { status: 400 }
    );
  }

  const { data: rows, error: selErr } = await supabase
    .from("user_notifications")
    .select("id, replies_enabled, user_reply_text")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selErr) {
    console.error("[notifications/reply] select:", selErr);
    return NextResponse.json({ error: "Не удалось проверить уведомление" }, { status: 500 });
  }
  if (!rows) {
    return NextResponse.json({ error: "Уведомление не найдено" }, { status: 404 });
  }
  if (!rows.replies_enabled) {
    return NextResponse.json({ error: "Ответ на это уведомление не предусмотрен" }, { status: 403 });
  }
  if (rows.user_reply_text) {
    return NextResponse.json({ error: "Вы уже отправили ответ" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("user_notifications")
    .update({ user_reply_text: text, user_replied_at: now })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("user_reply_text", null)
    .select("id")
    .maybeSingle();

  if (updErr) {
    console.error("[notifications/reply] update:", updErr);
    return NextResponse.json({ error: "Не удалось сохранить ответ" }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Ответ уже отправлен или недоступен" }, { status: 409 });
  }

  return NextResponse.json({ success: true, user_replied_at: now });
}
