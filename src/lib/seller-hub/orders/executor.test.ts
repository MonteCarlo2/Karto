import assert from "node:assert/strict";
import { it } from "node:test";
import { executeOrder, type ExecutorDeps } from "./executor";
import type { Order } from "./types";

// 2026-11-18 07:00 UTC = 10:00 по Москве
const NOW = Date.parse("2026-11-18T07:00:00Z");

type Calls = { deposits: Array<{ campaignId: number; sum: number }>; priceWrites: Array<Array<{ nmId: number; price: number }>>; records: number };

function makeDeps(over: Partial<{ sandbox: boolean; budget: number; account: number | null; already: number; lastReminder: number; fired: number; days: Array<{ date: string; orders: number }> | null; prices: Record<number, { price: number; discountPercent: number }>; wbOk: boolean; token: boolean }> = {}) {
  const calls: Calls = { deposits: [], priceWrites: [], records: 0 };
  const o = { sandbox: false, budget: 300, account: 50_000, already: 0, lastReminder: 0, fired: 0, days: null as Array<{ date: string; orders: number }> | null, prices: {} as Record<number, { price: number; discountPercent: number }>, wbOk: true, token: true, ...over };
  const deps = {
    openToken: async () => (o.token ? { ok: true, token: "t" } : { ok: false, reason: "unavailable" }),
    adsSnapshot: async () => ({ campaigns: [{ id: "77", name: "Кампания", status: 9, budget: o.budget }], accountNet: o.account }),
    deposit: async (_t: string, req: { campaignId: number; sum: number }) => {
      calls.deposits.push(req);
      return o.wbOk ? { ok: true } : { ok: false, error: "WB отказал" };
    },
    prices: async () => new Map(Object.entries(o.prices).map(([k, v]) => [Number(k), v])),
    updatePrices: async (_t: string, rows: Array<{ nmId: number; price: number }>) => {
      calls.priceWrites.push(rows);
      return o.wbOk ? { ok: true } : { ok: false, error: "WB отказал" };
    },
    sandboxOn: async () => o.sandbox,
    record: async () => {
      calls.records += 1;
    },
    completeDays: async () => o.days,
    depositedToday: async () => o.already,
    lastReminderAt: async () => o.lastReminder,
    firedToday: async () => o.fired,
  };
  return { deps: deps as unknown as ExecutorDeps, calls };
}

const base: Omit<Order, "kind" | "params" | "schedule" | "limits" | "mode"> = { id: "o1", title: "т", status: "active", createdFrom: "form", nextRunAt: null, lastRunAt: null, runsCount: 0, lastStatus: null, lastSummary: null, createdAt: new Date(NOW).toISOString() };
const deposit = (mode: "act" | "ask", cap = 6000): Order => ({ ...base, kind: "ads_deposit", params: { campaignId: "77", belowRub: 500, topUpRub: 2000 }, schedule: { type: "check", everyMinutes: 60 }, limits: { maxPerDayRub: cap }, mode });
const priceStep = (mode: "act" | "ask", direction: "down" | "up", limits: Order["limits"]): Order => ({ ...base, kind: "price_step", params: { nmIds: ["1"], pct: 5, direction }, schedule: { type: "daily", time: "10:00" }, limits, mode });
const whenOrders = (then: "notify" | "deposit", mode: "act" | "ask"): Order => ({ ...base, kind: "when_orders", params: { belowOrders: 20, days: 3, then, text: "Заказов мало", campaignId: "77", topUpRub: 1500 }, schedule: { type: "check", everyMinutes: 180 }, limits: then === "deposit" ? { maxPerDayRub: 3000 } : {}, mode });
const low = [{ date: "2026-11-15", orders: 5 }, { date: "2026-11-16", orders: 3 }, { date: "2026-11-17", orders: 8 }];

it("напоминание: просто выдаёт текст, в кабинет не ходит", async () => {
  const { deps, calls } = makeDeps();
  const o = await executeOrder(deps, { ...base, kind: "remind", params: { text: "Проверить отзывы" }, schedule: { type: "daily", time: "09:00" }, limits: {}, mode: "ask" }, "u", NOW);
  assert.equal(o.status, "reminder");
  assert.equal(o.summary, "Проверить отзывы");
  assert.equal(calls.deposits.length, 0);
});

