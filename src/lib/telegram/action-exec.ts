import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAction } from "@/lib/seller-hub/ads-agent-engine";
import { recordAction } from "@/lib/seller-hub/action-log";
import { friendlyWbError } from "@/lib/seller-hub/friendly-errors";
import { createOrder, deleteOrder, updateOrder } from "@/lib/seller-hub/orders/repository";
import { validateOrderInput, type OrderInput } from "@/lib/seller-hub/orders/types";
import { depositMinMessage } from "@/lib/seller-hub/wb-rules";
import { parseAdBidRequest } from "@/lib/seller-hub/ads-bid";
import { parseAdDailyLimitRequest } from "@/lib/seller-hub/ads-daily-limit";
import { parseAdDepositRequest } from "@/lib/seller-hub/ads-deposit";
import { parseAdMinusRequest } from "@/lib/seller-hub/ads-minus";
import { parseAdAddNmRequest, parseAdRemoveNmRequest } from "@/lib/seller-hub/ads-nms";
import { findStalePrices, requestedPriceMatchesRead, settlePriceUpload, stalePriceMessage, type ExpectedPrice } from "@/lib/seller-hub/price-write";
import { isSandboxOn, SANDBOX_MESSAGE } from "@/lib/seller-hub/sandbox";
import { openSellerHubWbToken, safeSellerHubMessage } from "@/lib/seller-hub/wb-token";
import { supabaseSellerHubSecretDb } from "@/lib/seller-hub/wb-token-store";
import { invalidateSources } from "@/lib/seller-hub/sync/invalidate";
import { fetchPricesByNmIds } from "@/lib/services/wildberries/content-client";
import { addWbAdMinusPhrases, addWbAdNm, changeWbAdBid, depositWbAdBudget, removeWbAdNm, setWbAdDailyLimit, toggleWbAdCampaign } from "@/lib/services/wildberries/ads-write-client";
import { updateWbClubDiscount, updateWbPrices, waitForWbPriceUpload } from "@/lib/services/wildberries/prices-write-client";

/**
 * Выполнение действий из Telegram. Те же проверки и те же методы записи, что у кнопок на сайте: разбор и подтверждение запроса, сверка цены с тем, что человек видел,
 * журнал действий, тестовый режим агента (по умолчанию включён: в Wildberries ничего не уходит). Состоит из чистой части (что за действие, как его вернуть)
 * и записи в WB, которая подменяется в тестах.
 */

/** Правка цены или скидки конкретного товара (то, что агент называет price_edit). Хранится вместе с тем, что человек видел, чтобы сверить перед записью. */
export type PriceEditAction = { type: "price_edit"; nmId: string; field: "price" | "discount"; value: number; prevPrice: number | null; prevDiscount: number | null; title: string };

/** Поручение агенту (регулярное действие или напоминание). Создаётся только после подтверждения; replaceId — обновить существующее. */
export type OrderCreateAction = { type: "order_create"; input: OrderInput; replaceId?: string };
/** Откат создания поручения: удалить его. */
export type OrderDeleteAction = { type: "order_delete"; orderId: string; title: string };

export type TgAction = AgentAction | PriceEditAction | OrderCreateAction | OrderDeleteAction;

export const TG_ACTION_TYPES: ReadonlyArray<TgAction["type"]> = ["order_create", "order_delete", "price", "price_edit", "pause", "resume", "deposit", "bid", "daily_limit", "club_discount", "remove_nm", "add_nm", "minus_phrases"];

export const isTgAction = (a: { type: string }): a is TgAction => (TG_ACTION_TYPES as readonly string[]).includes(a.type);

export type ExecResult = { ok: boolean; message: string; simulated?: boolean; /** Номер созданного поручения: по нему строится откат. */ createdId?: string };

