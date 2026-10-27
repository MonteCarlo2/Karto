import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { listChats, loadChat, runChatTurn } from "@/lib/seller-hub/agent/chat-run";
import { loadScenarioProducts } from "@/lib/seller-hub/agent/scenario-inputs";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const MARKETPLACE = "wildberries";

/** Диалоги «поставить задачу ИИ»: список или один диалог. Только чтение из нашей базы. */
export async function GET(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  try {
    const db = createServerClient();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ ok: true, chats: await listChats(db, auth.user.id) });
    const chat = await loadChat(db, auth.user.id, id);
    if (!chat) return NextResponse.json({ ok: false, error: "Диалог не найден" }, { status: 404 });
    return NextResponse.json({ ok: true, chat });
  } catch {
    return NextResponse.json({ ok: false, error: "Диалог не прочитался" }, { status: 502 });
  }
}

/** Новое сообщение владельца: ИИ задаёт уточняющие вопросы или составляет планы. Закрыть диалог: action close. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { chatId?: unknown; message?: unknown; action?: unknown } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Неверный запрос" }, { status: 400 });
  const db = createServerClient();
  const chatId = typeof body.chatId === "string" ? body.chatId : null;
  if (body.action === "close" && chatId) {
    await db.from("seller_hub_ai_chats").update({ state: "closed", updated_at: new Date().toISOString() }).eq("id", chatId).eq("user_id", auth.user.id);
    return NextResponse.json({ ok: true });
  }
  if (typeof body.message !== "string" || !body.message.trim()) return NextResponse.json({ ok: false, error: "Напишите задачу" }, { status: 400 });
  try {
    const built = await composeSnapshot(new SyncStore(db), db, { userId: auth.user.id, marketplaceId: MARKETPLACE });
    if (!built) return NextResponse.json({ ok: false, error: "Данные кабинета ещё не загружены" }, { status: 409 });
    const nowMs = Date.now();
    const [products, tasks] = await Promise.all([loadScenarioProducts(db, auth.user.id, built.snapshot, nowMs), listSellerHubTasks(auth.user.id, MARKETPLACE)]);
    const tasksByNm = new Map<string, string[]>();
    for (const t of tasks) {
      if (!t.nmId || (t.status !== "active" && t.status !== "in_progress")) continue;
      tasksByNm.set(t.nmId, [...(tasksByNm.get(t.nmId) ?? []), t.title]);
    }
    const result = await runChatTurn({ db, userId: auth.user.id, chatId, message: body.message, products, tasksByNm, nowMs });
    return NextResponse.json({ ok: true, chat: result.chat, planIds: result.planIds, limited: result.error === "limit" });
  } catch (error) {
    console.error("[seller-hub-agent] чат:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось обработать задачу" }, { status: 502 });
  }
}
