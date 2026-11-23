import type { SupabaseClient } from "@supabase/supabase-js";
import { buildChatInput } from "@/lib/seller-hub/agent/chat-input";
import { classifyIntent } from "@/lib/seller-hub/agent/intent";
import { runChatTurn } from "@/lib/seller-hub/agent/chat-run";
import { agentModel, askHubModel } from "@/lib/seller-hub/llm";
import type { AiAsk } from "@/lib/seller-hub/agent/ai-orchestrator";
import { readSellerHubEventHistory } from "@/lib/seller-hub/event-history-server";
import { appBaseUrl } from "@/lib/seller-hub/notify/compose";
import { listSellerHubTasks } from "@/lib/seller-hub/task-engine/repository";
import { bold, escapeHtml, italic } from "./format";
import { renderChatReply, type AnswerAction, type TelegramAnswer } from "./assistant-render";
import { actionCardHtml, cardCtx, priceEditFromBlock } from "./action-cards";
import { isTgAction } from "./action-exec";
import { isSandboxOn } from "@/lib/seller-hub/sandbox";
import { validateOrderInput } from "@/lib/seller-hub/orders/types";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { ChatBlock } from "@/lib/seller-hub/agent/chat";

/**
 * Свободные вопросы в Telegram. Отвечает тот же агент, что и в чате на сайте: у него те же данные магазина, база знаний и поиск по интернету,
 * но в Telegram он только отвечает. Планы, задачи, цены, реклама и поручения создаются и меняются только на сайте: просьба сделать это получает вежливый отказ,
 * а если агент всё же составил план, он тут же отменяется.
 */

const MARKETPLACE = "wildberries";

/** В чате ждут ответа секунды, а не минуты: на сайте агент может думать до 150 секунд, в Telegram ограничиваем минутой. */
/** Как отвечать именно в Telegram: ни карточек, ни статей, ни «смотрите ниже». Всё нужное агент говорит сам, текстом. */
const CHANNEL_NOTE = `

КАНАЛ ОТВЕТА: Telegram. Ответ приходит только текстом: без карточек, блоков, графиков и статей. Не пиши «статья ниже», «смотрите ниже», «в блоке выше» и не отсылай к элементам интерфейса KARTO. Дай полный ответ сам: сначала суть одной фразой, затем нумерованные шаги или короткие абзацы. Нумерованные шаги пиши, только когда уверен в них (по найденным источникам); иначе честно скажи, что точный порядок кнопок стоит сверить в справке WB, и дай то, что знаешь точно. На общий вопрос («как маркировать товар», «как отгрузить заказ») сначала дай общий ответ, затем отдельным коротким абзацем «Для вашего магазина:» примени его к реальным товарам и данным кабинета: назови конкретные товары по названию, скажи, чем это для них важно или удобно и что сделать в первую очередь. Только то, что действительно следует из данных; ничего не выдумывай про свойства товаров. Если связи с магазином нет, абзац не нужен. Связывай по смыслу вопроса, а не по тому, что под рукой: для вопроса про маркировку, упаковку или карточку важны вид товара (металл, пластик, размеры, комплекты, штуки в упаковке), его название и категория; остатки, заказы и скорость продаж упоминай, только если вопрос про них или они прямо меняют совет. Один-два самых подходящих товара, не перечисляй каталог. Для короткого определения («что такое CTR») персонализация не нужна. ОФОРМЛЕНИЕ ДЛЯ TELEGRAM (очень важно, ответ должен быть красиво структурирован и легко читаться):
- Абзацы разделяй пустой строкой, в абзаце не больше 2–3 коротких предложений. Не пиши сплошным текстом.
- Для порядка действий используй нумерованные шаги «1. …», «2. …», каждый шаг одной-двумя фразами, ключевое действие или кнопку выделяй **жирным**.
- Перечисления делай списком «- …». Короткий заголовок раздела пиши отдельной строкой жирным: **Сроки**, **Что подготовить**.
- Важное, предупреждения и советы начинай с отдельной строки «Важно: …» или «Совет: …». Абзац про магазин начинай со слов «Для вашего магазина: …».
- Сначала суть одной-двумя фразами, потом детали. Без таблиц, без заголовков с #; курсив только для оттенков.`;

const telegramAsk: AiAsk = ({ system, user, maxTokens, role, web }) => askHubModel({ system: `${system}${CHANNEL_NOTE}`, user, maxTokens, model: agentModel(role), timeoutMs: 60_000, web });

const CANNOT = `${bold("Планы, задачи и поручения создаются на сайте")}\nЗдесь я отвечаю на вопросы, присылаю уведомления и меняю цену, скидку и рекламу, но каждый раз только после вашего подтверждения кнопкой. Составлять планы лучше на сайте KARTO, в разделе «Агенты»: там видно все шаги.\n\n${italic("Спросите, например: «сколько заказов сегодня», «кто даёт оборот», «подними цену на ведро на 3%», «поставь кампанию на паузу».")}`;

/** Просьба составить план: планы создаются на сайте. Остальные просьбы (цена, пауза, пополнение) идут к агенту и заканчиваются карточкой с подтверждением. */
export function isChangeRequest(text: string): boolean {
  const kind = classifyIntent(text);
  return kind === "plan";
}