/** Как вернуть действие. null: вернуть нельзя (пополнение бюджета, минус-фразы) или прежнее состояние неизвестно. */
export function inverseAction(a: TgAction): TgAction | null {
  switch (a.type) {
    case "pause":
      return { type: "resume", campaignId: a.campaignId };
    case "resume":
      return { type: "pause", campaignId: a.campaignId };
    case "remove_nm":
      return { type: "add_nm", campaignId: a.campaignId, nmId: a.nmId };
    case "add_nm":
      return { type: "remove_nm", campaignId: a.campaignId, nmId: a.nmId };
    case "bid":
      return a.previousBidRub != null && a.previousBidRub > 0 ? { type: "bid", advertId: a.advertId, nmId: a.nmId, bidRub: a.previousBidRub, previousBidRub: a.bidRub } : null;
    case "daily_limit":
      return a.previous && a.previous.limitRub != null ? { type: "daily_limit", campaignId: a.campaignId, enabled: a.previous.enabled, limitRub: a.previous.limitRub, carryOver: a.previous.carryOver, previous: { enabled: a.enabled, limitRub: a.limitRub, carryOver: a.carryOver } } : null;
    case "club_discount":
      return a.previousPercent != null ? { type: "club_discount", nmId: a.nmId, clubPercent: a.previousPercent, previousPercent: a.clubPercent } : null;
    case "price":
      return a.currentBaseRub != null ? { type: "price", nmId: a.nmId, targetRub: a.currentRub, baseRub: a.currentBaseRub, discount: a.discount, currentRub: a.targetRub, currentBaseRub: a.baseRub } : null;
    case "price_edit": {
      const prev = a.field === "price" ? a.prevPrice : a.prevDiscount;
      if (prev == null) return null;
      return { type: "price_edit", nmId: a.nmId, field: a.field, value: prev, prevPrice: a.field === "price" ? a.value : a.prevPrice, prevDiscount: a.field === "discount" ? a.value : a.prevDiscount, title: a.title };
    }
    case "order_create":
    case "order_delete":
      return null;
    default:
      return null;
  }
}

/** Какие источники снимка перечитать после записи: цена в «base», реклама ещё и в статистике рекламы. */
const sourcesFor = (a: TgAction): Array<"base" | "ads_stats"> => a.type === "order_create" || a.type === "order_delete" ? [] : (a.type === "price" || a.type === "price_edit" || a.type === "club_discount" ? ["base"] : ["base", "ads_stats"]);

const logName = (a: TgAction): { agent: "ads" | "prices"; action: string } => {
  switch (a.type) {
    case "pause":
      return { agent: "ads", action: "ad_pause" };
    case "resume":
      return { agent: "ads", action: "ad_start" };
    case "deposit":
      return { agent: "ads", action: "ad_deposit" };
    case "bid":
      return { agent: "ads", action: "ad_bid" };
    case "daily_limit":
      return { agent: "ads", action: "ad_daily_limit" };
    case "remove_nm":
      return { agent: "ads", action: "ad_remove_nm" };
    case "add_nm":
      return { agent: "ads", action: "ad_add_nm" };
    case "minus_phrases":
      return { agent: "ads", action: "ad_minus" };
    case "club_discount":
      return { agent: "prices", action: "club_discount_update" };
    default:
      return { agent: "prices", action: "price_update" };
  }
};

type WbResult = { ok: boolean; error?: string };

/** Загрузка цены в WB с теми же шагами, что у маршрута цен: сверка с тем, что видел человек, запись, ожидание обработки, чтение обратно. */
async function applyPrices(token: string, updates: Array<{ nmId: number; price?: number; discount?: number; expected?: ExpectedPrice }>): Promise<WbResult> {
  const expecting = updates.filter((u) => u.expected != null);
  if (expecting.length > 0) {
    let current: Awaited<ReturnType<typeof fetchPricesByNmIds>> | null = null;
    try {
      current = await fetchPricesByNmIds(token, expecting.map((u) => u.nmId));
    } catch {
      current = null;
    }
    const stale = current ? findStalePrices(expecting, current) : [];
    if (stale.length > 0) return { ok: false, error: stalePriceMessage(stale) };
  }
  const uploaded = await updateWbPrices(token, updates.map(({ nmId, price, discount }) => ({ nmId, price, discount })));
  if (!uploaded.ok || uploaded.uploadId == null) return { ok: false, error: settlePriceUpload({ uploadOk: uploaded.ok, uploadError: uploaded.error, uploadId: uploaded.uploadId }).text };
  const waited = await waitForWbPriceUpload(token, uploaded.uploadId);
  if (waited.outcome !== "processed") return { ok: false, error: settlePriceUpload({ uploadOk: true, uploadId: uploaded.uploadId, waitOutcome: waited.outcome, waitError: waited.error }).text };
  let read: "match" | "mismatch" | "unread" = "unread";
  try {
    const rows = await fetchPricesByNmIds(token, updates.map((u) => u.nmId));
    read = updates.every((u) => requestedPriceMatchesRead(u, rows.get(u.nmId))) ? "match" : "mismatch";
  } catch {
    read = "unread";
  }
  const view = settlePriceUpload({ uploadOk: true, uploadId: uploaded.uploadId, waitOutcome: "processed", read });
  return { ok: view.outcome === "confirmed" || view.outcome === "processed", error: view.outcome === "confirmed" || view.outcome === "processed" ? undefined : view.text };
}

