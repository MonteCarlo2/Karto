import { NO_RULES, applyOwnerRules, currentFromEvidence, loadOwnerRules, withOwnerRules } from "./owner-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { takeAiBudget } from "@/lib/seller-hub/ai-budget";
import { agentModel, askHubModel } from "@/lib/seller-hub/llm";
import { buildStoreProfile, withStoreMedians } from "./ai-context";
import type { AiAsk } from "./ai-orchestrator";
import type { Solution } from "./ai-solver";
import { loadAdQueries } from "./ads-queries";
import { adsForPrompt, promosForPrompt } from "./ai-solver";
import { PLAN_REVIEWER_SYSTEM, type PlanReview, applyPlanReview, parsePlanReviews, planForReview } from "./plan-review";
import { monthCapUsd, monthSpend, recordAiUsage, remainingBudget } from "./ai-usage";
import { CHAT_PLAN_SYSTEM, CHAT_SYSTEM, MAX_QUESTION_ROUNDS, chatGroups, chatPayload, chatTitle, parseChatTurn, parsePlanForProduct, planProductPayload, type ChatMessage, type ChatProduct } from "./chat";
import type { ScenarioProduct } from "./scenario-run";

const MARKETPLACE = "wildberries";

const defaultAsk: AiAsk = ({ system, user, maxTokens, role }) => askHubModel({ system, user, maxTokens, model: agentModel(role), timeoutMs: 150_000 });

export type ChatRecord = { id: string; title: string; state: "asking" | "planned" | "closed"; rounds: number; messages: ChatMessage[]; updatedAt: string };

const toRecord = (row: Record<string, unknown>): ChatRecord => ({ id: String(row.id), title: String(row.title ?? ""), state: row.state as ChatRecord["state"], rounds: Number(row.rounds ?? 0), messages: (row.messages ?? []) as ChatMessage[], updatedAt: String(row.updated_at ?? "") });

export async function loadChat(db: SupabaseClient, userId: string, chatId: string): Promise<ChatRecord | null> {
  const { data } = await db.from("seller_hub_ai_chats").select("id, title, state, rounds, messages, updated_at").eq("id", chatId).eq("user_id", userId).maybeSingle();
  return data ? toRecord(data) : null;
}

