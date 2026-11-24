import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { appBaseUrl } from "@/lib/seller-hub/notify/compose";
import { sendHtmlSafe } from "@/lib/telegram/send-safe";
import { bold, clip, escapeHtml, link } from "@/lib/telegram/format";
import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Сообщение о задаче агента в Telegram. Отправляется только в чат, который сам владелец привязал к своему аккаунту:
 * произвольный chatId из запроса не принимается (иначе любой вошедший мог бы писать от имени бота в чужие чаты).
 */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const link0 = await fetchTelegramLinkByUserId(createServerClient(), auth.user.id);
  if (!link0 || link0.notify_enabled === false) {
    return NextResponse.json({ ok: false, error: "Telegram не подключён. Подключите его в разделе «Кабинет и API» → «Уведомления»." }, { status: 409 });
  }

  const title = clip(body.title || "Задача Агента", 180);
  try {
    await sendHtmlSafe({
      chatId: link0.chat_id,
      html: `${bold(title)}\n\n${escapeHtml("Подтверждение только на сайте. В кабинет WB ничего не уйдёт, пока вы не нажмёте «Применить».")}\n\n${link("Открыть Агента", `${appBaseUrl()}/studio/seller-hub`)}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Telegram не отправил сообщение" }, { status: 502 });
  }
}
