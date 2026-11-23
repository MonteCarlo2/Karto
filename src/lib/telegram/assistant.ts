import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyIntent } from "@/lib/seller-hub/agent/intent";
import { progressPhrases, withProgress } from "./progress";
import { sendHtmlSafe } from "./send-safe";
import { HELP_TEXT, MENU_KEYBOARD, UNKNOWN_TEXT, eventsText, ordersText, plansText, reviewsText, strictIntent, summaryText, tasksText, type Intent } from "./assistant-text";
import { answerWithAgent } from "./assistant-ai";
import { sendActionCard } from "./actions";
import { detectQuickCommand, quickDepsFor, runQuickCommand } from "./quick-commands";
import { detectFactIntent, factText, kbFact, type FactIntent } from "./assistant-facts";
import type { RenderCtx } from "./assistant-render";
import type { TelegramAnswer } from "./assistant-render";
import { getTelegramSession, setTelegramSession } from "./telegram-db";
import { normalizeStoredStrategy } from "@/lib/seller-hub/agent/strategy";
import { listOrders } from "@/lib/seller-hub/orders/repository";
import { readSellerHubEventHistory } from "@/lib/seller-hub/event-history-server";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import { appBaseUrl } from "@/lib/seller-hub/notify/compose";

/**
 * Telegram-помощник: человек спрашивает, как дела в магазине, и получает ответ из настоящих данных кабинета.
 * Кнопки и команды отвечают сразу по готовым данным, всё остальное («сколько заказов сегодня», «какие акции скоро», «как идёт мой план») разбирает тот же агент,
 * что и в чате на сайте. Планы и задачи отсюда не создаются, а цену, скидку и рекламу можно менять только после подтверждения кнопкой. Отвечаем только в личном чате, привязанном к аккаунту.
 */

const MARKETPLACE = "wildberries";
/** Разговор с агентом продолжается, пока между сообщениями не прошло это время: так работают уточнения «а за вчера?». */
const CONVERSATION_MS = 3 * 3_600_000;

export type LinkedChat = { user_id: string; chat_id: number; telegram_user_id: number };

async function answerFixed(supabase: SupabaseClient, userId: string, intent: Intent, nowMs: number): Promise<string[]> {
  const url = `${appBaseUrl()}/studio/seller-hub`;
  switch (intent) {
    case "help":
      return [HELP_TEXT];
    case "unknown":
      return [UNKNOWN_TEXT];
    case "summary": {
      const [composed, tasks] = await Promise.all([composeSnapshot(new SyncStore(supabase), supabase, { userId, marketplaceId: MARKETPLACE }), listSellerHubTasks(userId, MARKETPLACE).catch(() => [])]);
      return summaryText(composed?.snapshot ?? null, tasks, nowMs);
    }
    case "tasks":
      return tasksText(await listSellerHubTasks(userId, MARKETPLACE), nowMs, url);
    case "events":
      return eventsText(await readSellerHubEventHistory(userId, MARKETPLACE), nowMs, url);
    case "plans": {
      const { data, error } = await supabase
        .from("seller_hub_ai_findings")
        .select("title, strategy, strategy_state")
        .eq("user_id", userId)
        .eq("marketplace_id", MARKETPLACE)
        .eq("owner_accepted", true)
        .not("strategy_state->>acceptedAt", "is", null)
        .limit(30);
      if (error) throw new Error(error.message);
      return plansText(
        (data ?? []).map((r) => ({ title: String(r.title ?? normalizeStoredStrategy(r.strategy)?.goal ?? "План"), reviewAfterDays: normalizeStoredStrategy(r.strategy)?.reviewAfterDays ?? null, state: (r.strategy_state ?? null) as never })),
        nowMs,
      );
    }
    case "orders":
      return ordersText(await listOrders(supabase, userId), nowMs);
    case "reviews": {
      const composed = await composeSnapshot(new SyncStore(supabase), supabase, { userId, marketplaceId: MARKETPLACE });
      return reviewsText(composed?.snapshot ?? null, url);
    }
  }
}

