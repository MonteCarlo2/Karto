import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { previewAnswer } from "@/lib/telegram/assistant";
import { MENU_KEYBOARD } from "@/lib/telegram/assistant-text";
import { htmlToPlain, sendHtmlSafe } from "@/lib/telegram/send-safe";
import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * Проверка помощника: что он ответит на вопрос. Тот же путь, что и у бота (кнопки, точные цифры, агент, оформление под Telegram).
 * С send: true ответ ещё и уходит в ваш привязанный чат, чтобы увидеть настоящее оформление в Telegram.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { text?: unknown; chatId?: unknown; send?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  if (!text) return NextResponse.json({ ok: false, error: "Напишите вопрос" }, { status: 400 });
  try {
    const db = createServerClient();
    const answer = await previewAnswer(db, auth.user.id, text, typeof body?.chatId === "string" ? body.chatId : null);
    let delivered: { ok: boolean; plainFallback: boolean; error?: string } | undefined;
    if (body?.send === true) {
      const link = await fetchTelegramLinkByUserId(db, auth.user.id);
      if (!link || link.notify_enabled === false) delivered = { ok: false, plainFallback: false, error: "Telegram не подключён" };
      else {
        try {
          let plainFallback = false;
          for (let i = 0; i < answer.messages.length; i += 1) {
            const r = await sendHtmlSafe({ chatId: link.chat_id, html: answer.messages[i]!, ...(i === answer.messages.length - 1 ? { replyMarkup: MENU_KEYBOARD } : {}) });
            plainFallback ||= r.plain;
          }
          delivered = { ok: true, plainFallback };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          delivered = { ok: false, plainFallback: false, error: /chat not found|can't initiate conversation/i.test(message) ? "Вы ещё не запускали этого бота: откройте его в Telegram и нажмите Start" : message || "Telegram не принял сообщение" };
        }
      }
    }
    return NextResponse.json({ ok: true, via: answer.via, chatId: answer.chatId, messages: answer.messages, plain: answer.messages.map(htmlToPlain), delivered });
  } catch (error) {
    console.error("[telegram-assistant] предпросмотр:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось ответить" }, { status: 502 });
  }
}
