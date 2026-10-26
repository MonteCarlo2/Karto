import { EVENT_GROUP, type SellerEventKind, type SellerEventSeverity, type SellerProductEvent } from "./types";
import type { SellerCatalogSnapshot, SellerHubScope } from "@/lib/seller-hub/types";
import { describeTariffChange, diffTariffs, tariffSignalsFromSnapshot, type TariffSignals } from "./tariff-events";

/**
 * События по всему кабинету, не по одному товару: реклама, акции, заказы FBS, поставки, финансы, штрафы, негативные отзывы, доступы.
 * Событие — факт перехода между двумя снимками («было → стало»), один раз. Состояния («мало остатка», «есть неотвеченные») сюда не попадают:
 * их ведёт раздел «Задачи». Каждая строка строится только из данных WB в снимке кабинета.
 * Первый снимок только запоминает значения и событий не создаёт.
 */

export const PENALTY_MIN_RUB = 100;
export const WITHDRAW_MIN_RUB = 1000;
/** Если прошлый снимок старше недели, заказы FBS (окно 7 дней) сравнивать нельзя: события не создаём, чтобы не было лавины. */
export const ORDERS_MAX_GAP_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_KIND = 10;
const MAX_ID_MEMORY = 500;

export type NegativeReview = { id: string; nmId: string; rating: number; text: string };

/** Что читаем из снимка сейчас. null в разделе — WB не отдал этот блок, сравнивать нечего. */
export type AdSignal = {
  name: string;
  status: string;
  /** Остаток бюджета кампании, ₽. undefined/null — не читали или WB не вернул. */
  budget?: number | null;
  /** Дневной лимит, ₽. null — не включён; undefined — не читали. */
  dailyLimit?: number | null;
  /** nmId → [ставка в поиске, ставка в рекомендациях], ₽. null — список артикулов не читали. */
  nms?: Record<string, [number | null, number | null]> | null;
};

/** Расход и заказы по дням, все кампании вместе. */
export type AdDayPoint = { date: string; spend: number; orders: number };

export type StoreSignals = {
  capturedAt: string;
  ads: Record<string, AdSignal> | null;
  /** Дневной ряд расхода рекламы за последнюю неделю (из статистики WB). null — статистику не читали. */
  adsDaily?: AdDayPoint[] | null;
  /** nmId → причина блокировки карточки WB. null — отчёт не читали. */
  blocked?: Record<string, string> | null;
  /** Склад → [логистика, хранение короба 5 л], ₽. null — тарифы не читали. */
  tariffs?: TariffSignals | null;
  /** nmId → [средняя оценка отзывов за 180 дней, число отзывов]. */
  ratings?: Record<string, [number, number]> | null;
  /** nmId → [процент выкупа «дозревшего» периода, число заказов в нём]. */
  buyouts?: Record<string, [number, number]> | null;
  promos: Record<string, { name: string; startAt: string | null; endAt: string | null; participants: string[] | null; inPromo?: number | null; notInPromo?: number | null }> | null;
  /** id заказа FBS → отменён ли. Окно 7 дней, как в снимке. */
  orders: Record<string, { canceled: boolean; price: number | null }> | null;
  supplies: Record<string, { name: string; done: boolean }> | null;
  finance: { forWithdraw: number | null; docs: Record<string, string> } | null;
  /** Штрафы и удержания WB за 28 дней по отчёту реализации, ₽. */
  penalties: number | null;
  negatives: NegativeReview[] | null;
  scopes: Partial<Record<SellerHubScope, boolean>> | null;
};

/** То, что хранится между снимками: от отзывов только id, чтобы не копить тексты. */
export type StoreSignalsBaseline = Omit<StoreSignals, "negatives"> & { negativeIds: string[] | null };

const SCOPE_LABEL: Record<SellerHubScope, string> = {
  content: "Контент",
  prices: "Цены и скидки",
  stocks: "Остатки",
  analytics: "Аналитика",
  promotion: "Продвижение",
  marketplace: "Маркетплейс (заказы FBS)",
  supplies: "Поставки",
  advert: "Реклама",
};