/** Ответ на вопрос про цифры. Планы берутся из списка планов (с датой итога), новости из истории событий, остальное из снимка кабинета. */
async function factAnswer(supabase: SupabaseClient, userId: string, fact: FactIntent, text: string, nowMs: number): Promise<string[]> {
  if (fact === "plans") return answerFixed(supabase, userId, "plans", nowMs);
  const needsEvents = fact.startsWith("news_") || fact.startsWith("wb_");
  const [composed, events] = await Promise.all([composeSnapshot(new SyncStore(supabase), supabase, { userId, marketplaceId: MARKETPLACE }), needsEvents ? readSellerHubEventHistory(userId, MARKETPLACE) : Promise.resolve([])]);
  const ctx: RenderCtx = { snapshot: composed?.snapshot ?? null, events, tasks: [], nowMs, url: `${appBaseUrl()}/studio/seller-hub` };
  return factText(fact, text, ctx);
}

const recent = new Map<string, number[]>();
const LIMIT_PER_MINUTE = 12;

/** Не больше 12 вопросов в минуту на человека: защита от случайного или намеренного залива запросами. */
export function tooManyQuestions(userId: string, nowMs: number): boolean {
  const list = (recent.get(userId) ?? []).filter((t) => nowMs - t < 60_000);
  list.push(nowMs);
  recent.set(userId, list);
  return list.length > LIMIT_PER_MINUTE;
}

/** Пока бот готовит ответ, в чате живёт сообщение «Думаю…» с бегущими точками (см. progress.ts), а не тишина. */
async function withTyping<T>(chatId: number, text: string, run: () => Promise<T>): Promise<T> {
  return withProgress(chatId, progressPhrases(classifyIntent(text)), run);
}

function keyboardFor(answer: TelegramAnswer) {
  if (!answer.keyboard) return MENU_KEYBOARD;
  return { keyboard: [...answer.keyboard, ...MENU_KEYBOARD.keyboard], resize_keyboard: true, is_persistent: false, one_time_keyboard: true };
}

async function sendAnswer(chatId: number, messages: string[], keyboard: typeof MENU_KEYBOARD) {
  for (let i = 0; i < messages.length; i += 1) {
    await sendHtmlSafe({ chatId, html: messages[i]!, ...(i === messages.length - 1 ? { replyMarkup: keyboard } : {}) });
  }
}

