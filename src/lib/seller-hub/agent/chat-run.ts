import { NO_RULES, applyOwnerRules, currentFromEvidence, loadOwnerRules, withOwnerRules } from "./owner-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { agentModel, askHubModel, extractJson } from "@/lib/seller-hub/llm";
import { buildStoreProfile, withStoreMedians } from "./ai-context";
import type { AiAsk } from "./ai-orchestrator";
import type { Solution } from "./ai-solver";
import { loadAdQueries } from "./ads-queries";
import { adsForPrompt, promosForPrompt } from "./ai-solver";
import { PLAN_REVIEWER_SYSTEM, type PlanReview, applyPlanReview, parsePlanReviews, planForReview } from "./plan-review";
import { monthCapUsd, monthSpend, recordAiUsage, remainingBudget } from "./ai-usage";
import { KB_ARTICLES, kbArticle, searchArticles } from "@/lib/seller-hub/knowledge";
import { classifyIntent } from "./intent";
import { applyPlanEdits, loadPlansInChat } from "./chat-plan-edit";
import { adsStepProposal } from "./strategy-step-proposals";
import { parsePlanAction } from "./strategy";
import { charcMeta } from "./ai-solver";
import { CHAT_FACT_CHECK_SYSTEM, EMPTY_REPLY, campaignOptions, asksWbRules, planLead, CHAT_PLAN_SYSTEM, CHAT_SYSTEM, CHAT_WEB_SYSTEM, MAX_QUESTION_ROUNDS, chatGroups, chatPayload, chatTitle, defaultSuggestions, stripLinks, ensureAnalyticsBlocks, ensureCampaignActions, ensureEventsBlocks, ensureInfoBlocks, ensurePriceEditBlocks, filterArticleBlocks, ensureProductBlocks, ensureTaskBlocks, orderGaps, smartOrderOptions, leadText, parseChatBlocks, parseChatTurn, parsePlanForProduct, planProductPayload, type ChatMessage, type ChatProduct } from "./chat";
import type { ScenarioProduct } from "./scenario-run";

const MARKETPLACE = "wildberries";

const defaultAsk: AiAsk = ({ system, user, maxTokens, role, web }) => askHubModel({ system, user, maxTokens, model: agentModel(role), timeoutMs: 150_000, web });

export type ChatRecord = { id: string; title: string; state: "asking" | "planned" | "closed"; rounds: number; messages: ChatMessage[]; updatedAt: string };

const toRecord = (row: Record<string, unknown>): ChatRecord => ({ id: String(row.id), title: String(row.title ?? ""), state: row.state as ChatRecord["state"], rounds: Number(row.rounds ?? 0), messages: (row.messages ?? []) as ChatMessage[], updatedAt: String(row.updated_at ?? "") });

export async function loadChat(db: SupabaseClient, userId: string, chatId: string): Promise<ChatRecord | null> {
  const { data } = await db.from("seller_hub_ai_chats").select("id, title, state, rounds, messages, updated_at").eq("id", chatId).eq("user_id", userId).maybeSingle();
  return data ? toRecord(data) : null;
}

export async function listChats(db: SupabaseClient, userId: string): Promise<Array<Pick<ChatRecord, "id" | "title" | "state" | "updatedAt">>> {
  const { data } = await db.from("seller_hub_ai_chats").select("id, title, state, updated_at").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("channel", "web").order("updated_at", { ascending: false }).limit(12);
  return (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? ""), state: r.state as ChatRecord["state"], updatedAt: String(r.updated_at) }));
}