const CANCELED_SUPPLIER = new Set(["cancel", "cancel_carrier"]);
/** Та же проверка, что `isWbOrderCanceled` в клиенте WB (копия: сюда нельзя тянуть серверный код). */
function isCanceled(supplierStatus: string | undefined, wbStatus: string | undefined): boolean {
  const wb = wbStatus ?? "";
  return CANCELED_SUPPLIER.has(supplierStatus ?? "") || wb.startsWith("cancel") || wb === "declined_by_client";
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const rub = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

function dailyFromStats(campaigns: NonNullable<SellerCatalogSnapshot["adsStats"]>["campaigns"]): AdDayPoint[] {
  const byDate = new Map<string, AdDayPoint>();
  for (const campaign of campaigns) {
    for (const day of campaign.days) {
      const acc = byDate.get(day.date) ?? { date: day.date, spend: 0, orders: 0 };
      acc.spend += day.spend;
      acc.orders += day.orders;
      byDate.set(day.date, acc);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function signalsFromSnapshot(snapshot: SellerCatalogSnapshot): StoreSignals {
  const ads = snapshot.ads
    ? Object.fromEntries(
        snapshot.ads.campaigns.map((c) => [
          c.id,
          {
            name: c.name?.trim() || `Кампания ${c.id}`,
            status: c.statusLabel?.trim() || (c.status != null ? `статус ${c.status}` : "статус неизвестен"),
            budget: c.budget ?? null,
            dailyLimit: c.dailyLimit === undefined ? undefined : (c.dailyLimit?.limitRub ?? null),
            nms: c.bids ? Object.fromEntries(c.bids.map((b) => [b.nmId, [b.searchRub, b.recommendationsRub] as [number | null, number | null]])) : null,
          } satisfies AdSignal,
        ]),
      )
    : null;
  const adsDaily = snapshot.adsStats ? dailyFromStats(snapshot.adsStats.campaigns) : null;
  const promos = snapshot.promotions
    ? Object.fromEntries(
        snapshot.promotions.map((p) => [
          p.id,
          { name: p.name || `Акция ${p.id}`, startAt: p.startAt ?? null, endAt: p.endAt ?? null, participants: p.participantNmIds ? p.participantNmIds.map(String) : null, inPromo: p.inPromoTotal ?? p.participatingSkuCount ?? null, notInPromo: p.notInPromoTotal ?? null },
        ]),
      )
    : null;
  const orders = snapshot.orders
    ? Object.fromEntries(snapshot.orders.orders.map((o) => [String(o.externalId), { canceled: isCanceled(o.supplierStatus, o.wbStatus), price: o.price ?? null }]))
    : null;
  const supplies = snapshot.supplies ? Object.fromEntries(snapshot.supplies.supplies.map((s) => [s.id, { name: s.name?.trim() || s.id, done: s.done }])) : null;
  const finance =
    snapshot.finance?.available === true
      ? { forWithdraw: snapshot.finance.forWithdraw ?? null, docs: Object.fromEntries(snapshot.finance.documents.map((d) => [d.id, d.title])) }
      : null;
  let penalties: number | null = null;
  const real = snapshot.realization;
  if (real && !real.error) {
    penalties = Object.values(real.byNm).reduce((s, nm) => s + (nm.current?.Pen ?? 0), 0) + (real.noNmCurrent?.Pen ?? 0);
  }
  let negatives: NegativeReview[] | null = null;
  const fb = snapshot.feedbacks;
  if (fb && (fb.status === "ok" || fb.status === "partial")) {
    const seen = new Map<string, NegativeReview>();
    for (const [nmId, stats] of Object.entries(fb.byNm)) {
      for (const r of stats.windowNegatives) seen.set(r.id, { id: r.id, nmId, rating: r.rating, text: r.cons || r.text || r.pros });
    }
    negatives = [...seen.values()];
  }
  const blocked = snapshot.blockedCards ? Object.fromEntries(snapshot.blockedCards.cards.map((c) => [c.nmId, c.reason?.trim() || ""])) : null;
  let ratings: Record<string, [number, number]> | null = null;
  if (snapshot.feedbacks && (snapshot.feedbacks.status === "ok" || snapshot.feedbacks.status === "partial")) {
    ratings = {};
    for (const [nmId, row] of Object.entries(snapshot.feedbacks.byNm)) {
      if (row.ratingAvg != null && row.reviewCount180 != null) ratings[nmId] = [row.ratingAvg, row.reviewCount180];
    }
  }
  let buyouts: Record<string, [number, number]> | null = null;
  if (snapshot.funnel && !snapshot.funnel.error) {
    buyouts = {};
    for (const [nmId, row] of Object.entries(snapshot.funnel.byNm)) {
      const past = row.past;
      if (past?.buyoutPercent != null && past.orderCount != null) buyouts[nmId] = [past.buyoutPercent, past.orderCount];
    }
  }
  const tariffs = tariffSignalsFromSnapshot(snapshot.tariffs);
  return { capturedAt: snapshot.syncedAt, ads, adsDaily, blocked, ratings, buyouts, tariffs, promos, orders, supplies, finance, penalties, negatives, scopes: snapshot.scopes ?? null };
}

/**
 * Блокировки, оценки и выкуп приходят в снимок позже каталога. Пока их нет, помним прошлые значения:
 * иначе пустой снимок затёр бы память, и следующий (уже с данными) не с чем было бы сравнить.
 */
export function baselineOfSignals(s: StoreSignals, previous: StoreSignalsBaseline | null = null): StoreSignalsBaseline {
  const { negatives, ...rest } = s;
  const orders = s.orders ? Object.fromEntries(Object.entries(s.orders).slice(-MAX_ID_MEMORY)) : null;
  return {
    ...rest,
    orders,
    blocked: s.blocked ?? previous?.blocked ?? null,
    ratings: s.ratings ?? previous?.ratings ?? null,
    buyouts: s.buyouts ?? previous?.buyouts ?? null,
    tariffs: s.tariffs ?? previous?.tariffs ?? null,
    negativeIds: negatives ? negatives.map((n) => n.id).slice(-MAX_ID_MEMORY) : null,
  };
}

type Product = { title: string };
type Titles = (nmId: string) => Product | null;

function make(kind: SellerEventKind, severity: SellerEventSeverity, title: string, detail: string, createdAt: string, fingerprint: string, nmId: string | null = null, productTitle: string | null = null): SellerProductEvent {
  return {
    id: `${kind}:${nmId ?? "store"}:${fingerprint}`,
    createdAt,
    kind,
    group: EVENT_GROUP[kind],
    severity,
    title,
    detail,
    productTitle,
    vendorCode: null,
    nmId,
    itemId: null,
  };
}

/** Бюджет поднялся минимум на столько рублей: меньше — округление, пополнение так не выглядит. */
const BUDGET_TOP_UP_MIN_RUB = 1;
/** Ставка изменилась минимум на столько рублей: меньше — шум округления копеек. */
const BID_CHANGE_MIN_RUB = 0.5;
/** Расход дня выше обычного минимум в столько раз и минимум на столько рублей: меньшее — нормальные колебания. */
const SPEND_SPIKE_RATIO = 1.6;
const SPEND_SPIKE_MIN_EXTRA_RUB = 200;
/** Сколько прошлых дней нужно, чтобы назвать расход «обычным». */
const SPEND_SPIKE_MIN_HISTORY_DAYS = 4;

function names(nmIds: string[], titleOf: Titles): string {
  return nmIds.slice(0, 3).map((n) => titleOf(n)?.title ?? `Артикул ${n}`).join("; ") + (nmIds.length > 3 ? ` и ещё ${nmIds.length - 3}` : "");
}

/** Что изменилось в одной рекламной кампании между снимками: бюджет, лимит, состав артикулов, ставки. */
function diffCampaign(id: string, before: AdSignal, now: AdSignal, at: string, tag: string, titleOf: Titles): SellerProductEvent[] {
  const out: SellerProductEvent[] = [];
  const label = `Кампания «${now.name}»`;
  if (before.budget != null && now.budget != null) {
    if (before.budget > 0 && now.budget <= 0) {
      out.push(make("ad_budget_ended", "important", `${label}: бюджет закончился`, `Остаток ${rub(before.budget)} → 0 ₽, показы остановились`, at, `${id}:${tag}`));
    } else if (now.budget - before.budget >= BUDGET_TOP_UP_MIN_RUB) {
      out.push(make("ad_budget_topped_up", "info", `${label}: бюджет пополнен`, `Остаток ${rub(before.budget)} → ${rub(now.budget)}`, at, `${id}:${tag}`));
    }
  }
  if (before.dailyLimit !== undefined && now.dailyLimit !== undefined && before.dailyLimit !== now.dailyLimit) {
    const was = before.dailyLimit == null ? "не было" : rub(before.dailyLimit);
    const is = now.dailyLimit == null ? "выключен" : rub(now.dailyLimit);
    out.push(make("ad_limit_changed", "info", `${label}: изменён дневной лимит`, `${was} → ${is}`, at, `${id}:${was}>${is}`));
  }
  if (before.nms && now.nms) {
    const added = Object.keys(now.nms).filter((n) => !(n in before.nms!));
    const removed = Object.keys(before.nms).filter((n) => !(n in now.nms!));
    if (added.length > 0) out.push(make("ad_product_added", "info", `${label}: добавлено товаров ${added.length}`, names(added, titleOf), at, `${id}:in:${added.join(",")}`, added.length === 1 ? added[0]! : null, added.length === 1 ? (titleOf(added[0]!)?.title ?? null) : null));
    if (removed.length > 0) out.push(make("ad_product_removed", "info", `${label}: убрано товаров ${removed.length}`, names(removed, titleOf), at, `${id}:out:${removed.join(",")}`, removed.length === 1 ? removed[0]! : null, removed.length === 1 ? (titleOf(removed[0]!)?.title ?? null) : null));
    const changed: string[] = [];
    for (const [nm, [search, rec]] of Object.entries(now.nms)) {
      const old = before.nms[nm];
      if (!old) continue;
      const moved = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) >= BID_CHANGE_MIN_RUB;
      if (moved(old[0], search) || moved(old[1], rec)) changed.push(nm);
    }
    if (changed.length > 0) {
      const nm = changed[0]!;
      const o = before.nms[nm]!;
      const n = now.nms[nm]!;
      const fmt = (v: number | null) => (v == null ? "—" : rub(v));
      const example = `${titleOf(nm)?.title ?? `Артикул ${nm}`}: поиск ${fmt(o[0])} → ${fmt(n[0])}, рекомендации ${fmt(o[1])} → ${fmt(n[1])}`;
      out.push(make("ad_bid_changed", "info", `${label}: изменены ставки (${changed.length})`, changed.length > 1 ? `${example} и ещё ${changed.length - 1}` : example, at, `${id}:${tag}`, changed.length === 1 ? nm : null, changed.length === 1 ? (titleOf(nm)?.title ?? null) : null));
    }
  }
  return out;
}

/**
 * Расход на рекламу за последний полный день заметно выше обычного. Факт по данным WB, без оценок причины.
 * «Обычный» расход — медиана предыдущих дней окна: она не тянется вверх от одного всплеска.
 */
function adSpendSpike(daily: AdDayPoint[] | null, now: string): SellerProductEvent | null {
  if (!daily || daily.length < SPEND_SPIKE_MIN_HISTORY_DAYS + 1) return null;
  const last = daily[daily.length - 1]!;
  const history = daily.slice(0, -1).map((d) => d.spend).sort((a, b) => a - b);
  const mid = Math.floor(history.length / 2);
  const median = history.length % 2 === 0 ? (history[mid - 1]! + history[mid]!) / 2 : history[mid]!;
  if (!(median > 0) || last.spend < median * SPEND_SPIKE_RATIO || last.spend - median < SPEND_SPIKE_MIN_EXTRA_RUB) return null;
  return make("ad_spend_spike", "important", "Расход на рекламу вырос", `${last.date}: ${rub(last.spend)} при обычных ${rub(median)} в день (медиана предыдущих дней), заказов по рекламе ${last.orders}`, now, last.date);
}

/** Оценка отзывов изменилась минимум на 0,2 балла при достаточном числе отзывов в обоих снимках. */
const RATING_STEP = 0.2;
const RATING_MIN_REVIEWS = 10;
/** Выкуп изменился минимум на столько процентных пунктов, при достаточном числе заказов и значимо (z ≥ 2). */
const BUYOUT_STEP_POINTS = 8;
const BUYOUT_MIN_ORDERS = 20;
const BUYOUT_Z = 2;
const MAX_CARD_EVENTS = 10;

const oneDecimal = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

/** Карточки: блокировка WB, оценка отзывов, процент выкупа. Только факты «было → стало», без рекомендаций (они в «Задачах»). */
function diffCardSignals(prev: StoreSignalsBaseline, next: StoreSignals, at: string, tag: string, titleOf: Titles): SellerProductEvent[] {
  const out: SellerProductEvent[] = [];
  const title = (nm: string) => titleOf(nm)?.title ?? `Артикул ${nm}`;
  if (prev.blocked && next.blocked) {
    for (const [nm, reason] of Object.entries(next.blocked).slice(0, MAX_CARD_EVENTS)) {
      if (!(nm in prev.blocked)) out.push(make("card_blocked", "critical", `WB заблокировал карточку`, `${title(nm)}${reason ? `. Причина по данным WB: ${clip(reason, 200)}` : ""}`, at, `${nm}:${tag}`, nm, titleOf(nm)?.title ?? null));
    }
    for (const nm of Object.keys(prev.blocked).slice(0, MAX_CARD_EVENTS)) {
      if (!(nm in next.blocked)) out.push(make("card_unblocked", "info", `Карточка снова доступна`, `${title(nm)}: WB убрал её из списка заблокированных`, at, `${nm}:${tag}`, nm, titleOf(nm)?.title ?? null));
    }
  }
  if (prev.ratings && next.ratings) {
    let n = 0;
    for (const [nm, [rating, count]] of Object.entries(next.ratings)) {
      const before = prev.ratings[nm];
      if (!before || n >= MAX_CARD_EVENTS || count < RATING_MIN_REVIEWS || before[1] < RATING_MIN_REVIEWS) continue;
      const delta = Math.round((rating - before[0]) * 100) / 100;
      if (Math.abs(delta) < RATING_STEP) continue;
      n += 1;
      out.push(make("rating_changed", delta < 0 ? "important" : "info", delta < 0 ? "Оценка отзывов упала" : "Оценка отзывов выросла", `${title(nm)}: ${oneDecimal(before[0])} → ${oneDecimal(rating)} (отзывов за 180 дней: ${count})`, at, `${nm}:${oneDecimal(before[0])}>${oneDecimal(rating)}`, nm, titleOf(nm)?.title ?? null));
    }
  }
  if (prev.buyouts && next.buyouts) {
    let n = 0;
    for (const [nm, [percent, orders]] of Object.entries(next.buyouts)) {
      const before = prev.buyouts[nm];
      if (!before || n >= MAX_CARD_EVENTS || orders < BUYOUT_MIN_ORDERS || before[1] < BUYOUT_MIN_ORDERS) continue;
      const delta = percent - before[0];
      if (Math.abs(delta) < BUYOUT_STEP_POINTS) continue;
      // Значимость: две доли выкупа с их числом заказов. Окна пересекаются, поэтому проверка консервативная.
      const p1 = percent / 100;
      const p0 = before[0] / 100;
      const pooled = (p1 * orders + p0 * before[1]) / (orders + before[1]);
      const se = Math.sqrt(pooled * (1 - pooled) * (1 / orders + 1 / before[1]));
      if (!(se > 0) || Math.abs(p1 - p0) / se < BUYOUT_Z) continue;
      n += 1;
      out.push(make("buyout_changed", delta < 0 ? "important" : "info", delta < 0 ? "Выкуп товара упал" : "Выкуп товара вырос", `${title(nm)}: ${Math.round(before[0])}% → ${Math.round(percent)}% (заказов в периоде: ${orders})`, at, `${nm}:${Math.round(before[0])}>${Math.round(percent)}`, nm, titleOf(nm)?.title ?? null));
    }
  }
  return out;
}

/** Сравнивает прошлый снимок кабинета с текущим и возвращает новые события. */
export function diffStoreSignals(input: { now: string; previous: StoreSignalsBaseline | null; next: StoreSignals; titleOf: Titles }): SellerProductEvent[] {
  const { now, previous: prev, next, titleOf } = input;
  if (!prev) return [];
  const out: SellerProductEvent[] = [];
  const tag = next.capturedAt || now;

  // Реклама: смена статуса и новые кампании.
  if (prev.ads && next.ads) {
    for (const [id, c] of Object.entries(next.ads)) {
      const before = prev.ads[id];
      if (!before) {
        out.push(make("ad_campaign_added", "info", `Новая рекламная кампания «${c.name}»`, `Статус: ${c.status}`, now, id));
      } else if (before.status !== c.status) {
        const stopped = /пауз|останов|заверш|отключ|удал/i.test(c.status);
        out.push(make("ad_status_changed", stopped ? "important" : "info", `Кампания «${c.name}»: статус изменился`, `${before.status} → ${c.status}`, now, `${id}:${before.status}>${c.status}`));
      }
      if (before) out.push(...diffCampaign(id, before, c, now, tag, titleOf));
    }
  }
  const spike = adSpendSpike(next.adsDaily ?? null, now);
  if (spike) out.push(spike);

  // Акции WB: новая акция и вход или выход товаров.
  if (prev.promos && next.promos) {
    for (const [id, p] of Object.entries(next.promos)) {
      const before = prev.promos[id];
      const period = [p.startAt, p.endAt].filter(Boolean).join(" — ");
      if (!before) {
        out.push(make("promo_new", "info", `Новая акция WB «${p.name}»`, period ? `Даты: ${period}` : "Даты не указаны", now, id));
        continue;
      }
      if (before.participants && p.participants) {
        const was = new Set(before.participants);
        const is = new Set(p.participants);
        const entered = p.participants.filter((n) => !was.has(n));
        const left = before.participants.filter((n) => !is.has(n));
        const list = (nms: string[]) => nms.slice(0, 3).map((n) => titleOf(n)?.title ?? `Артикул ${n}`).join("; ") + (nms.length > 3 ? ` и ещё ${nms.length - 3}` : "");
        if (entered.length > 0) out.push(make("promo_entered", "info", `В акцию «${p.name}» вошло товаров: ${entered.length}`, list(entered), now, `${id}:in:${entered.join(",")}`));
        if (left.length > 0) out.push(make("promo_left", "important", `Из акции «${p.name}» вышло товаров: ${left.length}`, list(left), now, `${id}:out:${left.join(",")}`));
      }
    }
  }

  // Заказы FBS: новые и отменённые с прошлого снимка (окно снимка 7 дней).
  const gap = prev.capturedAt ? Date.parse(next.capturedAt || now) - Date.parse(prev.capturedAt) : Number.POSITIVE_INFINITY;
  if (prev.orders && next.orders && gap >= 0 && gap <= ORDERS_MAX_GAP_MS) {
    let fresh = 0;
    let freshSum = 0;
    let canceled = 0;
    for (const [id, o] of Object.entries(next.orders)) {
      const before = prev.orders[id];
      if (!before) {
        if (o.canceled) canceled += 1;
        else {
          fresh += 1;
          freshSum += o.price ?? 0;
        }
      } else if (o.canceled && !before.canceled) canceled += 1;
    }
    if (fresh > 0) out.push(make("orders_new", "info", `Новых заказов FBS: ${fresh}`, freshSum > 0 ? `На сумму ${rub(freshSum)}` : "", now, `${tag}:${fresh}`));
    if (canceled > 0) out.push(make("orders_canceled", "important", `Отменено заказов FBS: ${canceled}`, "Отмена со стороны покупателя или WB", now, `${tag}:${canceled}`));
  }

  // Поставки: созданные и закрытые.
  if (prev.supplies && next.supplies) {
    let n = 0;
    for (const [id, s] of Object.entries(next.supplies)) {
      if (n >= MAX_PER_KIND) break;
      const before = prev.supplies[id];
      if (!before) {
        out.push(make("supply_created", "info", `Создана поставка «${s.name}»`, "", now, id));
        n += 1;
      } else if (!before.done && s.done) {
        out.push(make("supply_closed", "info", `Поставка «${s.name}» закрыта`, "", now, id));
        n += 1;
      }
    }
  }

  // Финансы: новые документы и рост суммы к выводу.
  if (prev.finance && next.finance) {
    for (const [id, title] of Object.entries(next.finance.docs).slice(0, MAX_PER_KIND)) {
      if (!(id in prev.finance.docs)) out.push(make("finance_document", "info", "Новый финансовый документ WB", title, now, id));
    }
    const a = prev.finance.forWithdraw;
    const b = next.finance.forWithdraw;
    if (a != null && b != null && b - a >= WITHDRAW_MIN_RUB) {
      out.push(make("finance_withdraw_up", "info", "К выводу доступно больше", `${rub(a)} → ${rub(b)}`, now, `${Math.round(a)}>${Math.round(b)}`));
    }
  }

  // Штрафы и удержания: окно скользит, поэтому формулируем как рост суммы за 28 дней.
  if (prev.penalties != null && next.penalties != null && next.penalties - prev.penalties >= PENALTY_MIN_RUB) {
    out.push(make("penalties_up", "important", "Штрафов и удержаний WB стало больше", `За 28 дней: ${rub(prev.penalties)} → ${rub(next.penalties)}`, now, `${Math.round(prev.penalties)}>${Math.round(next.penalties)}`));
  }

  // Негативные отзывы: новые с прошлого снимка.
  if (prev.negativeIds && next.negatives) {
    const known = new Set(prev.negativeIds);
    for (const r of next.negatives.filter((x) => !known.has(x.id)).slice(0, MAX_PER_KIND)) {
      const p = titleOf(r.nmId);
      out.push(make("review_negative", r.rating <= 2 ? "important" : "info", `Негативный отзыв ${r.rating}★`, clip(r.text.trim(), 200), now, r.id, r.nmId, p?.title ?? null));
    }
  }

  out.push(...diffCardSignals(prev, next, now, tag, titleOf));

  // Тарифы WB на логистику и хранение: факт изменения по сети складов.
  for (const change of diffTariffs(prev.tariffs, next.tariffs)) {
    const text = describeTariffChange(change);
    const kind = change.metric === "logistics" ? "tariff_logistics_changed" : "tariff_storage_changed";
    out.push(make(kind, text.up ? "important" : "info", text.title, text.detail, now, tag));
  }

  // Доступы токена WB.
  if (prev.scopes && next.scopes) {
    for (const key of Object.keys(SCOPE_LABEL) as SellerHubScope[]) {
      const was = prev.scopes[key];
      const is = next.scopes[key];
      if (was === true && is === false) out.push(make("access_lost", "critical", `Токен потерял доступ: ${SCOPE_LABEL[key]}`, "Данные этого раздела не обновляются. Проверьте права токена в кабинете WB.", now, `${key}:${tag}`));
      if (was === false && is === true) out.push(make("access_restored", "info", `Доступ восстановлен: ${SCOPE_LABEL[key]}`, "", now, `${key}:${tag}`));
    }
  }

  return out;
}


// ── Разбор данных от клиента: сервер принимает снимок кабинета с браузера, поэтому форму и размеры проверяем. ──

const MAX_RECORDS = 5000;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function entries(v: unknown): Array<[string, Record<string, unknown>]> | null {
  if (v === null || v === undefined) return null;
  if (!isRecord(v)) return null;
  return Object.entries(v)
    .slice(0, MAX_RECORDS)
    .filter((e): e is [string, Record<string, unknown>] => isRecord(e[1]));
}

/** nmId → [число, число]; мусор в записях отбрасывается. */
function pairRecord(v: unknown): Record<string, [number, number]> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, [number, number]> = {};
  for (const [nm, pair] of Object.entries(v).slice(0, MAX_RECORDS)) {
    if (!Array.isArray(pair)) continue;
    const a = numOrNull(pair[0]);
    const b = numOrNull(pair[1]);
    if (a != null && b != null) out[nm.slice(0, 32)] = [a, b];
  }
  return out;
}

/** Склад → [логистика, хранение]; мусор отбрасывается. */
function tariffRecord(v: unknown): TariffSignals | null {
  if (!isRecord(v)) return null;
  const out: TariffSignals = {};
  for (const [name, pair] of Object.entries(v).slice(0, 500)) {
    if (!Array.isArray(pair)) continue;
    out[name.slice(0, 120)] = [numOrNull(pair[0]), numOrNull(pair[1])];
  }
  return out;
}

export function parseStoreSignals(raw: unknown): StoreSignals | null {
  if (!isRecord(raw)) return null;
  const capturedAt = str(raw.capturedAt, 40);
  if (!capturedAt || !Number.isFinite(Date.parse(capturedAt))) return null;

  const ads = entries(raw.ads);
  const promos = entries(raw.promos);
  const orders = entries(raw.orders);
  const supplies = entries(raw.supplies);

  let finance: StoreSignals["finance"] = null;
  if (isRecord(raw.finance)) {
    const docs = isRecord(raw.finance.docs) ? Object.entries(raw.finance.docs).slice(0, MAX_RECORDS) : [];
    finance = { forWithdraw: numOrNull(raw.finance.forWithdraw), docs: Object.fromEntries(docs.map(([id, t]) => [id.slice(0, 80), str(t, 200)])) };
  }

  let negatives: NegativeReview[] | null = null;
  if (Array.isArray(raw.negatives)) {
    negatives = raw.negatives
      .slice(0, MAX_RECORDS)
      .filter(isRecord)
      .map((r) => ({ id: str(r.id, 80), nmId: str(r.nmId, 32), rating: numOrNull(r.rating) ?? 0, text: str(r.text, 400) }))
      .filter((r) => r.id);
  }

  let scopes: StoreSignals["scopes"] = null;
  if (isRecord(raw.scopes)) {
    scopes = {};
    for (const key of Object.keys(SCOPE_LABEL) as SellerHubScope[]) if (typeof raw.scopes[key] === "boolean") scopes[key] = raw.scopes[key] as boolean;
  }

  return {
    capturedAt,
    ads:
      ads &&
      Object.fromEntries(
        ads.map(([id, c]): [string, AdSignal] => [
          id.slice(0, 80),
          {
            name: str(c.name, 200),
            status: str(c.status, 80),
            budget: numOrNull(c.budget),
            dailyLimit: c.dailyLimit === undefined ? undefined : numOrNull(c.dailyLimit),
            nms: isRecord(c.nms)
              ? Object.fromEntries(
                  Object.entries(c.nms)
                    .slice(0, MAX_RECORDS)
                    .filter((e): e is [string, unknown[]] => Array.isArray(e[1]))
                    .map(([nm, v]): [string, [number | null, number | null]] => [nm.slice(0, 32), [numOrNull(v[0]), numOrNull(v[1])]]),
                )
              : null,
          },
        ]),
      ),
    adsDaily: Array.isArray(raw.adsDaily)
      ? raw.adsDaily
          .slice(0, 62)
          .filter(isRecord)
          .map((d) => ({ date: str(d.date, 10), spend: numOrNull(d.spend) ?? 0, orders: numOrNull(d.orders) ?? 0 }))
          .filter((d) => d.date)
      : null,
    blocked: isRecord(raw.blocked) ? Object.fromEntries(Object.entries(raw.blocked).slice(0, MAX_RECORDS).map(([nm, r]) => [nm.slice(0, 32), str(r, 300)])) : null,
    ratings: pairRecord(raw.ratings),
    buyouts: pairRecord(raw.buyouts),
    tariffs: tariffRecord(raw.tariffs),
    promos:
      promos &&
      Object.fromEntries(
        promos.map(([id, p]) => [
          id.slice(0, 80),
          {
            name: str(p.name, 200),
            startAt: str(p.startAt, 40) || null,
            endAt: str(p.endAt, 40) || null,
            participants: Array.isArray(p.participants) ? p.participants.slice(0, MAX_RECORDS).map((n) => str(String(n), 32)) : null,
            inPromo: numOrNull(p.inPromo),
            notInPromo: numOrNull(p.notInPromo),
          },
        ]),
      ),
    orders: orders && Object.fromEntries(orders.map(([id, o]) => [id.slice(0, 40), { canceled: o.canceled === true, price: numOrNull(o.price) }])),
    supplies: supplies && Object.fromEntries(supplies.map(([id, s]) => [id.slice(0, 80), { name: str(s.name, 200), done: s.done === true }])),
    finance,
    penalties: numOrNull(raw.penalties),
    negatives,
    scopes,
  };
}

/** Прошлый снимок из базы: те же поля, но уже без отзывов, только их id. */
export function parseStoreSignalsBaseline(raw: unknown): StoreSignalsBaseline | null {
  if (!isRecord(raw)) return null;
  const parsed = parseStoreSignals({ ...raw, negatives: null });
  if (!parsed) return null;
  const { negatives: _omit, ...rest } = parsed;
  void _omit;
  const negativeIds = Array.isArray(raw.negativeIds) ? raw.negativeIds.slice(0, MAX_RECORDS).map((v) => str(v, 80)).filter(Boolean) : null;
  return { ...rest, negativeIds };
}

// ── Напоминания по календарю акций WB ──

export const PROMO_START_DAYS = 3;
export const PROMO_END_DAYS = 2;

const moscowKey = (ms: number) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(ms));
const daysBetween = (fromKey: string, toKey: string) => Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
const dayWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "дня" : "дней");
const ruDate = (key: string) => new Date(`${key}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });

/** Короткое название акции для показа и сопоставления: без хвоста « (автоматические скидки)». */
export function promoShortName(name: string): string {
  return name.replace(/\s*\((автоматические скидки|автоакция)\)\s*$/i, "").trim() || name;
}

/**
 * Предупреждения об акциях из календаря WB: за 3 дня до старта и за 2 дня до окончания. Участие считает сам WB
 * (сколько товаров уже в акции и сколько нет). Один раз на акцию и срок: идентификатор не даёт дублей.
 * @param todayKey сегодняшняя дата по Москве
 */
export function promoReminders(promos: StoreSignals["promos"], todayKey: string, nowIso: string): SellerProductEvent[] {
  if (!promos) return [];
  const out: SellerProductEvent[] = [];
  for (const [id, p] of Object.entries(promos)) {
    const startMs = p.startAt ? Date.parse(p.startAt) : Number.NaN;
    const endMs = p.endAt ? Date.parse(p.endAt) : Number.NaN;
    const start = Number.isFinite(startMs) ? moscowKey(startMs) : null;
    const end = Number.isFinite(endMs) ? moscowKey(endMs) : null;
    const name = promoShortName(p.name);
    const inP = p.inPromo ?? null;
    const notIn = p.notInPromo ?? null;
    const part = inP != null ? (notIn != null ? `Участвуют ${inP} из ${inP + notIn} ваших товаров.` : `Участвуют товаров: ${inP}.`) : "";
    const period = start && end ? `С ${ruDate(start)} по ${ruDate(end)}.` : "";
    if (start) {
      const left = daysBetween(todayKey, start);
      if (left > 0 && left <= PROMO_START_DAYS) {
        out.push(make("promo_deadline", "important", `Акция «${name}» стартует ${left === 1 ? "завтра" : `через ${left} ${dayWord(left)}`}`, [period, part, "Проверьте условия участия и свои цены в разделе «Продвижение»."].filter(Boolean).join("\n"), nowIso, `cal-${id}:start`));
      }
    }
    if (end) {
      const left = daysBetween(todayKey, end);
      const started = !start || daysBetween(start, todayKey) >= 0;
      if (left >= 0 && left <= PROMO_END_DAYS && started) {
        out.push(make("promo_deadline", "important", `Акция «${name}» ${left === 0 ? "заканчивается сегодня" : left === 1 ? "заканчивается завтра" : `заканчивается через ${left} ${dayWord(left)}`}`, [period, part, "Проверьте, какие товары участвуют и что будет с ценами после акции."].filter(Boolean).join("\n"), nowIso, `cal-${id}:end`));
      }
    }
  }
  return out;
}
