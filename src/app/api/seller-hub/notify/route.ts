import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { telegramSendMessage } from "@/lib/telegram/bot-api";

export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: { chatId?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  }

  const chatId = body.chatId?.trim();
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "Укажите chat id Telegram" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://karto.pro";
  const title = (body.title || "Задача агента Seller Hub").slice(0, 180);

  try {
    await telegramSendMessage({
      chatId,
      text: `${title}\n\nПодтверждение только на сайте: ${appUrl}/studio/seller-hub\nВ кабинет WB ничего не уйдёт, пока вы не нажмёте «Применить».`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Telegram не отправил сообщение" },
      { status: 502 }
    );
  }
}
