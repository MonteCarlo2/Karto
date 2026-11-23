import { NextRequest, NextResponse } from "next/server";
import { requireSellerHubUser } from "@/lib/seller-hub/access";
import { appBaseUrl, telegramBlock } from "@/lib/seller-hub/notify/compose";
import { MENU_KEYBOARD } from "@/lib/telegram/assistant-text";
import { sendHtmlSafe } from "@/lib/telegram/send-safe";
import { fetchTelegramLinkByUserId } from "@/lib/telegram/telegram-db";
import { isTelegramConfigured } from "@/lib/telegram/config";
import { createServerClient } from "@/lib/supabase/server";
import { enqueueNotifications, flushNotifications } from "@/lib/seller-hub/notify/dispatch";

export const dynamic = "force-dynamic";

/** Пробное уведомление в привязанный Telegram: показывает, как будут выглядеть настоящие, и проверяет, что доставка работает. */
export async function POST(request: NextRequest) {
  const auth = await requireSellerHubUser(request);
  if (!auth.user) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!isTelegramConfigured()) return NextResponse.json({ ok: false, error: "На сервере не задан токен Telegram-бота. Подключение временно недоступно." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { full?: unknown } | null;
  const db = createServerClient();
  const link = await fetchTelegramLinkByUserId(db, auth.user.id);
  if (!link) return NextResponse.json({ ok: false, error: "Telegram ещё не подключён. Нажмите «Подключить Telegram» выше." }, { status: 409 });
  if (link.notify_enabled === false) return NextResponse.json({ ok: false, error: "Уведомления в этот чат выключены: бот был заблокирован. Подключите Telegram заново." }, { status: 409 });

  // Полная проверка цепочки: уведомление проходит очередь в базе, настройки и отправку так же, как настоящее.
  if (body?.full === true) {
    const key = `test:${Date.now()}`;
    const now = Date.now();
    const queued = await enqueueNotifications(db, auth.user.id, [{ dedupeKey: key, category: "event", severity: "important", title: "Проверка цепочки уведомлений", body: "Это сообщение прошло через очередь, настройки и доставку, как настоящее уведомление.", subject: "Проверка", at: new Date(now).toISOString() }], now);
    const sent = queued > 0 ? await flushNotifications(db, auth.user.id, now) : 0;
    const row = await db.from("seller_hub_notify_queue").select("status, attempts, last_error").eq("user_id", auth.user.id).eq("dedupe_key", key).maybeSingle();
    const status = (row.data as { status?: string } | null)?.status ?? null;
    return NextResponse.json({ ok: status === "sent", queued, sent, status, error: status === "sent" ? undefined : ((row.data as { last_error?: string } | null)?.last_error ?? "Уведомление не прошло фильтры настроек или не отправилось") });
  }

  const text = telegramBlock(
    { dedupeKey: "test", category: "event", severity: "important", title: "Так выглядят уведомления KARTO", body: "Это пробное сообщение. Настоящие придут, когда в магазине что-то произойдёт: событие, срочная задача, результат работы агента или срок токена.", subject: "Пробное уведомление", at: new Date().toISOString() },
    `${appBaseUrl()}/studio/seller-hub`,
  );
  try {
    await sendHtmlSafe({ chatId: link.chat_id, html: text, replyMarkup: MENU_KEYBOARD });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const notStarted = /chat not found|can't initiate conversation/i.test(message);
    const blocked = /blocked by the user|user is deactivated/i.test(message);
    return NextResponse.json({ ok: false, error: notStarted ? "Вы ещё не запускали этого бота. Откройте его в Telegram и нажмите Start, затем повторите." : blocked ? "Telegram не принял сообщение: бот заблокирован в чате. Разблокируйте его и подключите Telegram заново." : "Telegram не принял сообщение. Попробуйте ещё раз через минуту." }, { status: 502 });
  }
}
