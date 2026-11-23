import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { telegramAnswerCallbackQuery, telegramEditMessage, type InlineKeyboardButton } from "./bot-api";
import { actionLabel } from "./action-cards";
import { executeTgAction, inverseAction, isTgAction, type ExecDeps, type ExecResult, type TgAction } from "./action-exec";
import { escapeHtml, italic } from "./format";
import { sendHtmlSafe } from "./send-safe";
import { fetchTelegramLinkByTelegramUserId } from "./telegram-db";

/**
 * Действия из Telegram: карточка с кнопками «Подтвердить» и «Отмена», затем результат и кнопка «Отменить действие» (если действие обратимо).
 * Каждое действие хранится в базе с коротким кодом в кнопке. Повторное нажатие не выполняет действие второй раз: статус меняется одним условным обновлением.
 * Нажимать кнопки может только владелец привязанного чата; карточка живёт 15 минут.
 */

const TABLE = "seller_hub_tg_pending_actions";

export type PendingRow = { id: string; short_id: string; user_id: string; chat_id: number; action: TgAction; summary: string; status: "pending" | "running" | "done" | "failed" | "cancelled" | "expired" | "undone"; result: string | null; undo: TgAction | null; message_id: number | null; expires_at: string };

export const newShortId = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);

type Keyboard = { inline_keyboard: InlineKeyboardButton[][] };
export const confirmKeyboard = (short: string): Keyboard => ({ inline_keyboard: [[{ text: "✅ Подтвердить", callback_data: `ax:y:${short}` }, { text: "✖ Отмена", callback_data: `ax:n:${short}` }]] });
export const undoKeyboard = (short: string): Keyboard => ({ inline_keyboard: [[{ text: "↩ Отменить действие", callback_data: `ax:u:${short}` }]] });
const NO_KEYBOARD: Keyboard = { inline_keyboard: [] };

/** Разбор данных кнопки: «ax:y:код». */
export function parseActionCallback(data: string | undefined): { op: "y" | "n" | "u"; short: string } | null {
  const m = /^ax:([ynu]):([A-Za-z0-9]{4,16})$/.exec(data ?? "");
  return m ? { op: m[1] as "y" | "n" | "u", short: m[2]! } : null;
}

/** Кладёт действие в базу и отправляет карточку с кнопками. Возвращает код действия. */
export async function sendActionCard(db: SupabaseClient, input: { userId: string; chatId: number; action: TgAction; html: string }): Promise<string> {
  const short = newShortId();
  const { error } = await db.from(TABLE).insert({ short_id: short, user_id: input.userId, chat_id: input.chatId, action: input.action, summary: input.html });
  if (error) throw new Error(`действие не сохранилось: ${error.message}`);
  const sent = await sendHtmlSafe({ chatId: input.chatId, html: input.html, replyMarkup: confirmKeyboard(short) });
  if (sent.messageId) await db.from(TABLE).update({ message_id: sent.messageId }).eq("short_id", short);
  return short;
}

const resultLine = (ok: boolean, text: string) => `${ok ? "✅" : "❌"} ${escapeHtml(text)}`;

type Tg = {
  answer: (callbackQueryId: string, text?: string, showAlert?: boolean) => Promise<unknown>;
  edit: (input: { chatId: number; messageId: number; text: string; replyMarkup?: Keyboard }) => Promise<unknown>;
  send: (input: { chatId: number; html: string; replyMarkup?: Keyboard }) => Promise<unknown>;
};

const realTg: Tg = {
  answer: (callbackQueryId, text, showAlert) => telegramAnswerCallbackQuery({ callbackQueryId, text, showAlert }),
  edit: (input) => telegramEditMessage(input),
  send: (input) => sendHtmlSafe(input),
};

async function showResult(tg: Tg, row: PendingRow, chatId: number, messageId: number | undefined, html: string, keyboard: Keyboard) {
  const id = messageId ?? row.message_id ?? undefined;
  if (!id) {
    await tg.send({ chatId, html, replyMarkup: keyboard });
    return;
  }
  try {
    await tg.edit({ chatId, messageId: id, text: html, replyMarkup: keyboard });
  } catch (e) {
    // Сообщение уже менялось или устарело: отправляем результат новым сообщением, человек не должен остаться без ответа.
    console.warn("[telegram] карточка действия не обновилась:", e instanceof Error ? e.message : String(e));
    await tg.send({ chatId, html, replyMarkup: keyboard });
  }
}

export type CallbackIn = { id: string; data?: string; from: { id: number }; message?: { message_id: number; chat: { id: number } } };

type Deps = { tg?: Partial<Tg>; exec?: (db: SupabaseClient, userId: string, action: TgAction) => Promise<ExecResult>; execDeps?: Partial<ExecDeps>; now?: () => number };