it("пополнение рекламы: остаток ниже порога, не тестовый режим — деньги уходят ровно на сумму поручения и пишутся в журнал", async () => {
  const { deps, calls } = makeDeps({ budget: 300 });
  const o = await executeOrder(deps, deposit("act"), "u", NOW);
  assert.equal(o.status, "done");
  assert.deepEqual(calls.deposits, [{ campaignId: 77, sum: 2000 }]);
  assert.equal(calls.records, 1);
});

it("пополнение рекламы: остаток в норме — ничего не делает", async () => {
  const { deps, calls } = makeDeps({ budget: 900 });
  const o = await executeOrder(deps, deposit("act"), "u", NOW);
  assert.equal(o.status, "skipped");
  assert.equal(calls.deposits.length, 0);
});

it("пополнение рекламы: кампания не запущена или остаток неизвестен — понятное сообщение, деньги не уходят", async () => {
  const paused = makeDeps();
  (paused.deps as unknown as { adsSnapshot: () => Promise<unknown> }).adsSnapshot = async () => ({ campaigns: [{ id: "77", name: "К", status: 11, budget: 100 }], accountNet: 5000 });
  const a = await executeOrder(paused.deps, deposit("act"), "u", NOW);
  assert.match(a.summary, /не запущена/);
  const gone = makeDeps();
  (gone.deps as unknown as { adsSnapshot: () => Promise<unknown> }).adsSnapshot = async () => ({ campaigns: [], accountNet: 5000 });
  assert.match((await executeOrder(gone.deps, deposit("act"), "u", NOW)).summary, /не найдена/);
  assert.equal(paused.calls.deposits.length + gone.calls.deposits.length, 0);
});

it("пополнение рекламы: тестовый режим ничего не отправляет", async () => {
  const { deps, calls } = makeDeps({ sandbox: true });
  const o = await executeOrder(deps, deposit("act"), "u", NOW);
  assert.equal(o.status, "simulated");
  assert.equal(calls.deposits.length, 0);
});

it("пополнение рекламы: режим «напомнить» только напоминает и не чаще раза в 12 часов", async () => {
  const first = makeDeps();
  const a = await executeOrder(first.deps, deposit("ask"), "u", NOW);
  assert.equal(a.status, "reminder");
  assert.equal(first.calls.deposits.length, 0);
  const again = makeDeps({ lastReminder: NOW - 3_600_000 });
  const b = await executeOrder(again.deps, deposit("ask"), "u", NOW);
  assert.equal(b.status, "skipped");
});

it("пополнение рекламы: суточный лимит не превышается", async () => {
  const { deps, calls } = makeDeps({ already: 5000 });
  // осталось 1000 ₽ из суточных 6000: пополняет не на 2000, а ровно на остаток лимита
  const o = await executeOrder(deps, deposit("act", 6000), "u", NOW);
  assert.equal(o.status, "done");
  assert.deepEqual(calls.deposits, [{ campaignId: 77, sum: 1000 }]);
  const full = makeDeps({ already: 6000 });
  assert.notEqual((await executeOrder(full.deps, deposit("act", 6000), "u", NOW)).status, "done");
  assert.equal(full.calls.deposits.length, 0);
});

it("пополнение рекламы: отказ Wildberries — запуск «ошибка», ничего не повторяется", async () => {
  const { deps, calls } = makeDeps({ wbOk: false });
  const o = await executeOrder(deps, deposit("act"), "u", NOW);
  assert.equal(o.status, "failed");
  assert.equal(calls.deposits.length, 1);
});

it("нет подключённого кабинета: запуск пропускается без ошибок", async () => {
  const { deps } = makeDeps({ token: false });
  assert.equal((await executeOrder(deps, deposit("act"), "u", NOW)).status, "skipped");
  assert.equal((await executeOrder(deps, priceStep("act", "down", { minBuyerPriceRub: 1000 }), "u", NOW)).status, "skipped");
});

it("снижение цены: шаг 5%, цена покупателя не падает ниже границы", async () => {
  const { deps, calls } = makeDeps({ prices: { 1: { price: 2000, discountPercent: 50 } } });
  // цена покупателя 1000 ₽, шаг −5% дал бы 950, а граница 980 → база подтягивается так, чтобы покупатель платил не меньше 980
  const o = await executeOrder(deps, priceStep("act", "down", { minBuyerPriceRub: 980 }), "u", NOW);
  assert.equal(o.status, "done");
  assert.equal(calls.priceWrites.length, 1);
  const buyer = calls.priceWrites[0]![0]!.price * 0.5;
  assert.ok(buyer >= 980, `покупатель платил бы ${buyer}`);
});

