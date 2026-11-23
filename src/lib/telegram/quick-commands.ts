import type { SupabaseClient } from "@supabase/supabase-js";
import type { SellerAdCampaignRow, SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { telegramAnswerCallbackQuery, telegramDeleteMessage, telegramEditMessage, type InlineKeyboardButton } from "./bot-api";
import { actionCardHtml, cardCtx, priceEditFromBlock } from "./action-cards";
import type { OrderCreateAction, TgAction } from "./action-exec";
import { WB_ADS_DEPOSIT_STEPS, WB_ADS_MIN_DEPOSIT_RUB, depositMinMessage } from "@/lib/seller-hub/wb-rules";
import { sendActionCard } from "./actions";
import { findProducts } from "./assistant-facts";
import { bold, clip, escapeHtml, fmtInt, fmtRub, header, italic } from "./format";
import { clearTelegramSession, fetchTelegramLinkByTelegramUserId, setTelegramSession } from "./telegram-db";
import { isSandboxOn } from "@/lib/seller-hub/sandbox";
import { composeSnapshot } from "@/lib/seller-hub/sync/derive";
import { SyncStore } from "@/lib/seller-hub/sync/store";
import { sendHtmlSafe } from "./send-safe";

/**
 * Быстрые команды без нейросети: «останови рекламу», «запусти кампанию», «пополни бюджет», «подними цену на ведро на 3%».
 * Бот сам находит кампанию или товар, если вариантов несколько, предлагает выбрать кнопкой, и в конце показывает карточку с подтверждением.
 * Работает мгновенно и одинаково каждый раз; сложные просьбы по-прежнему уходят агенту.
 */

export type QuickCommand = { kind: "pause" | "resume" } | { kind: "deposit"; sum: number | null } | { kind: "price"; direction: 1 | -1 | 0; pct: number | null; value: number | null; query: string };

const norm = (raw: string) => raw.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const AD = "(реклам|кампани|компани)";

const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

/** Понимает команду по словам. Только однозначные формулировки: всё остальное разбирает агент. */
export function detectQuickCommand(raw: string): QuickCommand | null {
  const t = norm(raw);
  if (!t || t.split(" ").length > 14) return null;
  // Вопросы («как остановить рекламу?», «что такое пауза») объясняет агент, а не выполняет команда.
  if (/^(что|как|почему|зачем|когда|сколько|какой|какая|какие|можно ли|а что)(?![а-я])/.test(t)) return null;
  if (new RegExp(`(пополни|пополнить|закинь|закинуть|внеси|положи|добавь).{0,30}(бюджет|${AD}|счет)|бюджет.{0,30}(пополни|пополнить)`).test(t)) {
    const m = /(?:на|по)\s+(\d[\d ]{0,8})\s*(тыс[а-яa-z]*|т\.?р)?(?!\s*%)/.exec(t);
    const sum = m ? Math.round(num(m[1]!) * (m[2] ? 1000 : 1)) : null;
    return { kind: "deposit", sum: sum && sum > 0 ? sum : null };
  }
  if (new RegExp(`(останов[а-яa-z]*|выключ[а-яa-z]*|отключ[а-яa-z]*|стоп|приостанов[а-яa-z]*).{0,30}${AD}|${AD}.{0,30}(останов|на пауз|выключ|отключ|приостанов)|поставь.{0,25}на пауз`).test(t)) return { kind: "pause" };
  if (new RegExp(`(запусти[а-яa-z]*|включи[а-яa-z]*|возобнови[а-яa-z]*|продолжи[а-яa-z]*).{0,30}${AD}|${AD}.{0,30}(запуст|включ|возобнов|продолж)`).test(t)) return { kind: "resume" };
  const up = /(подним|повыс|увелич|подорож)/.test(t);
  const down = /(снизь|сниз|уменьш|пониз|удешев|скинь)/.test(t);
  if (/цен/.test(t) && (up || down || /(поставь|установи|измени|сделай)/.test(t))) {
    const pct = /(\d+(?:[.,]\d+)?)\s*(?:%|процент)/.exec(t);
    const abs = /(?:(?:до|на|в|=)\s*|цен[а-яa-z]*\s+)(\d[\d ]{1,8})(?!\d)\s*(?:₽|руб[а-яa-z]*|р(?![а-я]))?(?!\s*%|\s*процент|\s*(?:л|литр|шт|мл|кг|см)(?![а-я]))/.exec(t);
    const query = t
      .replace(/(\d+(?:[.,]\d+)?)\s*(%|процент[а-яa-z]*)/g, " ")
      .replace(/цен[а-яa-z]*\s+\d[\d ]*(?:\s*(?:₽|руб[а-яa-z]*|р(?![а-я])))?|(?:до|на|в)\s+\d[\d ]*\s*(?:₽|руб[а-яa-z]*|р(?![а-я]))/g, " ")
      .replace(/(?<![а-я])(подними[а-яa-z]*|повысь[а-яa-z]*|увеличь[а-яa-z]*|подорожи[а-яa-z]*|снизь[а-яa-z]*|уменьши[а-яa-z]*|понизь[а-яa-z]*|удешеви[а-яa-z]*|поставь[а-яa-z]*|установи[а-яa-z]*|измени[а-яa-z]*|сделай[а-яa-z]*|цену|цена|цены|цене|пожалуйста|на|до|в|для|у|мне|мою|мой)(?![а-я])/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const value = !pct && abs && !up && !down ? num(abs[1]!) : null;
    return { kind: "price", direction: up ? 1 : down ? -1 : 0, pct: pct ? num(pct[1]!) : null, value: value && value > 0 ? value : null, query };
  }
  return null;
}

// ——— Кампании ———

const isActive = (c: SellerAdCampaignRow) => c.status === 9 || c.statusLabel === "Активна";
const isPaused = (c: SellerAdCampaignRow) => c.status === 11 || c.statusLabel === "На паузе";

export function campaignsFor(kind: "pause" | "resume" | "deposit", snapshot: SellerCatalogSnapshot | null): SellerAdCampaignRow[] {
  const all = snapshot?.ads?.campaigns ?? [];
  if (kind === "pause") return all.filter(isActive);
  if (kind === "resume") return all.filter(isPaused);
  return all.filter((c) => isActive(c) || isPaused(c));
}

/** Название кампании для кнопки. У кампаний с одинаковым названием добавляется номер, иначе их не различить. */
export function campaignLabel(c: SellerAdCampaignRow, all: SellerAdCampaignRow[]): string {
  const name = c.name || `Кампания ${c.id}`;
  return all.filter((x) => (x.name || `Кампания ${x.id}`) === name).length > 1 ? `${name} №${String(c.id).slice(-4)}` : name;
}

const spendOf = (snapshot: SellerCatalogSnapshot | null, id: string) => snapshot?.adsStats?.campaigns.find((c) => String(c.advertId) === String(id))?.spend ?? null;

/** Ответ шага. keyboard: кнопки под сообщением; action: карточка подтверждения; close: убрать сообщение; awaitSum: ждём сумму текстом. */
export type Reply = { html: string; keyboard?: InlineKeyboardButton[][]; action?: TgAction; close?: boolean; awaitSum?: { campaignId: string } };

const VERB = { pause: "остановить", resume: "запустить", deposit: "пополнить" } as const;
const ICON = { pause: "⏸", resume: "▶️", deposit: "💳" } as const;
const CB = { pause: "qa:p", resume: "qa:r", deposit: "qa:d" } as const;
const CLOSE: InlineKeyboardButton = { text: "✖ Закрыть", callback_data: "qa:x" };

/** Выбор кампании кнопками. Одна подходящая кампания выбирается сама. */
export function campaignStep(kind: "pause" | "resume" | "deposit", snapshot: SellerCatalogSnapshot | null, sum: number | null): Reply {
  const list = campaignsFor(kind, snapshot);
  if (list.length === 0) {
    const none = kind === "pause" ? "Сейчас нет активных кампаний: останавливать нечего." : kind === "resume" ? "Нет кампаний на паузе: запускать нечего." : "Не нашёл рекламных кампаний для пополнения.";
    return { html: `${header(ICON[kind], "Реклама")}\n\n${escapeHtml(none)}` };
  }
  if (list.length === 1) return afterCampaign(kind, list[0]!, snapshot, sum, false);
  const rows: InlineKeyboardButton[][] = list.slice(0, 8).map((c) => {
    const spend = spendOf(snapshot, c.id);
    const label = `${ICON[kind]} ${clip(campaignLabel(c, list), 30)}${spend != null && spend > 0 ? ` · ${fmtInt(spend)} ₽` : ""}`;
    return [{ text: label, callback_data: `${CB[kind]}:${c.id}${kind === "deposit" && sum ? `:${sum}` : ""}` }];
  });
  rows.push([CLOSE]);
  const lines = list.slice(0, 8).map((c) => `• ${bold(clip(campaignLabel(c, list), 50))} ${italic(`${c.statusLabel ?? ""}${c.budget != null ? ` · бюджет ${fmtRub(c.budget)}` : ""}`)}`);
  return { html: `${header(ICON[kind], `Какую кампанию ${VERB[kind]}?`, "Выберите кнопкой")}\n\n${lines.join("\n\n")}`, keyboard: rows };
}

/** Выбор суммы пополнения: ступени не меньше минимума WB, своя сумма, автопополнение, назад и закрыть. */
export function amountStep(c: SellerAdCampaignRow, canBack: boolean, note?: string): Reply {
  const name = c.name || `Кампания ${c.id}`;
  const balance = c.budget != null ? `Сейчас в бюджете: ${bold(fmtRub(c.budget))}` : "";
  const rules = italic(`Минимум пополнения у Wildberries: ${fmtRub(WB_ADS_MIN_DEPOSIT_RUB)}. Деньги спишутся со счёта продвижения и вернутся на него только при закрытии кампании.`);
  const bottom: InlineKeyboardButton[] = canBack ? [{ text: "⬅ Назад", callback_data: "qa:k:d" }, CLOSE] : [CLOSE];
  return {
    html: [header("💳", "На сколько пополнить?", clip(name, 60)), note ? `⚠️ ${escapeHtml(note)}` : "", balance, rules].filter(Boolean).join("\n\n"),
    keyboard: [
      WB_ADS_DEPOSIT_STEPS.map((s) => ({ text: fmtRub(s), callback_data: `qa:s:${c.id}:${s}` })),
      [
        { text: "✏️ Другая сумма", callback_data: `qa:c:${c.id}` },
        { text: "🔁 Автопополнение", callback_data: `qa:a:${c.id}` },
      ],
      bottom,
    ],
  };
}

/** После выбора кампании: пауза и запуск сразу показывают карточку подтверждения, пополнение сначала спрашивает сумму. */
export function afterCampaign(kind: "pause" | "resume" | "deposit", c: SellerAdCampaignRow, snapshot: SellerCatalogSnapshot | null, sum: number | null, canBack = campaignsFor(kind, snapshot).length > 1): Reply {
  if (kind === "pause") return { html: "", action: { type: "pause", campaignId: String(c.id) } };
  if (kind === "resume") return { html: "", action: { type: "resume", campaignId: String(c.id) } };
  if (sum != null) {
    const small = depositMinMessage(sum);
    if (small) return amountStep(c, canBack, small);
    if (sum <= 100_000) return { html: "", action: { type: "deposit", campaignId: String(c.id), sumRub: sum } };
    return amountStep(c, canBack, "Через KARTO можно пополнить не больше 100 000 ₽ за раз.");
  }
  return amountStep(c, canBack);
}

/** Автопополнение: выбор суммы одного пополнения; порог 500 ₽ и суточный лимит в два пополнения показываются в карточке. */
export function autopayStep(c: SellerAdCampaignRow): Reply {
  const name = c.name || `Кампания ${c.id}`;
  return {
    html: `${header("🔁", "Автопополнение", clip(name, 60))}\n\n${escapeHtml(`Когда остаток кампании станет ниже ${AUTOPAY_BELOW_RUB} ₽, я напомню пополнить её и предложу пополнить одним нажатием. Выберите сумму одного пополнения (минимум ${WB_ADS_MIN_DEPOSIT_RUB.toLocaleString("ru-RU")} ₽).`)}`,
    keyboard: [WB_ADS_DEPOSIT_STEPS.map((s) => ({ text: fmtRub(s), callback_data: `qa:z:${c.id}:${s}` })), [{ text: "⬅ Назад", callback_data: `qa:d:${c.id}` }, CLOSE]],
  };
}

export const AUTOPAY_BELOW_RUB = 500;

export function autopayOrder(c: SellerAdCampaignRow, topUp: number): OrderCreateAction | null {
  if (depositMinMessage(topUp) || topUp > 100_000) return null;
  const name = c.name || `Кампания ${c.id}`;
  return { type: "order_create", input: { title: `Автопополнение: ${clip(name, 60)}`, kind: "ads_deposit", params: { campaignId: String(c.id), belowRub: AUTOPAY_BELOW_RUB, topUpRub: topUp }, schedule: { type: "check", everyMinutes: 60 }, limits: { maxPerDayRub: topUp * 2 }, mode: "ask", createdFrom: "chat" } };
}

// ——— Цена ———

const PCT_STEPS = [-5, -3, -1, 1, 3, 5];

export function priceStep(cmd: Extract<QuickCommand, { kind: "price" }>, snapshot: SellerCatalogSnapshot | null): Reply {
  if (!snapshot) return { html: `${header("💰", "Цена")}\n\nДанные кабинета ещё не загружены. Подождите минуту и повторите.` };
  const found = cmd.query ? findProducts(snapshot, cmd.query, 5) : [];
  if (found.length === 0) return { html: `${header("🔎", "Не нашёл такой товар")}\n\n${escapeHtml("Назовите товар точнее: название, размер или артикул. Например: «подними цену на ведро 10 л на 3%».")}` };
  const pct = cmd.pct != null ? Math.round(cmd.pct) * (cmd.direction === -1 ? -1 : 1) : null;
  const one = (nm: string): Reply => {
    if (cmd.value != null) {
      const a = priceEditFromBlock(snapshot, { nmId: nm, field: "price", value: cmd.value });
      return a ? { html: "", action: a } : { html: `${header("⚠️", "Цена не подходит")}\n\n${escapeHtml("Укажите цену в рублях, больше нуля.")}` };
    }
    if (pct != null && pct !== 0) {
      const a = priceEditFromBlock(snapshot, { nmId: nm, field: "price", value: null, pct });
      return a ? { html: "", action: a } : { html: `${header("⚠️", "Не получилось посчитать цену")}\n\n${escapeHtml("У товара нет текущей цены в данных кабинета.")}` };
    }
    const item = snapshot.items.find((i) => String(i.externalId) === nm);
    const steps = cmd.direction === 1 ? PCT_STEPS.filter((s) => s > 0) : cmd.direction === -1 ? PCT_STEPS.filter((s) => s < 0) : PCT_STEPS;
    return {
      html: `${header("💰", "На сколько изменить цену?", clip(item?.title ?? nm, 60))}${item?.price != null ? `\n\nСейчас цена до скидки: ${bold(fmtRub(item.price))}` : ""}`,
      keyboard: [steps.map((s) => ({ text: `${s > 0 ? "+" : "−"}${Math.abs(s)} %`, callback_data: `qa:u:${nm}:${s}` })), [CLOSE]],
    };
  };
  if (found.length === 1) return one(found[0]!.nmId);
  const rows: InlineKeyboardButton[][] = found.map((f) => {
    const item = snapshot.items.find((i) => String(i.externalId) === f.nmId);
    return [{ text: `🛍 ${clip(item?.title ?? f.nmId, 40)}`, callback_data: pct != null && pct !== 0 ? `qa:u:${f.nmId}:${pct}` : cmd.value != null ? `qa:v:${f.nmId}:${cmd.value}` : `qa:q:${f.nmId}:${cmd.direction}` }];
  });
  rows.push([CLOSE]);
  return { html: `${header("🔎", "Какой товар?", "Нашёл несколько подходящих")}`, keyboard: rows };
}

const NOT_FOUND: Reply = { html: `${header("⚠️", "Кампания не найдена")}\n\n${escapeHtml("Её уже нет в кабинете или данные обновились. Попросите ещё раз.")}` };

/** Следующий шаг по нажатию кнопки быстрой команды. null: не наша кнопка. */
export function stepForCallback(data: string, snapshot: SellerCatalogSnapshot | null): Reply | null {
  if (data === "qa:x") return { html: "", close: true };
  const back = /^qa:k:([prd])$/.exec(data);
  if (back) return campaignStep(back[1] === "p" ? "pause" : back[1] === "r" ? "resume" : "deposit", snapshot, null);
  const m = /^qa:([prdsuvqcaz]):(\d{1,12})(?::(-?\d{1,9}))?$/.exec(data);
  if (!m) return null;
  const [, op, id, arg] = m;
  const campaign = (snapshot?.ads?.campaigns ?? []).find((c) => String(c.id) === id);
  if (op === "p" || op === "r" || op === "d") {
    if (!campaign) return NOT_FOUND;
    return afterCampaign(op === "p" ? "pause" : op === "r" ? "resume" : "deposit", campaign, snapshot, arg ? Number(arg) : null);
  }
  if (op === "s") return campaign ? afterCampaign("deposit", campaign, snapshot, Number(arg)) : NOT_FOUND;
  if (op === "c") {
    if (!campaign) return NOT_FOUND;
    return { html: `${header("✏️", "Своя сумма", clip(campaign.name || `Кампания ${campaign.id}`, 60))}\n\n${escapeHtml(`Напишите сумму числом, например 1500. Минимум ${WB_ADS_MIN_DEPOSIT_RUB.toLocaleString("ru-RU")} ₽, максимум 100 000 ₽.`)}`, keyboard: [[{ text: "⬅ Назад", callback_data: `qa:d:${id}` }, CLOSE]], awaitSum: { campaignId: String(id) } };
  }
  if (op === "a") return campaign ? autopayStep(campaign) : NOT_FOUND;
  if (op === "z") {
    if (!campaign) return NOT_FOUND;
    const order = autopayOrder(campaign, Number(arg));
    return order ? { html: "", action: order } : amountStep(campaign, true, depositMinMessage(Number(arg)) ?? "Эта сумма не подходит.");
  }
  if (op === "u" || op === "v") {
    const a = priceEditFromBlock(snapshot, op === "u" ? { nmId: id!, field: "price", value: null, pct: Number(arg) } : { nmId: id!, field: "price", value: Number(arg) });
    return a ? { html: "", action: a } : { html: `${header("⚠️", "Не получилось подготовить цену")}\n\n${escapeHtml("Нет товара или текущей цены в данных кабинета.")}` };
  }
  if (op === "q") return priceStep({ kind: "price", direction: (Number(arg) as 1 | -1 | 0) || 0, pct: null, value: null, query: snapshot?.items.find((i) => String(i.externalId) === id)?.title ?? "" }, snapshot);
  return null;
}

// ——— Отправка ———

type Kb = InlineKeyboardButton[][];

export type QuickDeps = {
  snapshot: (userId: string) => Promise<SellerCatalogSnapshot | null>;
  sendHtml: (chatId: number, html: string, keyboard?: Kb) => Promise<unknown>;
  /** Заменить сообщение на месте: выбор шагов не плодит новые сообщения. */
  edit: (chatId: number, messageId: number, html: string, keyboard?: Kb) => Promise<unknown>;
  remove: (chatId: number, messageId: number) => Promise<unknown>;
  sendCard: (input: { userId: string; chatId: number; action: TgAction; html: string }) => Promise<unknown>;
  sandbox: (userId: string) => Promise<boolean>;
  setSession: (telegramUserId: number, chatId: number, state: "awaiting_deposit_sum" | "idle", payload: Record<string, unknown>) => Promise<unknown>;
  clearSession: (telegramUserId: number) => Promise<unknown>;
};

/** Показывает ответ шага: либо вопрос с кнопками, либо карточку подтверждения. */
export async function deliver(reply: Reply, snapshot: SellerCatalogSnapshot | null, ctx: { userId: string; chatId: number }, deps: Pick<QuickDeps, "sendHtml" | "sendCard" | "sandbox">): Promise<void> {
  if (reply.action) {
    const sandbox = await deps.sandbox(ctx.userId);
    await deps.sendCard({ userId: ctx.userId, chatId: ctx.chatId, action: reply.action, html: actionCardHtml(reply.action, cardCtx(snapshot), { sandbox }) });
    return;
  }
  await deps.sendHtml(ctx.chatId, reply.html, reply.keyboard);
}

export async function runQuickCommand(cmd: QuickCommand, ctx: { userId: string; chatId: number }, deps: QuickDeps): Promise<void> {
  const snapshot = await deps.snapshot(ctx.userId);
  const reply = cmd.kind === "price" ? priceStep(cmd, snapshot) : cmd.kind === "deposit" ? campaignStep("deposit", snapshot, cmd.sum) : campaignStep(cmd.kind, snapshot, null);
  await deliver(reply, snapshot, ctx, deps);
}

export type CallbackIn = { id: string; data?: string; from: { id: number }; message?: { message_id?: number; chat: { id: number } } };

/** Нажатие кнопки быстрой команды. true: кнопка наша. */
export async function handleQuickCallback(db: SupabaseClient, cb: CallbackIn, deps: QuickDeps, answer: (id: string, text?: string) => Promise<unknown> = (id, text) => telegramAnswerCallbackQuery({ callbackQueryId: id, text })): Promise<boolean> {
  if (!/^qa:/.test(cb.data ?? "")) return false;
  const link = await fetchTelegramLinkByTelegramUserId(db, cb.from.id);
  if (!link) {
    await answer(cb.id, "Нет доступа").catch(() => undefined);
    return true;
  }
  // Ответ на нажатие не ждём: при сбоях сети он идёт долго, а следующий шаг нужен сразу.
  void Promise.resolve(answer(cb.id)).catch(() => undefined);
  const chatId = cb.message?.chat.id ?? link.chat_id;
  const messageId = cb.message?.message_id;
  const snapshot = await deps.snapshot(link.user_id);
  const reply = stepForCallback(cb.data!, snapshot);
  if (!reply) return true;
  const ctx = { userId: link.user_id, chatId };

  if (reply.close) {
    await deps.clearSession(cb.from.id).catch(() => undefined);
    if (messageId) await deps.remove(chatId, messageId).catch(() => undefined);
    return true;
  }
  if (reply.action) {
    await deliver(reply, snapshot, ctx, deps);
    if (messageId) await deps.remove(chatId, messageId).catch(() => undefined);
    return true;
  }
  if (reply.awaitSum) await deps.setSession(cb.from.id, chatId, "awaiting_deposit_sum", { campaignId: reply.awaitSum.campaignId });
  else await deps.clearSession(cb.from.id).catch(() => undefined);
  if (messageId) {
    try {
      await deps.edit(chatId, messageId, reply.html, reply.keyboard);
      return true;
    } catch {
      // Сообщение уже изменено или удалено: показываем шаг новым сообщением.
    }
  }
  await deps.sendHtml(chatId, reply.html, reply.keyboard);
  return true;
}

/** Ответ человека числом на «Своя сумма». true: сообщение обработано здесь. */
export async function handleDepositSumStep(text: string, payload: Record<string, unknown>, ctx: { userId: string; chatId: number; telegramUserId: number }, deps: QuickDeps): Promise<void> {
  const t = text.trim().toLowerCase();
  if (/^(отмена|отменить|стоп|назад)$/.test(t)) {
    await deps.clearSession(ctx.telegramUserId);
    await deps.sendHtml(ctx.chatId, "Хорошо, ничего не пополняю.");
    return;
  }
  const m = /(\d[\d ]*)(?:[.,]\d+)?\s*(тыс\S*|к)?/.exec(t);
  const sum = m ? Math.round(Number(m[1]!.replace(/\s/g, "")) * (m[2] ? 1000 : 1)) : NaN;
  const snapshot = await deps.snapshot(ctx.userId);
  const campaign = (snapshot?.ads?.campaigns ?? []).find((c) => String(c.id) === String(payload.campaignId));
  if (!campaign) {
    await deps.clearSession(ctx.telegramUserId);
    await deps.sendHtml(ctx.chatId, `${header("⚠️", "Кампания не найдена")}\n\n${escapeHtml("Попросите пополнение ещё раз.")}`);
    return;
  }
  if (!Number.isFinite(sum)) {
    await deps.sendHtml(ctx.chatId, `${header("✏️", "Не понял сумму")}\n\n${escapeHtml(`Напишите число рублей, например 1500. Минимум ${WB_ADS_MIN_DEPOSIT_RUB.toLocaleString("ru-RU")} ₽. Или напишите «отмена».`)}`);
    return;
  }
  const small = depositMinMessage(sum);
  if (small || sum > 100_000) {
    await deps.sendHtml(ctx.chatId, `${header("⚠️", "Эта сумма не подходит")}\n\n${escapeHtml(small ?? "Через KARTO можно пополнить не больше 100 000 ₽ за раз.")}\n\n${italic("Напишите другую сумму или «отмена».")}`);
    return;
  }
  await deps.clearSession(ctx.telegramUserId);
  await deliver({ html: "", action: { type: "deposit", campaignId: String(campaign.id), sumRub: sum } }, snapshot, { userId: ctx.userId, chatId: ctx.chatId }, deps);
}

/** Настоящие зависимости: снимок кабинета из базы, отправка в Telegram, карточка с подтверждением. */
export function quickDepsFor(db: SupabaseClient): QuickDeps {
  return {
    snapshot: async (userId) => (await composeSnapshot(new SyncStore(db), db, { userId, marketplaceId: "wildberries" }))?.snapshot ?? null,
    sendHtml: (chatId, html, keyboard) => sendHtmlSafe({ chatId, html, ...(keyboard ? { replyMarkup: { inline_keyboard: keyboard } } : {}) }),
    edit: (chatId, messageId, html, keyboard) => telegramEditMessage({ chatId, messageId, text: html, replyMarkup: { inline_keyboard: keyboard ?? [] } }),
    remove: (chatId, messageId) => telegramDeleteMessage({ chatId, messageId }),
    sendCard: (input) => sendActionCard(db, input),
    sandbox: (userId) => isSandboxOn(db, userId),
    setSession: (telegramUserId, chatId, state, payload) => setTelegramSession(db, { telegramUserId, chatId, state, payload }),
    clearSession: (telegramUserId) => clearTelegramSession(db, telegramUserId),
  };
}