/** Нажатие кнопки действия. true: это была кнопка действий (обработана полностью). */
export async function handleActionCallback(db: SupabaseClient, cb: CallbackIn, deps: Deps = {}): Promise<boolean> {
  const parsed = parseActionCallback(cb.data);
  if (!parsed) return false;
  const tg: Tg = { ...realTg, ...deps.tg };
  const answer = (text?: string, showAlert = false) => tg.answer(cb.id, text, showAlert).catch(() => undefined);
  const exec = deps.exec ?? ((d, userId, action) => executeTgAction(d, userId, action, deps.execDeps));
  const nowIso = new Date((deps.now ?? Date.now)()).toISOString();

  const link = await fetchTelegramLinkByTelegramUserId(db, cb.from.id);
  const { data } = await db.from(TABLE).select("*").eq("short_id", parsed.short).maybeSingle();
  const row = data as PendingRow | null;
  if (!link || !row || row.user_id !== link.user_id) {
    void answer("Действие не найдено или у вас нет доступа", true);
    return true;
  }
  const chatId = cb.message?.chat.id ?? row.chat_id;
  const messageId = cb.message?.message_id;

  // Отмена до выполнения.
  if (parsed.op === "n") {
    const { data: upd } = await db.from(TABLE).update({ status: "cancelled", resolved_at: nowIso }).eq("short_id", parsed.short).eq("status", "pending").select("short_id");
    if (!upd || upd.length === 0) {
      void answer(row.status === "done" ? "Уже выполнено" : "Это действие уже обработано");
      return true;
    }
    void answer("Отменено");
    await showResult(tg, row, chatId, messageId, `${row.summary}\n\n${resultLine(false, "Отменено, в кабинете ничего не изменилось.")}`, NO_KEYBOARD);
    return true;
  }

  // Подтверждение: одно условное обновление не даёт выполнить действие дважды.
  if (parsed.op === "y") {
    if (new Date(row.expires_at).getTime() < (deps.now ?? Date.now)()) {
      await db.from(TABLE).update({ status: "expired", resolved_at: nowIso }).eq("short_id", parsed.short).eq("status", "pending");
      void answer("Карточка устарела. Попросите действие заново", true);
      await showResult(tg, row, chatId, messageId, `${row.summary}\n\n${resultLine(false, "Карточка устарела (15 минут). Попросите это действие заново, данные могли измениться.")}`, NO_KEYBOARD);
      return true;
    }
    const { data: claimed } = await db.from(TABLE).update({ status: "running" }).eq("short_id", parsed.short).eq("status", "pending").select("short_id");
    if (!claimed || claimed.length === 0) {
      void answer(row.status === "running" ? "Уже выполняется…" : "Это действие уже обработано");
      return true;
    }
    void answer("Выполняю…");
    let res: ExecResult;
    try {
      res = await exec(db, row.user_id, row.action);
    } catch (e) {
      res = { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Не удалось выполнить действие" };
    }
    const undo: TgAction | null = res.ok ? (row.action.type === "order_create" && res.createdId ? { type: "order_delete", orderId: res.createdId, title: row.action.input.title } : inverseAction(row.action)) : null;
    // Тестовый режим: действие проверено, но не отправлено. Показываем это явно, а не как ошибку.
    const finalStatus = res.ok ? "done" : res.simulated ? "cancelled" : "failed";
    await db.from(TABLE).update({ status: finalStatus, result: res.message.slice(0, 500), undo, resolved_at: nowIso }).eq("short_id", parsed.short);
    const line = res.simulated ? `🧪 ${escapeHtml(res.message)}` : resultLine(res.ok, res.message);
    await showResult(tg, row, chatId, messageId, `${row.summary}\n\n${line}`, undo ? undoKeyboard(parsed.short) : NO_KEYBOARD);
    return true;
  }

  // Откат выполненного действия.
  if (row.status !== "done" || !row.undo) {
    void answer(row.status === "undone" ? "Уже отменено" : "Это действие отменить нельзя", true);
    return true;
  }
  const { data: claimedUndo } = await db.from(TABLE).update({ status: "running" }).eq("short_id", parsed.short).eq("status", "done").select("short_id");
  if (!claimedUndo || claimedUndo.length === 0) {
    void answer("Уже обрабатывается");
    return true;
  }
  void answer("Отменяю…");
  let back: ExecResult;
  try {
    back = await exec(db, row.user_id, row.undo);
  } catch (e) {
    back = { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Не удалось отменить" };
  }
  await db.from(TABLE).update({ status: back.ok ? "undone" : "done", result: back.message.slice(0, 500) }).eq("short_id", parsed.short);
  const line = back.ok ? resultLine(true, "Действие отменено, прежнее значение возвращено.") : resultLine(false, `Не удалось отменить: ${back.message}`);
  await showResult(tg, row, chatId, messageId, `${row.summary}\n\n${resultLine(true, "Было выполнено")}\n${line}`, back.ok ? NO_KEYBOARD : undoKeyboard(parsed.short));
  return true;
}

/** Кнопка «Спросить агента» под уведомлением: вопрос собирается из самого уведомления, дальше отвечает обычный помощник (с карточками действий). */
export async function handleAskCallback(db: SupabaseClient, cb: CallbackIn, ask: (link: { user_id: string; chat_id: number; telegram_user_id: number }, text: string) => Promise<void>, tg: Partial<Tg> = {}): Promise<boolean> {
  const m = /^nq:(\d{1,12})$/.exec(cb.data ?? "");
  if (!m) return false;
  const t: Tg = { ...realTg, ...tg };
  const link = await fetchTelegramLinkByTelegramUserId(db, cb.from.id);
  const { data } = await db.from("seller_hub_notify_queue").select("user_id, title, body, subject").eq("id", Number(m[1])).maybeSingle();
  const row = data as { user_id: string; title: string; body: string; subject: string | null } | null;
  if (!link || !row || row.user_id !== link.user_id) {
    await t.answer(cb.id, "Не нашёл это уведомление", true).catch(() => undefined);
    return true;
  }
  await t.answer(cb.id, "Спрашиваю агента…").catch(() => undefined);
  const about = [row.title, row.subject ? `Товар: ${row.subject}` : "", row.body].filter(Boolean).join(". ").slice(0, 700);
  await ask({ user_id: link.user_id, chat_id: link.chat_id, telegram_user_id: link.telegram_user_id }, `Расскажи подробнее и подскажи, что делать. Уведомление: ${about}`);
  return true;
}

/** Подпись карточки в журнале диалога. */
export const describeForLog = (a: TgAction) => `${actionLabel(a)} (${a.type})`;

export { isTgAction, italic };