it("снижение цены: уже на границе — цену не трогает", async () => {
  const { deps, calls } = makeDeps({ prices: { 1: { price: 2000, discountPercent: 50 } } });
  const o = await executeOrder(deps, priceStep("act", "down", { minBuyerPriceRub: 1000 }), "u", NOW);
  assert.equal(o.status, "skipped");
  assert.equal(calls.priceWrites.length, 0);
});

it("повышение цены: не выше потолка; тестовый режим и «напомнить» ничего не пишут", async () => {
  const prices = { 1: { price: 2000, discountPercent: 50 } };
  const up = makeDeps({ prices });
  const a = await executeOrder(up.deps, priceStep("act", "up", { maxBuyerPriceRub: 1030 }), "u", NOW);
  assert.equal(a.status, "done");
  assert.ok(up.calls.priceWrites[0]![0]!.price * 0.5 <= 1030);
  const sandbox = makeDeps({ prices, sandbox: true });
  assert.equal((await executeOrder(sandbox.deps, priceStep("act", "up", { maxBuyerPriceRub: 1500 }), "u", NOW)).status, "simulated");
  assert.equal(sandbox.calls.priceWrites.length, 0);
  const ask = makeDeps({ prices });
  assert.equal((await executeOrder(ask.deps, priceStep("ask", "up", { maxBuyerPriceRub: 1500 }), "u", NOW)).status, "reminder");
  assert.equal(ask.calls.priceWrites.length, 0);
});

it("сценарий по заказам: мало заказов несколько дней — сообщает или пополняет рекламу, раз в сутки", async () => {
  const notify = makeDeps({ days: low });
  const a = await executeOrder(notify.deps, whenOrders("notify", "ask"), "u", NOW);
  assert.equal(a.status, "reminder");
  assert.match(a.summary, /Заказов по дням: 15\.11: 5, 16\.11: 3, 17\.11: 8/);

  const act = makeDeps({ days: low });
  const b = await executeOrder(act.deps, whenOrders("deposit", "act"), "u", NOW);
  assert.equal(b.status, "done");
  assert.deepEqual(act.calls.deposits, [{ campaignId: 77, sum: 1500 }]);

  const again = makeDeps({ days: low, fired: 1 });
  assert.equal((await executeOrder(again.deps, whenOrders("deposit", "act"), "u", NOW)).status, "skipped");
  assert.equal(again.calls.deposits.length, 0);
});

it("сценарий по заказам: условие не наступило или данных мало — ничего не делает", async () => {
  const ok = makeDeps({ days: [{ date: "2026-11-15", orders: 5 }, { date: "2026-11-16", orders: 30 }, { date: "2026-11-17", orders: 8 }] });
  assert.equal((await executeOrder(ok.deps, whenOrders("deposit", "act"), "u", NOW)).summary, "Условие не наступило");
  assert.equal(ok.calls.deposits.length, 0);
  const few = makeDeps({ days: low.slice(0, 2) });
  assert.equal((await executeOrder(few.deps, whenOrders("deposit", "act"), "u", NOW)).status, "skipped");
  const none = makeDeps({ days: null });
  assert.equal((await executeOrder(none.deps, whenOrders("notify", "ask"), "u", NOW)).status, "skipped");
});

it("сценарий по заказам: лимит суток и тестовый режим соблюдаются", async () => {
  const capped = makeDeps({ days: low, already: 2000 });
  assert.equal((await executeOrder(capped.deps, whenOrders("deposit", "act"), "u", NOW)).status, "skipped");
  assert.equal(capped.calls.deposits.length, 0);
  const test = makeDeps({ days: low, sandbox: true });
  assert.equal((await executeOrder(test.deps, whenOrders("deposit", "act"), "u", NOW)).status, "simulated");
  assert.equal(test.calls.deposits.length, 0);
});

it("неожиданный сбой WB превращается в запуск «ошибка», а не падает", async () => {
  const { deps } = makeDeps();
  (deps as unknown as { adsSnapshot: () => Promise<never> }).adsSnapshot = async () => {
    throw new Error("сеть пропала");
  };
  const o = await executeOrder(deps, deposit("act"), "u", NOW);
  assert.equal(o.status, "failed");
});