/** Запись в WB. Подменяется в тестах. */
export async function runWbAction(token: string, a: TgAction): Promise<WbResult> {
  switch (a.type) {
    case "pause":
      return toggleWbAdCampaign(token, Number(a.campaignId), "pause");
    case "resume":
      return toggleWbAdCampaign(token, Number(a.campaignId), "start");
    case "deposit": {
      const parsed = parseAdDepositRequest({ campaignId: Number(a.campaignId), sum: a.sumRub, confirmSum: a.sumRub });
      return parsed.ok ? depositWbAdBudget(token, parsed.request) : { ok: false, error: parsed.error };
    }
    case "bid": {
      const parsed = parseAdBidRequest({ advertId: Number(a.advertId), nmId: Number(a.nmId), bidRub: a.bidRub, confirmRub: a.bidRub });
      return parsed.ok ? changeWbAdBid(token, parsed.request) : { ok: false, error: parsed.error };
    }
    case "daily_limit": {
      const parsed = parseAdDailyLimitRequest({ advertId: Number(a.campaignId), enabled: a.enabled, dailyLimit: a.limitRub, carryOver: a.carryOver, confirm: `${Number(a.campaignId)}:${a.enabled}:${a.limitRub}` });
      return parsed.ok ? setWbAdDailyLimit(token, parsed.request) : { ok: false, error: parsed.error };
    }
    case "remove_nm": {
      const parsed = parseAdRemoveNmRequest({ advertId: Number(a.campaignId), nmId: Number(a.nmId), confirmNmId: Number(a.nmId) });
      return parsed.ok ? removeWbAdNm(token, parsed.request) : { ok: false, error: parsed.error };
    }
    case "add_nm": {
      const parsed = parseAdAddNmRequest({ advertId: Number(a.campaignId), nmId: Number(a.nmId), confirmNmId: Number(a.nmId) });
      return parsed.ok ? addWbAdNm(token, parsed.request) : { ok: false, error: parsed.error };
    }
    case "minus_phrases": {
      const parsed = parseAdMinusRequest({ advertId: Number(a.advertId), nmId: Number(a.nmId), queries: a.queries, confirmCount: a.queries.length });
      if (!parsed.ok) return { ok: false, error: parsed.error };
      return addWbAdMinusPhrases(token, parsed.request);
    }
    case "club_discount": {
      const uploaded = await updateWbClubDiscount(token, [{ nmId: Number(a.nmId), clubDiscount: a.clubPercent }]);
      if (!uploaded.ok || uploaded.uploadId == null) return { ok: false, error: uploaded.error ?? "WB не принял скидку Клуба" };
      const waited = await waitForWbPriceUpload(token, uploaded.uploadId);
      if (waited.outcome === "processed") return { ok: true };
      return { ok: false, error: waited.outcome === "unknown" ? "WB ещё обрабатывает скидку Клуба: проверьте результат через несколько минут" : (waited.error ?? "WB не обработал скидку Клуба") };
    }
    case "price":
      return applyPrices(token, [{ nmId: Number(a.nmId), price: a.baseRub, discount: a.discount, expected: { price: a.currentBaseRub ?? null, discount: a.discount } }]);
    case "price_edit":
      return applyPrices(token, [{ nmId: Number(a.nmId), ...(a.field === "price" ? { price: a.value } : { discount: a.value }), expected: { price: a.prevPrice, discount: a.prevDiscount } }]);
    default:
      return { ok: false, error: "Этот вид действия из Telegram выполнить нельзя: откройте сайт." };
  }
}