export async function runChatTurn(input: {
  db: SupabaseClient;
  userId: string;
  chatId: string | null;
  message: string;
  products: ScenarioProduct[];
  /** Названия открытых сигналов алгоритмов по товарам. */
  tasksByNm: Map<string, string[]>;
  taskList?: import("./chat").ChatTaskRef[];
  /** Весь каталог (id и название): по нему подбираются товары для списков, даже если по ним у ИИ нет фактов. */
  catalog?: Array<{ nmId: string; title: string }>;
  campaigns?: import("./chat").ChatCampaign[];
  /** Остатки в днях по отчёту WB: те же числа, что в разделе «Остатки». */
  stockReport?: unknown;
  cabinetExtra?: unknown;
  nowMs: number;
  ask?: AiAsk;
  /** Откуда разговор: диалоги Telegram хранятся отдельно и в списке диалогов на сайте не показываются. */
  channel?: "web" | "telegram";
  /** Реальный этап работы: клиент по нему переключает анимацию. */
  onPhase?: (phase: import("./intent").WorkKind) => void;
}): Promise<{ chat: ChatRecord; planIds: string[]; costUsd: number; error?: string }> {
  const { db, userId, nowMs } = input;
  const nowIso = new Date(nowMs).toISOString();
  const message = input.message.trim().slice(0, 2000);
  if (!message) throw new Error("Пустое сообщение");

  let chat = input.chatId ? await loadChat(db, userId, input.chatId) : null;
  if (input.chatId && !chat) throw new Error("Диалог не найден");
  if (!chat) {
    const { data, error } = await db.from("seller_hub_ai_chats").insert({ user_id: userId, marketplace_id: MARKETPLACE, title: chatTitle(message), messages: [], state: "asking", rounds: 0, channel: input.channel ?? "web" }).select("id, title, state, rounds, messages, updated_at").single();
    if (error || !data) throw new Error("Диалог не создался");
    chat = toRecord(data);
  }
  const messages: ChatMessage[] = [...chat.messages, { role: "user", text: message, at: nowIso }];
  const save = async (patch: Record<string, unknown>) => {
    await db.from("seller_hub_ai_chats").update({ messages, updated_at: nowIso, ...patch }).eq("id", chat!.id).eq("user_id", userId);
  };

  // Месячный потолок на ИИ и суточный предел: без них ИИ не отвечает, но сообщение владельца сохраняется.
  const spent = await monthSpend(db, userId, nowMs);
  if (remainingBudget(spent.costUsd, monthCapUsd(), nowMs).todayLeft <= 0 || !takeAiBudget(userId, "agent-chat", 30, nowMs).ok) {
    messages.push({ role: "assistant", text: `На сегодня лимит обращений к агенту исчерпан. Завтра он снова на связи.`, at: nowIso });
    await save({});
    return { chat: { ...chat, messages }, planIds: [], costUsd: 0, error: "limit" };
  }

  const profile = buildStoreProfile(input.products);
  const withMedians = withStoreMedians(input.products, profile);
  const facts = new Map(withMedians.filter((p) => p.ai).map((p) => [p.nmId, p.ai!.facts]));
  const chatProducts: ChatProduct[] = withMedians.filter((p) => p.ai).map((p) => ({ nmId: p.nmId, title: p.title, facts: p.ai!.facts, tasks: input.tasksByNm.get(p.nmId) ?? [], ads: p.ads ?? [], adsOther: p.adsOther ?? [], promos: p.promos ?? [], promoOpen: p.promoOpen ?? [], clubDiscount: p.clubDiscount ?? null, card: p.card }));
  const goal = messages.find((m) => m.role === "user")?.text ?? message;
  // Поисковые запросы рекламы по товарам с кампаниями: из них ИИ выбирает минус-фразы (только чтение, любой сбой даёт пустой ответ).
  const adQueriesByNm = await loadAdQueries(db, userId, input.products, nowMs);
  for (const p of chatProducts) p.adQueries = adQueriesByNm.get(p.nmId) ?? [];
  const groups = chatGroups(chatProducts, chat.id, goal);
  const ask = input.ask ?? defaultAsk;
  // Подходящие статьи базы знаний по последней реплике: ИИ может показать одну из них карточкой.
  const kbCandidates = searchArticles(KB_ARTICLES, message, { limit: 4 }).map((h) => ({ id: h.article.id, title: h.article.title }));
  const plansInChat = await loadPlansInChat(db, userId, chat.id).catch(() => []);
  const user = chatPayload({ plansInChat, profile, products: chatProducts, messages, roundsUsed: chat.rounds, nowIso, kbCandidates, campaigns: input.campaigns, stockReport: input.stockReport, cabinetExtra: input.cabinetExtra });

  let costUsd = 0;
  let calls = 0;
  let turn;
  let rawText = "";
  try {
    let first = await ask({ system: CHAT_SYSTEM, user, maxTokens: 4000, role: "chat" });
    calls += 1;
    costUsd += first.costUsd;
    // Ответ пришёл не в разборе (обрыв, лишний текст вокруг): один повтор.
    if (!extractJson(first.text)) {
      first = await ask({ system: CHAT_SYSTEM, user, maxTokens: 4500, role: "chat" });
      calls += 1;
      costUsd += first.costUsd;
    }
    rawText = first.text;
    // Модель ответила просто текстом без разметки (после повтора): показываем его как ответ, а не «не получилось разобрать».
    turn =
      !extractJson(first.text) && first.text.trim().length >= 40
        ? { mode: "answer" as const, reply: first.text.trim().slice(0, 4000), questions: [], selected: [], dropped: 0, reasons: [] }
        : parseChatTurn(first.text, chatProducts, chat.rounds, messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"));
    turn = { ...turn, reply: stripLinks(turn.reply) };
    // Редкий сбой модели: на содержательный вопрос пришло одно-два слова. Спрашиваем ещё раз, а не показываем «ок».
    if (turn.mode === "answer" && (turn.reply.trim().length < 12 || turn.reply === EMPTY_REPLY) && message.length >= 15) {
      const again = await ask({ system: CHAT_SYSTEM, user, maxTokens: 4500, role: "chat" });
      calls += 1;
      costUsd += again.costUsd;
      if (extractJson(again.text)) {
        rawText = again.text;
        const redo = parseChatTurn(again.text, chatProducts, chat.rounds, messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"));
        if (redo.mode !== "answer" || (redo.reply.trim().length >= 12 && redo.reply !== EMPTY_REPLY)) turn = { ...redo, reply: stripLinks(redo.reply) };
      }
    }
  } catch (error) {
    console.error("[seller-hub-agent] чат ИИ не ответил:", error instanceof Error ? error.message : String(error));
    const limited = error instanceof Error && /(?<![0-9])402(?![0-9])|credits|quota|rate/i.test(error.message);
    messages.push({ role: "assistant", text: limited ? "Сейчас много запросов, ответ не получился. Попробуйте ещё раз через пару минут." : "Ответ не получился. Попробуйте ещё раз через минуту.", at: nowIso });
    await save({});
    return { chat: { ...chat, messages }, planIds: [], costUsd, error: "ai" };
  }
  // Вопрос про внешние сведения: ищем в интернете и отвечаем по найденному, с источниками.
  let sources: Array<{ title: string; url: string }> = [];
  if (turn.mode === "answer") {
    const q = (extractJson(rawText) as { web_search?: unknown } | null)?.web_search;
    // Явная просьба узнать в интернете ищем всегда, даже если модель забыла заполнить поле поиска.
    const query = typeof q === "string" && q.trim() ? q.trim().slice(0, 160) : classifyIntent(message) === "web" ? message.trim().slice(0, 160) : "";
    if (query.length >= 3) {
      input.onPhase?.("web");
      try {
        const found = await ask({ system: CHAT_WEB_SYSTEM, user: `${user}\n\nВОПРОС ВЛАДЕЛЬЦА: ${message}\nПОИСКОВЫЙ ЗАПРОС: ${query}`, maxTokens: 3500, role: "chat", web: true });
        calls += 1;
        costUsd += found.costUsd;
        const j = extractJson(found.text) as { reply?: unknown; suggestions?: unknown } | null;
        const text = stripLinks(typeof j?.reply === "string" && j.reply.trim() ? j.reply.trim().slice(0, 4000) : found.text.trim().slice(0, 4000));
        if (text) {
          const sug = (Array.isArray(j?.suggestions) ? j!.suggestions : []).filter((x): x is string => typeof x === "string" && x.trim().length >= 3).map((x) => x.trim().slice(0, 110)).slice(0, 3);
          turn = { ...turn, reply: text, suggestions: sug.length > 0 ? sug : turn.suggestions };
          sources = found.sources ?? [];
          // Мало источников: честно предупреждаем, что условия стоит сверить в официальной справке.
          if (sources.length < 2) turn = { ...turn, reply: `${turn.reply}\n\nПо этому вопросу нашлось мало источников, поэтому точные условия лучше сверить в официальной справке Wildberries.` };
        }
      } catch (error) {
        console.error("[seller-hub-agent] поиск в интернете не удался:", error instanceof Error ? error.message : String(error));
        turn = { ...turn, reply: `${turn.reply}\n\nНайти свежие сведения в интернете сейчас не получилось, поэтому отвечаю по своим знаниям. Для точных данных стоит проверить официальные источники.` };
      }
    }
  }
  if (turn.reasons.length > 0) console.info(`[seller-hub-agent] чат, не принято: ${turn.reasons.join(" | ")}`);

  const known = new Set(chatProducts.map((p) => p.nmId));
  const blockProducts: ChatProduct[] = [...chatProducts, ...(input.catalog ?? []).filter((c) => !known.has(c.nmId)).map((c) => ({ nmId: c.nmId, title: c.title, facts: {}, tasks: [], ads: [], adsOther: [], promos: [], promoOpen: [], clubDiscount: null, card: undefined }) as unknown as ChatProduct)];
  const doSkips: string[] = [];
  // Правка шагов плана словами: сохранённый план меняется сразу, карточка под ответом обновится.
  const editSpecs = ((extractJson(rawText) as { blocks?: unknown } | null)?.blocks ?? []) as unknown;
  const planEdits = Array.isArray(editSpecs) ? (editSpecs as Array<{ type?: unknown; planId?: unknown; op?: unknown; stepIndex?: unknown; day?: unknown; text?: unknown }>).filter((b) => b && b.type === "plan_edit") : [];
  const edited = planEdits.length > 0 && sources.length === 0 ? await applyPlanEdits(db, userId, chat.id, planEdits) : { done: [] as string[], refused: [] as string[], ids: [] as string[] };
  let blocks = filterArticleBlocks(ensureCampaignActions(ensureInfoBlocks(ensureEventsBlocks(ensurePriceEditBlocks(ensureAnalyticsBlocks(ensureTaskBlocks(ensureProductBlocks(parseChatBlocks(rawText, {
    ownerText: message,
    products: blockProducts,
    tasksByNm: input.tasksByNm,
    taskList: input.taskList,
    campaigns: input.campaigns,
    orderIds: ((input.cabinetExtra as { standing_orders?: Array<{ id?: string }> } | undefined)?.standing_orders ?? []).map((o) => String(o.id ?? "")).filter(Boolean),
    resolveDo: (spec) => {
      const sp = input.products.find((p) => p.nmId === spec.nmId);
      const cp = blockProducts.find((p) => p.nmId === spec.nmId);
      if (!sp || !cp) return null;
      const queries = new Map<string, Set<string>>();
      for (const q of cp.adQueries ?? []) queries.set(q.campaignId, (queries.get(q.campaignId) ?? new Set()).add(q.query.toLowerCase()));
      const action = parsePlanAction(spec.action, {
        campaignIds: new Set((cp.ads ?? []).map((c) => c.campaignId)),
        otherCampaignIds: new Set((cp.adsOther ?? []).map((c) => c.campaignId)),
        promoIds: new Set((cp.promos ?? []).map((x) => x.promoId)),
        openPromoIds: new Set((cp.promoOpen ?? []).map((x) => x.promoId)),
        adQueries: queries,
        charcs: charcMeta(cp.card),
      });
      if (!action || action.type === "price") {
        doSkips.push("такое действие по этому товару сейчас недоступно или данные не прошли проверку");
        return null;
      }
      const res = adsStepProposal({ ref: { index: 0, step: { step: "", by: "program", day: 0, when: "сразу", action } }, findingId: "chat", nmId: spec.nmId, planTitle: "Из чата", goal: "", product: sp, adQueries: cp.adQueries });
      if (!res.proposal || !res.proposal.action) {
        doSkips.push(res.skip ?? "действие не прошло проверку");
        return null;
      }
      const facts = res.proposal.facts.filter((f) => !f.startsWith("План «"));
      return { type: "action", action: res.proposal.action, title: res.proposal.title, facts, effect: res.proposal.effect, risk: res.proposal.risk === "high" ? "high" : res.proposal.risk === "medium" ? "medium" : "low" };
    },
    kb: (id) => {
      const a = kbArticle(id);
      return a ? { title: a.title, summary: a.summary, branch: a.branch === "wb" ? ("wb" as const) : ("karto" as const) } : null;
    },
  }), message, blockProducts), message, chatProducts, input.taskList ?? []), message, blockProducts), [...messages.filter((m) => m.role === "user").map((m) => m.text).slice(-3), message].slice(-3), blockProducts), message), message), message, input.campaigns ?? []), message);
  // Ответ из интернета не сопровождаем блоками данных магазина: они подставляются по словам вопроса и тут были бы лишними.
  // Ответ из интернета без блоков данных магазина. Исключение: если вопрос про правила WB и в нашей базе знаний есть близкая статья, прикладываем её рядом с источниками.
  // Ответ из интернета идёт без блоков данных, кроме случая, когда модель сама решила показать данные магазина.
  const wantsVisual = (extractJson(rawText) as { visual?: { need?: unknown } } | null)?.visual?.need === true;
  if (sources.length > 0 && !wantsVisual) blocks = [];
  if ((sources.length > 0 || asksWbRules(message)) && !blocks.some((b) => b.type === "article") && !blocks.some((b) => b.type === "product" || b.type === "products" || b.type === "tasks" || b.type === "price_edit" || b.type === "action")) {
    const hit = searchArticles(KB_ARTICLES, message, { limit: 1 })[0];
    if (hit && hit.score >= 26) blocks = [...blocks, { type: "article" as const, id: hit.article.id, title: hit.article.title, summary: hit.article.summary, branch: hit.article.branch === "wb" ? ("wb" as const) : ("karto" as const) }].slice(0, 2);
  }
  // График, добавленный моделью «для красоты», уместен только при ответе на вопрос. Под просьбой что-то сделать (план, задача, действие) он лишний и не должен превращать её в ответ.
  if (turn.mode !== "answer" && blocks.some((b) => b.type === "analytics") && ensureAnalyticsBlocks([], message, blockProducts).length === 0) blocks = blocks.filter((b) => b.type !== "analytics");
  // Общий ответ без данных кабинета и без поиска проверяется вторым взглядом: определения, расшифровки, формулы, правила WB.
  if (turn.mode === "answer" && sources.length === 0 && blocks.length === 0 && turn.reply.length >= 280) {
    try {
      const checked = await ask({ system: CHAT_FACT_CHECK_SYSTEM, user: JSON.stringify({ question: message, draft_reply: turn.reply, app_facts: "В приложении KARTO Seller Hub есть раздел «Агенты» с разделами «Поручения» (создать, изменить, поставить на паузу и удалить поручение и принятые планы можно там; из чата поручения не меняются), «Журнал» и «Отзывы и автоответы». Это факты о нашем приложении: считай их верными и не снижай уверенность в ответах про них." }), maxTokens: 3000, role: "analyst" });
      calls += 1;
      costUsd += checked.costUsd;
      const verdict = extractJson(checked.text) as { ok?: unknown; fixed?: unknown; issues?: unknown } | null;
      if (verdict && verdict.ok === false && typeof verdict.fixed === "string" && verdict.fixed.trim().length >= 80) {
        console.info(`[seller-hub-agent] проверка фактов исправила ответ: ${Array.isArray(verdict.issues) ? verdict.issues.slice(0, 3).join(" | ") : ""}`);
        turn = { ...turn, reply: verdict.fixed.trim().slice(0, 4000) };
      }
    } catch (error) {
      console.error("[seller-hub-agent] проверка фактов не выполнена:", error instanceof Error ? error.message : String(error));
    }
  }
  // Поручение без названного владельцем времени или срока не создаём: вместо карточки задаём вопросы.
  const gap = orderGaps(rawText);
  if (gap && !blocks.some((b) => b.type === "order")) {
    turn = { ...turn, mode: "ask", reply: "Почти готово. Уточню детали, чтобы поручение сработало ровно так, как вы хотите:", questions: gap.questions, questionOptions: gap.options };
  }
  // Решение о графике принимает модель (поле visual с причиной). need: false — графика и блоков данных не будет, даже если сработала подсказка по словам.
  const visualNeed = (extractJson(rawText) as { visual?: { need?: unknown } } | null)?.visual?.need;
  if (visualNeed === false) blocks = blocks.filter((b) => b.type !== "analytics");
  // Модель не дала текста, но карточки готовы: короткая подводка вместо сообщения об ошибке.
  if (turn.reply === EMPTY_REPLY && blocks.length > 0) turn = { ...turn, reply: "Вот что нашёл в кабинете:" };
  // Этапы, которые сервер действительно прошёл после ответа модели: база знаний и данные кабинета. Клиент по ним показывает анимации.
  if (blocks.some((b) => b.type === "article")) input.onPhase?.("search");
  const dataPhases: Array<import("./intent").WorkKind> = [];
  for (const b of blocks) {
    const k: import("./intent").WorkKind | null =
      b.type === "analytics" ? (b.view === "ads" ? "ads" : "analyze") : b.type === "info" ? (b.kind === "reviews" ? "reviews" : "analyze") : b.type === "events" ? "events" : b.type === "product" || b.type === "products" || b.type === "price_edit" ? "product" : b.type === "tasks" || b.type === "task" || b.type === "order" ? "task" : b.type === "action" ? (/^(deposit|pause|resume|remove_nm|add_nm|bid|create_campaign|minus_phrases|placements|daily_limit)$/.test(b.action.type) ? "ads" : "product") : null;
    if (k && !dataPhases.includes(k)) dataPhases.push(k);
  }
  for (const k of dataPhases) input.onPhase?.(k);
  // С готовым блоком текст остаётся короткой подводкой, без пересказа цифр из блока.
  const forced = turn.mode !== "answer" ? blocks.find((b) => b.type === "tasks" || b.type === "analytics" || b.type === "price_edit" || b.type === "events" || b.type === "action" || b.type === "info") : undefined;
  // Модель задала вопрос, а нужный блок мы добавили сами: подводка по блоку, а не вопрос, на который уже не нужно отвечать.
  const forcedLead = forced?.type === "tasks" ? "Нашёл открытые задачи:" : forced?.type === "analytics" ? "Вот что показывает аналитика:" : forced?.type === "action" ? "Подготовил действие. Проверьте и подтвердите." : forced?.type === "info" ? "Вот что показывает кабинет:" : forced?.type === "events" ? "Вот что происходило в магазине:" : forced?.type === "price_edit" ? "Подготовил изменение. Проверьте значение и подтвердите." : null;
  // Списки из текста убираем только там, где блок сам показывает строки данных (товары, задачи, события, остатки, реклама). Рядом с графиками и действиями текст остаётся целиком: он объясняет и советует.
  const listBlock = blocks.some((b) => b.type === "product" || b.type === "products" || b.type === "tasks" || b.type === "events" || b.type === "info" || (b.type === "analytics" && (b.view === "ads" || b.view === "stock" || b.view === "products")));
  const anyBlock = listBlock || blocks.some((b) => b.type === "analytics" || b.type === "price_edit" || b.type === "action");
  const lead = anyBlock && forcedLead ? forcedLead : listBlock ? leadText(turn.reply) : turn.reply;
  const editNote = [edited.done.length > 0 ? `Готово: ${edited.done.join("; ")}.` : "", edited.refused.length > 0 ? `Не получилось: ${edited.refused.join("; ")}.` : ""].filter(Boolean).join("\n\n");
  const leadFinal0 = doSkips.length > 0 ? `${lead}\n\nНе получилось подготовить действие: ${doSkips[0]}.` : lead;

  const leadFinal = editNote ? `${leadFinal0}\n\n${editNote}` : leadFinal0;

  if (turn.mode === "answer" || edited.done.length + edited.refused.length > 0 || blocks.some((b) => b.type === "tasks" || b.type === "analytics" || b.type === "price_edit" || b.type === "events" || b.type === "action" || b.type === "info")) {
    // Ответ на вопрос или совет: диалог остаётся в прежнем состоянии, раунды вопросов не расходуются, кабинет не меняется.
    messages.push({ role: "assistant", text: leadFinal, at: nowIso, ...(edited.ids.length > 0 ? { planIds: edited.ids } : {}), ...(sources.length > 0 ? { sources } : {}), ...((turn.suggestions && turn.suggestions.length > 0 ? turn.suggestions : defaultSuggestions(blocks)).length > 0 ? { suggestions: turn.suggestions && turn.suggestions.length > 0 ? turn.suggestions : defaultSuggestions(blocks) } : {}), ...(blocks.length > 0 ? { blocks } : {}) });
    await save({});
    await recordAiUsage(db, userId, { kind: "agent-chat", calls, costUsd, nowMs }).catch(() => undefined);
    return { chat: { ...chat, messages }, planIds: edited.ids, costUsd };
  }

  if (turn.mode === "ask") {
    if (turn.mode === "ask" && turn.questions.length > 0) turn = { ...turn, questionOptions: campaignOptions(turn.questions, turn.questionOptions, (input.campaigns ?? []).map((c) => ({ id: c.id, name: c.name }))) };
    if (turn.mode === "ask" && turn.questions.length > 0) {
      const ownerWords = messages.filter((m) => m.role === "user").slice(-4).map((m) => m.text).join(" ");
      turn = { ...turn, questionOptions: smartOrderOptions(turn.questions, turn.questionOptions, ownerWords) };
    }
    messages.push({ role: "assistant", text: leadFinal, at: nowIso, questions: turn.questions, ...(turn.questionOptions ? { questionOptions: turn.questionOptions } : {}), ...(blocks.length > 0 ? { blocks } : {}) });
    await save({ rounds: turn.questions.length > 0 ? chat.rounds + 1 : chat.rounds, state: "asking" });
    await recordAiUsage(db, userId, { kind: "agent-chat", calls, costUsd, nowMs }).catch(() => undefined);
    return { chat: { ...chat, messages, rounds: turn.questions.length > 0 ? chat.rounds + 1 : chat.rounds }, planIds: [], costUsd };
  }

  // Планы по выбранным товарам составляются параллельно: у каждого сфокусированный контекст, общее время равно самому долгому плану, а не сумме.
  const groupByNm = new Map(groups.map((g) => [g.key, g]));
  const adsByNm = new Map(chatProducts.map((p) => [p.nmId, p.ads ?? []]));
  const promosByNm = new Map(chatProducts.map((p) => [p.nmId, p.promos ?? []]));
  const adsOtherByNm = new Map(chatProducts.map((p) => [p.nmId, p.adsOther ?? []]));
  const promoOpenByNm = new Map(chatProducts.map((p) => [p.nmId, p.promoOpen ?? []]));
  const productByNm = new Map(chatProducts.map((p) => [p.nmId, p]));
  const rules = await loadOwnerRules(db, userId).catch(() => NO_RULES);
  const cardsByNm = new Map(chatProducts.filter((p) => p.card).map((p) => [p.nmId, p.card!]));

  /** Второй ИИ проверяет план: согласился (действия остаются), есть замечания (останавливаются только названные шаги) или отверг (план не показывается). */
  const reviewPlan = async (sol: Solution): Promise<PlanReview | null> => {
    input.onPhase?.("plan");
    const prod = productByNm.get(sol.nmId ?? "");
    const picture = { store: profile, product: prod ? { nmId: sol.nmId, title: prod.title, facts: prod.facts, ads_campaigns: adsForPrompt(prod.ads), promotions: promosForPrompt(prod.promos), promotions_open: promosForPrompt(prod.promoOpen) } : null, owner_dialog: messages.map((m) => ({ role: m.role, text: m.text.slice(0, 800) })) };
    const res = await ask({ system: PLAN_REVIEWER_SYSTEM, user: JSON.stringify({ picture, owner_goal: goal, plans: [planForReview(sol)] }), maxTokens: 3500, role: "reviewer" });
    calls += 1;
    costUsd += res.costUsd;
    return parsePlanReviews(res.text, 1)[0] ?? null;
  };

  const draftPlan = async (sel: { nmId: string; why: string }, extra?: Record<string, unknown>): Promise<Solution | null> => {
    input.onPhase?.("plan");
    const product = productByNm.get(sel.nmId)!;
    const base = withOwnerRules(planProductPayload({ profile, product, why: sel.why, messages, nowIso }), rules);
    const user = extra ? JSON.stringify({ ...(JSON.parse(base) as Record<string, unknown>), ...extra }) : base;
    const res = await ask({ system: CHAT_PLAN_SYSTEM, user, maxTokens: 6500, role: "analyst" });
    calls += 1;
    costUsd += res.costUsd;
    const parsed = parsePlanForProduct(res.text, groupByNm.get(sel.nmId)!, facts, profile, adsByNm, promosByNm, adsOtherByNm, promoOpenByNm, adQueriesByNm, cardsByNm);
    if (parsed.reasons.length > 0) console.info(`[seller-hub-agent] план ${sel.nmId}, не принято: ${parsed.reasons.join(" | ")}`);
    return parsed.plan ? { ...parsed.plan, strategy: applyOwnerRules(parsed.plan.strategy, rules, currentFromEvidence(parsed.plan.evidence)) } : null;
  };

  // Каждый товар идёт своим конвейером параллельно: черновик, проверка вторым ИИ и, если есть замечания, одна доработка с учётом замечаний и повторная проверка.
  // Владелец видит план, доведённый до ума, а не «второй ИИ сомневается»; если замечания остались, показываем лучшую версию с пометкой.
  const pipelines = await Promise.allSettled(
    turn.selected.map(async (sel): Promise<{ sol: Solution; verdict: PlanReview | null } | null> => {
      // Черновик иногда не проходит разбор (числа не сошлись с фактами): одна повторная попытка, прежде чем сдаваться.
      const draft = (await draftPlan(sel)) ?? (await draftPlan(sel));
      if (!draft) return null;
      let best: { sol: Solution; verdict: PlanReview | null } = { sol: draft, verdict: await reviewPlan(draft).catch(() => null) };
      // До двух доработок: каждая устраняет замечания проверяющего, затем повторная проверка. Берём лучшую версию, не худшую по вердикту.
      const rank = (v: PlanReview | null) => (!v ? 1 : v.verdict === "agree" ? 3 : v.verdict === "dispute" ? 2 : 0);
      for (let attempt = 0; attempt < 2 && best.verdict && best.verdict.verdict !== "agree"; attempt += 1) {
        try {
          const revised = await draftPlan(sel, {
            revision: {
              instruction: "Независимый проверяющий нашёл замечания к твоему плану. Исправь план: устрани каждое замечание по существу (замени шаг, уточни условие, добавь страховку, исправь критерии успеха), сохрани то, что было верно. Если замечание основано на непроверяемой метрике, замени критерий на метрику из набора. Верни полный исправленный план в том же формате, ровно один объект в solutions.",
              previous_plan: planForReview(best.sol),
              reviewer_verdict: best.verdict.verdict,
              reviewer_remarks: best.verdict.reason,
              steps_reviewer_objected_to: best.verdict.blockedSteps ?? [],
            },
          });
          if (!revised) break;
          const again = await reviewPlan(revised).catch(() => null);
          if (rank(again) >= rank(best.verdict)) best = { sol: revised, verdict: again };
        } catch (error) {
          console.error("[seller-hub-agent] доработка плана не удалась:", error instanceof Error ? error.message : String(error));
          break;
        }
      }
      return best;
    }),
  );
  pipelines.forEach((r) => r.status === "rejected" && console.error("[seller-hub-agent] план по товару не составился:", r.reason instanceof Error ? r.reason.message : String(r.reason)));
  const done = pipelines.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  const plans: Solution[] = done.map((d) => d.sol);
  const verdicts = done.map((d) => d.verdict);
  const turnPlans = plans;

  const planIds: string[] = [];
  const kept: Array<{ sol: Solution; second: string; reason: string }> = [];
  turnPlans.forEach((sol, index) => {
    const r = applyPlanReview(sol, verdicts[index] ?? null, true);
    if (r.kept) kept.push({ sol: r.solution, second: r.second, reason: r.secondReason });
  });

  for (const { sol, second, reason } of kept) {
    const key = `chat:${chat.id}:${sol.nmId}`;
    const steps = (sol.strategy?.steps ?? []).map((p) => ({ step: `${p.when}: ${p.step}`, by: p.by, action: null }));
    const row = {
      origin: "chat",
      task_id: key,
      task_ids: [],
      signal_fp: null,
      verdict: sol.verdict,
      plan: steps,
      strategy: sol.strategy,
      strategy_state: {},
      nm_id: sol.nmId,
      kind: sol.kind,
      severity: "important",
      title: sol.title,
      what: sol.diagnosis,
      why_now: "",
      evidence: sol.evidence,
      human_advice: "",
      action: null,
      algorithm_view: { covered: false, tasks: [], otherTasks: 0, problems: [] },
      second_opinion: second,
      second_reason: reason,
      owner_accepted: false,
      action_note: "",
      status: "open",
      last_seen_at: nowIso,
    };
    const existing = await db.from("seller_hub_ai_findings").select("id, status, owner_accepted").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).eq("fingerprint", key).maybeSingle();
    if (existing.data) {
      // Уже принятый и идущий план не перезаписываем: новая постановка в том же диалоге создаёт план рядом только для остальных товаров.
      if (existing.data.owner_accepted === true) {
        planIds.push(String(existing.data.id));
        continue;
      }
      await db.from("seller_hub_ai_findings").update(row).eq("id", existing.data.id);
      planIds.push(String(existing.data.id));
    } else {
      const { data } = await db.from("seller_hub_ai_findings").insert({ user_id: userId, marketplace_id: MARKETPLACE, fingerprint: key, first_seen_at: nowIso, ...row }).select("id").single();
      if (data) planIds.push(String(data.id));
    }
  }

  // Если план не получился, слова модели «готовлю план» вводят в заблуждение: говорим честно.
  const reply = kept.length > 0 ? planLead(turn.reply) || `Составил планы по ${kept.length} товарам. Посмотрите и запустите те, что подходят.` : "Не удалось составить план, который прошёл бы проверку. Я ничего не менял. Напишите ещё раз или уточните, что именно нужно сделать, и я попробую снова.";
  messages.push({ role: "assistant", text: reply, at: nowIso, ...(planIds.length > 0 ? { planIds } : {}) });
  await save({ state: kept.length > 0 ? "planned" : "asking" });
  await recordAiUsage(db, userId, { kind: "agent-chat", calls, costUsd, nowMs }).catch(() => undefined);
  console.info(`[seller-hub-agent] чат: планов ${kept.length} из ${turnPlans.length}, вызовов ${calls}, $${costUsd.toFixed(4)}`);
  return { chat: { ...chat, messages, state: kept.length > 0 ? "planned" : "asking" }, planIds, costUsd };
}

export { MAX_QUESTION_ROUNDS };