export async function listChats(db: SupabaseClient, userId: string): Promise<Array<Pick<ChatRecord, "id" | "title" | "state" | "updatedAt">>> {
  const { data } = await db.from("seller_hub_ai_chats").select("id, title, state, updated_at").eq("user_id", userId).eq("marketplace_id", MARKETPLACE).order("updated_at", { ascending: false }).limit(12);
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
  nowMs: number;
  ask?: AiAsk;
}): Promise<{ chat: ChatRecord; planIds: string[]; costUsd: number; error?: string }> {
  const { db, userId, nowMs } = input;
  const nowIso = new Date(nowMs).toISOString();
  const message = input.message.trim().slice(0, 2000);
  if (!message) throw new Error("Пустое сообщение");

  let chat = input.chatId ? await loadChat(db, userId, input.chatId) : null;
  if (input.chatId && !chat) throw new Error("Диалог не найден");
  if (!chat) {
    const { data, error } = await db.from("seller_hub_ai_chats").insert({ user_id: userId, marketplace_id: MARKETPLACE, title: chatTitle(message), messages: [], state: "asking", rounds: 0 }).select("id, title, state, rounds, messages, updated_at").single();
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
    messages.push({ role: "assistant", text: `Сейчас ИИ-менеджер временно недоступен: достигнут предел обращений. Задача сохранена, вернёмся к ней позже.`, at: nowIso });
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
  const user = chatPayload({ profile, products: chatProducts, messages, roundsUsed: chat.rounds, nowIso });

  let costUsd = 0;
  let calls = 0;
  let turn;
  try {
    const first = await ask({ system: CHAT_SYSTEM, user, maxTokens: 6000, role: "analyst" });
    calls += 1;
    costUsd += first.costUsd;
    turn = parseChatTurn(first.text, chatProducts, chat.rounds, messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"));
  } catch (error) {
    console.error("[seller-hub-agent] чат ИИ не ответил:", error instanceof Error ? error.message : String(error));
    messages.push({ role: "assistant", text: "ИИ сейчас не ответил. Сообщение сохранено, попробуйте ещё раз через минуту.", at: nowIso });
    await save({});
    return { chat: { ...chat, messages }, planIds: [], costUsd, error: "ai" };
  }
  if (turn.reasons.length > 0) console.info(`[seller-hub-agent] чат, не принято: ${turn.reasons.join(" | ")}`);

  if (turn.mode === "ask") {
    messages.push({ role: "assistant", text: turn.reply, at: nowIso, questions: turn.questions });
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
    const prod = productByNm.get(sol.nmId ?? "");
    const picture = { store: profile, product: prod ? { nmId: sol.nmId, title: prod.title, facts: prod.facts, ads_campaigns: adsForPrompt(prod.ads), promotions: promosForPrompt(prod.promos), promotions_open: promosForPrompt(prod.promoOpen) } : null, owner_dialog: messages.map((m) => ({ role: m.role, text: m.text.slice(0, 800) })) };
    const res = await ask({ system: PLAN_REVIEWER_SYSTEM, user: JSON.stringify({ picture, owner_goal: goal, plans: [planForReview(sol)] }), maxTokens: 3500, role: "reviewer" });
    calls += 1;
    costUsd += res.costUsd;
    return parsePlanReviews(res.text, 1)[0] ?? null;
  };

  const draftPlan = async (sel: { nmId: string; why: string }, extra?: Record<string, unknown>): Promise<Solution | null> => {
    const product = productByNm.get(sel.nmId)!;
    const base = withOwnerRules(planProductPayload({ profile, product, why: sel.why, messages, nowIso }), rules);
    const user = extra ? JSON.stringify({ ...(JSON.parse(base) as Record<string, unknown>), ...extra }) : base;
    const res = await ask({ system: CHAT_PLAN_SYSTEM, user, maxTokens: 9000, role: "analyst" });
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
      const draft = await draftPlan(sel);
      if (!draft) return null;
      const first = await reviewPlan(draft).catch(() => null);
      if (!first || first.verdict === "agree") return { sol: draft, verdict: first };
      try {
        const revised = await draftPlan(sel, {
          revision: {
            instruction: "Независимый проверяющий нашёл замечания к твоему плану. Исправь план: устрани каждое замечание по существу (замени шаг, уточни условие, добавь страховку), сохрани то, что было верно. Верни полный исправленный план в том же формате, ровно один объект в solutions.",
            previous_plan: planForReview(draft),
            reviewer_verdict: first.verdict,
            reviewer_remarks: first.reason,
            steps_reviewer_objected_to: first.blockedSteps ?? [],
          },
        });
        if (!revised) return { sol: draft, verdict: first };
        const second = await reviewPlan(revised).catch(() => null);
        // Берём исправленную версию, если проверяющий согласился или хотя бы не отверг её целиком.
        if (second && second.verdict !== "reject") return { sol: revised, verdict: second };
        return { sol: draft, verdict: first };
      } catch (error) {
        console.error("[seller-hub-agent] доработка плана не удалась:", error instanceof Error ? error.message : String(error));
        return { sol: draft, verdict: first };
      }
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

  const reply = turn.reply || (kept.length > 0 ? `Составил планы по ${kept.length} товарам. Посмотрите и запустите те, что подходят.` : "Не удалось составить план, который прошёл проверку. Уточните задачу.");
  messages.push({ role: "assistant", text: reply, at: nowIso });
  await save({ state: kept.length > 0 ? "planned" : "asking" });
  await recordAiUsage(db, userId, { kind: "agent-chat", calls, costUsd, nowMs }).catch(() => undefined);
  console.info(`[seller-hub-agent] чат: планов ${kept.length} из ${turnPlans.length}, вызовов ${calls}, $${costUsd.toFixed(4)}`);
  return { chat: { ...chat, messages, state: kept.length > 0 ? "planned" : "asking" }, planIds, costUsd };
}

export { MAX_QUESTION_ROUNDS };