export type ExecDeps = {
  sandbox: (db: SupabaseClient, userId: string) => Promise<boolean>;
  token: (db: SupabaseClient, userId: string) => Promise<{ ok: true; token: string } | { ok: false }>;
  run: (token: string, action: TgAction) => Promise<WbResult>;
  log: typeof recordAction;
  /** Создание и удаление поручений: не запись в WB, поэтому тестовый режим и токен не нужны. */
  order: (db: SupabaseClient, userId: string, action: OrderCreateAction | OrderDeleteAction) => Promise<ExecResult>;
  invalidate: (db: SupabaseClient, userId: string, sources: Array<"base" | "ads_stats">) => Promise<unknown>;
};

const defaultDeps: ExecDeps = {
  sandbox: (db, userId) => isSandboxOn(db, userId),
  token: async (db, userId) => {
    const opened = await openSellerHubWbToken(userId, supabaseSellerHubSecretDb(db));
    return opened.ok ? { ok: true, token: opened.token } : { ok: false };
  },
  run: runWbAction,
  log: recordAction,
  order: runOrderAction,
  invalidate: (db, userId, sources) => invalidateSources(db, userId, "wildberries", sources),
};

/** Поручение: проверка ещё раз (карточка могла устареть), затем создание или удаление. */
export async function runOrderAction(db: SupabaseClient, userId: string, action: OrderCreateAction | OrderDeleteAction): Promise<ExecResult> {
  try {
    if (action.type === "order_delete") {
      await deleteOrder(db, userId, action.orderId);
      return { ok: true, message: "Поручение удалено." };
    }
    const valid = validateOrderInput({ ...action.input, createdFrom: "chat" });
    if (!valid.ok) return { ok: false, message: valid.error };
    if (action.replaceId) {
      await updateOrder(db, userId, action.replaceId, { input: valid.value }, Date.now());
      return { ok: true, message: "Поручение обновлено.", createdId: undefined };
    }
    const created = await createOrder(db, userId, valid.value, Date.now());
    return { ok: true, message: "Поручение создано и уже работает по расписанию.", createdId: created.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Не удалось сохранить поручение" };
  }
}

/** Выполняет подтверждённое действие. Любой сбой превращается в понятное сообщение; наружу не попадают токены. */
export async function executeTgAction(db: SupabaseClient, userId: string, action: TgAction, deps: Partial<ExecDeps> = {}): Promise<ExecResult> {
  const d = { ...defaultDeps, ...deps };
  if (!isTgAction(action)) return { ok: false, message: "Этот вид действия из Telegram выполнить нельзя: откройте сайт." };
  if (action.type === "order_create" || action.type === "order_delete") return d.order(db, userId, action);
  if (action.type === "deposit") {
    const tooSmall = depositMinMessage(action.sumRub);
    if (tooSmall) return { ok: false, message: tooSmall };
  }
  // Тестовый режим агента: проверяем всё, но в кабинет ничего не отправляем. Сбой чтения настройки считается включённым режимом.
  if (await d.sandbox(db, userId)) return { ok: false, simulated: true, message: SANDBOX_MESSAGE };
  const opened = await d.token(db, userId);
  if (!opened.ok) return { ok: false, message: "Нет доступа к кабинету Wildberries. Проверьте токен в разделе «Кабинет и API» на сайте." };
  const name = logName(action);
  const targetId = "campaignId" in action ? Number(action.campaignId) : "advertId" in action ? Number(action.advertId) : null;
  const nmId = "nmId" in action ? Number(action.nmId) : null;
  let res: WbResult;
  try {
    res = await d.run(opened.token, action);
  } catch (e) {
    res = { ok: false, error: e instanceof Error ? safeSellerHubMessage(e.message, opened.token) : "Не удалось выполнить действие" };
  }
  const error = res.error ? safeSellerHubMessage(res.error, opened.token) : undefined;
  await d.log({ userId, agent: name.agent, action: name.action, targetId: Number.isFinite(targetId ?? NaN) ? targetId : null, nmId: Number.isFinite(nmId ?? NaN) ? nmId : null, request: { type: action.type, via: "telegram" }, result: res.ok ? "ok" : "error", message: res.ok ? "Выполнено через Telegram по подтверждению владельца" : (error ?? "Ошибка"), initiator: "user" }).catch(() => undefined);
  // Снимок кабинета устарел и после неудачи тоже: запись могла дойти до WB.
  await d.invalidate(db, userId, sourcesFor(action)).catch(() => undefined);
  return res.ok ? { ok: true, message: "Готово, изменение принято Wildberries." } : { ok: false, message: friendlyWbError(error) };
}

