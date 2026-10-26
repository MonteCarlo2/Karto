import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expectedFor, median, normalCdf, proportionShift, scaledMad, smartEvents, type ProductDay, type SmartInput, type StoreDay } from "./smart-events";

const day = (from: string, i: number) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
const series = (from: string, orders: number[]): StoreDay[] => orders.map((o, i) => ({ date: day(from, i), orders: o, opens: null, carts: null }));
const base = (over: Partial<SmartInput>): SmartInput => ({ now: "2026-10-21T12:00:00Z", todayKey: "2026-10-21", store: [], products: [], titleOf: (n) => `Товар ${n}`, outOfStock: new Set(), sensitivity: "normal", ...over });
/** 20 дней ровных продаж (около 10, чуть колеблются) с 1 по 20 октября. */
const steady = [10, 11, 9, 10, 10, 11, 9, 10, 10, 11, 9, 10, 10, 11, 9, 10, 10, 11, 9, 10];
const kinds = (list: ReturnType<typeof smartEvents>) => list.map((e) => e.kind).sort();

describe("статистика", () => {
  it("медиана и устойчивый разброс не боятся выбросов", () => {
    assert.equal(median([1, 2, 100]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.ok(scaledMad([10, 10, 11, 9, 10, 500]) < 3);
  });
  it("критерий долей и нормальное распределение", () => {
    const r = proportionShift(100, 1000, 200, 1000)!;
    assert.ok(r.z < -6);
    assert.equal(proportionShift(0, 0, 1, 1), null);
    assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 0.001);
    assert.ok(Math.abs(normalCdf(-1.96) - 0.025) < 0.001);
  });
  it("мало истории — ожидание не строится", () => {
    const m = new Map(series("2026-10-01", [5, 5, 5, 5, 5]).map((d) => [d.date, d.orders as number]));
    assert.equal(expectedFor(m, "2026-10-06"), null);
  });
});

describe("заказы за день подстраиваются под магазин", () => {
  it("ровный магазин: падение 10 → 2 — событие с ожиданием и разбросом", () => {
    const out = smartEvents(base({ store: series("2026-10-01", [...steady, 2]), todayKey: "2026-10-22", now: "2026-10-22T12:00:00Z" }));
    const drop = out.find((e) => e.kind === "day_orders_drop")!;
    assert.ok(drop);
    assert.equal(drop.id, "day_orders_drop:store:2026-10-21");
    assert.match(drop.detail, /Заказов за день: 2/);
    assert.match(drop.detail, /Ожидали около 10/);
  });

  it("при среднем 10 заказов 5 в день — ещё обычный случайный разброс (корень из 10 ≈ 3), событие только на высокой чувствительности", () => {
    const store = series("2026-10-01", [...steady, 5]);
    const has = (sensitivity: SmartInput["sensitivity"]) => smartEvents(base({ store, sensitivity, todayKey: "2026-10-22", now: "2026-10-22T12:00:00Z" })).some((e) => e.kind === "day_orders_drop");
    assert.deepEqual([has("low"), has("normal"), has("high")], [false, false, true]);
  });

  it("рваный магазин: те же 5 заказов не событие, потому что для него это обычный разброс", () => {
    const jagged = [4, 16, 8, 14, 3, 17, 9, 13, 5, 15, 8, 12, 4, 16, 9, 14, 6, 15, 7, 13];
    const out = smartEvents(base({ store: series("2026-10-01", [...jagged, 5]), todayKey: "2026-10-22", now: "2026-10-22T12:00:00Z" }));
    assert.equal(out.some((e) => e.kind === "day_orders_drop"), false);
  });

  it("чувствительность меняет порог: небольшое отклонение видит «высокая», но не «низкая»", () => {
    const store = series("2026-10-01", [...steady, 5]);
    const run = (sensitivity: SmartInput["sensitivity"]) => smartEvents(base({ store, sensitivity, todayKey: "2026-10-22", now: "2026-10-22T12:00:00Z" })).some((e) => e.kind === "day_orders_drop");
    assert.equal(run("high"), true);
    assert.equal(run("low"), false);
  });

  it("день недели учитывается: стабильно слабое воскресенье не тревожит", () => {
    // Понедельник 5 октября 2026: будни по 12, воскресенья по 4. Проверяем воскресенье 25 октября.
    const vals: number[] = [];
    for (let i = 0; i < 24; i += 1) vals.push(new Date(Date.parse("2026-10-01T00:00:00Z") + i * 86_400_000).getUTCDay() === 0 ? 4 : 12);
    const out = smartEvents(base({ store: series("2026-10-01", vals), todayKey: "2026-10-26", now: "2026-10-26T12:00:00Z" }));
    assert.equal(out.some((e) => e.kind === "day_orders_drop" && e.id.endsWith("2026-10-25")), false);
  });

  it("мало истории или сегодняшний неполный день — событий нет", () => {
    assert.deepEqual(smartEvents(base({ store: series("2026-10-10", [10, 10, 10, 10, 10, 1]), todayKey: "2026-10-16" })), []);
    const out = smartEvents(base({ store: series("2026-10-01", [...steady, 0]), todayKey: "2026-10-21" }));
    assert.equal(out.some((e) => e.id.endsWith("2026-10-21")), false);
  });
});

describe("тенденции", () => {
  it("несколько дней подряд ниже обычного — одно уведомление в начале и одно при возврате", () => {
    // 20 ровных дней, затем 3 дня по 7 (мягкое, но устойчивое снижение), затем возврат к 10.
    const down = smartEvents(base({ store: series("2026-10-01", [...steady, 7, 7, 7]), todayKey: "2026-10-24", now: "2026-10-24T12:00:00Z" }));
    const trend = down.find((e) => e.kind === "trend_orders_down")!;
    assert.ok(trend);
    assert.equal(trend.id, "trend_orders_down:store:down:2026-10-21");
    assert.match(trend.title, /3 дня подряд/);
    const back = smartEvents(base({ store: series("2026-10-01", [...steady, 7, 7, 7, 10, 10]), todayKey: "2026-10-26", now: "2026-10-26T12:00:00Z" }));
    assert.equal(back.some((e) => e.kind === "trend_recovered"), true);
  });

  it("один слабый день тенденцией не считается", () => {
    const out = smartEvents(base({ store: series("2026-10-01", [...steady, 7, 10, 10]), todayKey: "2026-10-24", now: "2026-10-24T12:00:00Z" }));
    assert.equal(out.some((e) => e.kind === "trend_orders_down"), false);
  });
});

describe("конверсии воронки", () => {
  const funnel = (cart: number[]): StoreDay[] => cart.map((c, i) => ({ date: day("2026-09-20", i), orders: 10, opens: 1000, carts: c }));
  it("устойчивое снижение конверсии в корзину — событие с сравнением долей", () => {
    // 21 день по 14% и затем 11 дней по 9% (всего 32 дня до 21 октября включительно... последний день 20 октября).
    const cart = [...Array(21).fill(140), ...Array(11).fill(90)];
    const out = smartEvents(base({ store: funnel(cart) }));
    const cartShift = out.filter((e) => e.kind === "funnel_shift").find((e) => /из просмотра в корзину снизилась/.test(e.title))!;
    assert.ok(cartShift);
    assert.match(cartShift.detail, /9% против 1[34]/);
  });

  it("колебание в пределах шума не событие; мало просмотров — не судим", () => {
    const noisy = [...Array(32).fill(0)].map((_, i) => 138 + (i % 3) * 2);
    assert.equal(smartEvents(base({ store: funnel(noisy) })).some((e) => e.kind === "funnel_shift"), false);
    const tiny = funnel([...Array(21).fill(140), ...Array(11).fill(90)]).map((d) => ({ ...d, opens: 20, carts: Math.round((d.carts ?? 0) / 50) }));
    assert.equal(smartEvents(base({ store: tiny })).some((e) => e.kind === "funnel_shift"), false);
  });
});

describe("товар замолчал", () => {
  const prod = (nm: string, orders: number[]): ProductDay[] => orders.map((o, i) => ({ date: day("2026-09-26", i), nmId: nm, orders: o }));
  // 26 сентября — 20 октября: 25 дней.
  it("обычно 2 заказа в день, 3 дня тишины — событие с вероятностью", () => {
    const out = smartEvents(base({ products: prod("1", [...Array(22).fill(2), 0, 0, 0]) }));
    const e = out.find((x) => x.kind === "product_silent")!;
    assert.ok(e);
    assert.equal(e.nmId, "1");
    assert.match(e.detail, /3 дня подряд без заказов/);
    assert.match(e.detail, /около 2 в день/);
  });

  it("редкий товар (0,3 заказа в день) тишиной не тревожит; товар без остатка — объяснено", () => {
    const rare = [...Array(22).fill(0)].map((_, i) => (i % 3 === 0 ? 1 : 0));
    assert.equal(smartEvents(base({ products: prod("2", [...rare, 0, 0, 0]) })).some((x) => x.kind === "product_silent"), false);
    assert.equal(smartEvents(base({ products: prod("3", [...Array(22).fill(2), 0, 0, 0]), outOfStock: new Set(["3"]) })).some((x) => x.kind === "product_silent"), false);
  });

  it("два дня тишины — ещё не событие, даже если при обычных двух заказах это маловероятно", () => {
    assert.equal(smartEvents(base({ products: prod("4", [...Array(23).fill(2), 0, 0]) })).some((x) => x.kind === "product_silent"), false);
    assert.equal(kinds(smartEvents(base({}))).length, 0);
  });
});