export async function answerWithAgent(db: SupabaseClient, userId: string, text: string, chatId: string | null, nowMs = Date.now()): Promise<{ answer: TelegramAnswer; chatId: string | null; failed?: boolean }> {
  if (isChangeRequest(text)) return { answer: { messages: [CANNOT], keyboard: null }, chatId };

  const prepared = await buildChatInput(db, userId);
  if (!prepared) {
    return { answer: { messages: [`${bold("Данные кабинета ещё не загружены")}\nПодключите кабинет Wildberries на сайте, в разделе «Кабинет и API», и подождите минуту: после загрузки я смогу отвечать.`], keyboard: null }, chatId };
  }
  const result = await runChatTurn({ db, userId, chatId, message: text, ...prepared.input, nowMs, ask: telegramAsk, channel: "telegram" });
  // Нейросеть недоступна: вызывающий ответит по простым правилам из готовых данных.
  if (result.error === "ai") {
    const failedText = [...result.chat.messages].reverse().find((m) => m.role === "assistant")?.text;
    const limited = failedText && /лимит|много запросов/i.test(failedText);
    return { answer: { messages: [`${bold(limited ? "⏳ Агент сейчас перегружен" : "⚠️ Не получилось ответить")}\n\n${escapeHtml(limited ? (failedText ?? "") : "ИИ-сервис не ответил. Повторите вопрос через минуту: я никуда не денусь.")}`], keyboard: null }, chatId: result.chat.id, failed: true };
  }

  // Агент составил план по такому вопросу: в Telegram планы не создаются, снимаем его, чтобы он не остался в ленте предложений.
  let planNote = "";
  if (result.planIds.length > 0) {
    await db.from("seller_hub_ai_findings").update({ status: "dismissed" }).in("id", result.planIds).eq("user_id", userId).eq("owner_accepted", false);
    planNote = `\n\n${italic("План по этому вопросу можно составить на сайте, в разделе «Агенты».")}`;
  }

  const last = [...result.chat.messages].reverse().find((m) => m.role === "assistant");
  if (!last) return { answer: { messages: [escapeHtml("Не получилось ответить. Попробуйте ещё раз.")], keyboard: null }, chatId: result.chat.id };

  const [events, tasks] = await Promise.all([readSellerHubEventHistory(userId, MARKETPLACE).catch(() => []), listSellerHubTasks(userId, MARKETPLACE).catch(() => [])]);
  // Общий вопрос («как отгрузить заказ FBS», «что такое ДРР»): отвечаем только текстом, без подставленных данных магазина.
  const general = ["web", "search"].includes(classifyIntent(text));
  // Ссылки на источники нужны редко: когда вопрос про правила, штрафы, налоги или маркировку, где важно проверить первоисточник.
  const showSources = /(штраф|комисси|налог|закон|правил|требован|запрет|тариф|санкци|блокировк)/i.test(text);
  const answer = renderChatReply({ ...last, blocks: general ? [] : (last.blocks ?? []).filter((b) => b.type !== "action" && b.type !== "price_edit" && b.type !== "order") }, { snapshot: prepared.snapshot, events, tasks, nowMs, url: `${appBaseUrl()}/studio/seller-hub`, showSources });
  const cards = await actionCards(db, userId, last.blocks ?? [], prepared.snapshot);
  if (cards.length > 0) answer.actions = cards;
  else if ((last.blocks ?? []).some((b) => b.type === "action" || b.type === "price_edit" || b.type === "order")) answer.messages.push(italic("Это изменение нельзя подготовить здесь. Откройте сайт KARTO, раздел «Агенты»."));
  if (planNote) answer.messages[answer.messages.length - 1] += planNote;
  return { answer, chatId: result.chat.id };
}

/** Блоки-действия ответа агента (цена, скидка, пауза, пополнение…) в карточки с подтверждением. Блоки, которые здесь выполнить нельзя, отбрасываются. */
export async function actionCards(db: SupabaseClient, userId: string, blocks: ChatBlock[], snapshot: SellerCatalogSnapshot | null): Promise<AnswerAction[]> {
  const ctx = cardCtx(snapshot);
  const out: AnswerAction[] = [];
  let sandbox: boolean | null = null;
  for (const b of blocks) {
    if (out.length >= 2) break;
    let action: AnswerAction["action"] | null = null;
    let why: string | null = null;
    if (b.type === "action" && isTgAction(b.action)) {
      action = b.action;
      why = b.effect ?? null;
    } else if (b.type === "price_edit") {
      action = priceEditFromBlock(snapshot, b);
    } else if (b.type === "order") {
      const valid = validateOrderInput({ ...b.input, createdFrom: "chat" });
      if (valid.ok) action = { type: "order_create", input: valid.value, ...(b.replaceId ? { replaceId: b.replaceId } : {}) };
    }
    if (!action) continue;
    if (sandbox === null) sandbox = await isSandboxOn(db, userId);
    out.push({ action, html: actionCardHtml(action, ctx, { sandbox, why }) });
  }
  return out;
}