/** Отвечает на сообщение привязанного пользователя. Любой сбой превращается в понятную фразу, а не в тишину. */
export async function handleAssistantMessage(supabase: SupabaseClient, link: LinkedChat, text: string): Promise<void> {
  const nowMs = Date.now();
  if (tooManyQuestions(link.user_id, nowMs)) {
    if ((recent.get(link.user_id)?.length ?? 0) === LIMIT_PER_MINUTE + 1) await sendHtmlSafe({ chatId: link.chat_id, html: "⏳ <b>Слишком много вопросов подряд</b>\n\nПодождите минуту, и я отвечу." });
    return;
  }

  // Кнопки меню и команды: быстрый ответ по готовым данным.
  const fixed = strictIntent(text);
  if (fixed) {
    try {
      await sendAnswer(link.chat_id, await withTyping(link.chat_id, text, () => answerFixed(supabase, link.user_id, fixed, nowMs)), MENU_KEYBOARD);
    } catch (error) {
      console.error("[telegram] помощник не смог ответить:", error instanceof Error ? error.message : String(error));
      await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось прочитать данные магазина</b>\n\nПопробуйте ещё раз через минуту.", replyMarkup: MENU_KEYBOARD });
    }
    return;
  }

  // Быстрые команды («останови рекламу», «пополни бюджет», «подними цену на ведро на 3%»): выбор кнопками и карточка подтверждения, без нейросети.
  const quick = detectQuickCommand(text);
  if (quick) {
    try {
      await runQuickCommand(quick, { userId: link.user_id, chatId: link.chat_id }, quickDepsFor(supabase));
    } catch (error) {
      console.error("[telegram] быстрая команда не выполнилась:", error instanceof Error ? error.message : String(error));
      await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось подготовить действие</b>\n\nПопробуйте ещё раз через минуту.", replyMarkup: MENU_KEYBOARD });
    }
    return;
  }

  // Вопросы про цифры («сколько заказов сегодня», «акции», «воронка», «цена на ведро»): точный ответ из данных, без нейросети.
  const fact = detectFactIntent(text);
  if (fact) {
    try {
      await sendAnswer(link.chat_id, await withTyping(link.chat_id, text, () => factAnswer(supabase, link.user_id, fact, text, nowMs)), MENU_KEYBOARD);
    } catch (error) {
      console.error("[telegram] ответ по цифрам не собрался:", error instanceof Error ? error.message : String(error));
      await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось прочитать данные магазина</b>\n\nПопробуйте ещё раз через минуту.", replyMarkup: MENU_KEYBOARD });
    }
    return;
  }

  // Новый разговор по команде.
  if (/^\/new\b/i.test(text.trim()) || /^новый разговор$/i.test(text.trim())) {
    await setTelegramSession(supabase, { telegramUserId: link.telegram_user_id, chatId: link.chat_id, state: "idle", payload: {} });
    await sendHtmlSafe({ chatId: link.chat_id, html: "Начали с чистого листа. О чём спросить?", replyMarkup: MENU_KEYBOARD });
    return;
  }

  // Свободный вопрос: агент. Разговор продолжается, если последний ответ был недавно.
  try {
    const session = await getTelegramSession(supabase, link.telegram_user_id).catch(() => null);
    const payload = (session?.state === "idle" ? session.payload : {}) as { aiChatId?: unknown; aiAt?: unknown };
    const alive = typeof payload.aiChatId === "string" && typeof payload.aiAt === "number" && nowMs - payload.aiAt < CONVERSATION_MS;
    const { answer, chatId, failed } = await withTyping(link.chat_id, text, () => answerWithAgent(supabase, link.user_id, text, alive ? (payload.aiChatId as string) : null, nowMs));
    if (failed) {
      // Агент не ответил (нейросеть недоступна): если в базе знаний есть точный ответ, показываем его. Чужие цифры вместо ответа не подставляем.
      const kb = kbFact(text);
      if (kb) {
        await sendAnswer(link.chat_id, kb, MENU_KEYBOARD);
        return;
      }
    }
    await sendAnswer(link.chat_id, answer.messages, keyboardFor(answer));
    for (const card of answer.actions ?? []) {
      try {
        await sendActionCard(supabase, { userId: link.user_id, chatId: link.chat_id, action: card.action, html: card.html });
      } catch (e) {
        console.error("[telegram] карточка действия не отправилась:", e instanceof Error ? e.message : String(e));
        await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось подготовить подтверждение</b>\n\nПопробуйте ещё раз или сделайте это на сайте.", replyMarkup: MENU_KEYBOARD }).catch(() => undefined);
      }
    }
    if (chatId) await setTelegramSession(supabase, { telegramUserId: link.telegram_user_id, chatId: link.chat_id, state: "idle", payload: { aiChatId: chatId, aiAt: Date.now() } });
  } catch (error) {
    console.error("[telegram] агент не ответил:", error instanceof Error ? error.message : String(error));
    // Агент недоступен: честно говорим об этом, а не подставляем несвязанный ответ.
    try {
      await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось ответить на вопрос</b>\n\nПопробуйте ещё раз через минуту или нажмите кнопку ниже.", replyMarkup: MENU_KEYBOARD });
    } catch {
      await sendHtmlSafe({ chatId: link.chat_id, html: "⚠️ <b>Не получилось ответить</b>\n\nПопробуйте ещё раз через минуту.", replyMarkup: MENU_KEYBOARD }).catch(() => undefined);
    }
  }
}

/** Что ответил бы помощник, не отправляя в Telegram: тот же порядок (кнопки и команды, точные цифры, агент), для проверки ответов и оформления. */
export async function previewAnswer(supabase: SupabaseClient, userId: string, text: string, chatId: string | null): Promise<{ messages: string[]; chatId: string | null; via: "fixed" | "facts" | "agent" | "fallback" }> {
  const nowMs = Date.now();
  const fixed = strictIntent(text);
  if (fixed) return { messages: await answerFixed(supabase, userId, fixed, nowMs), chatId, via: "fixed" };
  const fact = detectFactIntent(text);
  if (fact) {
    return { messages: await factAnswer(supabase, userId, fact, text, nowMs), chatId, via: "facts" };
  }
  const { answer, chatId: next, failed } = await answerWithAgent(supabase, userId, text, chatId, nowMs);
  if (failed) {
    const kb = kbFact(text);
    if (kb) return { messages: kb, chatId: next, via: "fallback" };
  }
  return { messages: answer.messages, chatId: next, via: "agent" };
}
