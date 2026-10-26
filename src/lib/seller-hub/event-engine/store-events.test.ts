import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { baselineOfSignals, diffStoreSignals, type StoreSignals } from "./store-events";

const empty = (over: Partial<StoreSignals> = {}): StoreSignals => ({ capturedAt: "2026-10-21T10:00:00Z", ads: null, promos: null, orders: null, supplies: null, finance: null, penalties: null, negatives: null, scopes: null, ...over });
const run = (prev: StoreSignals | null, next: StoreSignals) => diffStoreSignals({ now: "2026-10-21T12:00:00Z", previous: prev ? baselineOfSignals(prev) : null, next, titleOf: (n) => ({ title: `Товар ${n}` }) });
const kinds = (list: ReturnType<typeof run>) => list.map((e) => e.kind);

describe("события по кабинету", () => {
  it("первый снимок только запоминает значения", () => {
    assert.deepEqual(run(null, empty({ ads: { "1": { name: "К", status: "Активна" } }, penalties: 500 })), []);
  });

  it("реклама: смена статуса и новая кампания; остановка важнее", () => {
    const prev = empty({ ads: { "1": { name: "Поиск", status: "Активна" } } });
    const out = run(prev, empty({ ads: { "1": { name: "Поиск", status: "На паузе" }, "2": { name: "Новая", status: "Активна" } } }));
    assert.deepEqual(kinds(out), ["ad_status_changed", "ad_campaign_added"]);
    assert.equal(out[0]!.severity, "important");
    assert.match(out[0]!.detail, /Активна → На паузе/);
  });

  it("реклама: бюджет закончился, пополнен, лимит и состав артикулов с названиями товаров", () => {
    const camp = (over: Record<string, unknown>) => ({ name: "Поиск", status: "Активна", budget: 500, dailyLimit: null, nms: { "1": [100, 100] as [number, number] }, ...over });
    const ended = run(empty({ ads: { a: camp({}) } }), empty({ ads: { a: camp({ budget: 0 }) } }));
    assert.deepEqual(kinds(ended), ["ad_budget_ended"]);
    assert.equal(ended[0]!.severity, "important");
    const topped = run(empty({ ads: { a: camp({ budget: 0 }) } }), empty({ ads: { a: camp({ budget: 1500 }) } }));
    assert.deepEqual(kinds(topped), ["ad_budget_topped_up"]);
    const limit = run(empty({ ads: { a: camp({}) } }), empty({ ads: { a: camp({ dailyLimit: 300 }) } }));
    assert.deepEqual(kinds(limit), ["ad_limit_changed"]);
    assert.match(limit[0]!.detail, /не было → 300/);
    const nms = run(empty({ ads: { a: camp({}) } }), empty({ ads: { a: camp({ nms: { "2": [100, 100] as [number, number] } }) } }));
    assert.deepEqual(kinds(nms).sort(), ["ad_product_added", "ad_product_removed"]);
    assert.equal(nms.find((e) => e.kind === "ad_product_removed")!.nmId, "1");
    assert.match(nms.find((e) => e.kind === "ad_product_added")!.detail, /Товар 2/);
  });

  it("реклама: ставку считаем изменённой от 0,5 ₽; пока данных по лимиту или артикулам нет, их не сравниваем", () => {
    const camp = (bid: number, extra: Record<string, unknown> = {}) => ({ name: "Поиск", status: "Активна", budget: 500, nms: { "1": [bid, bid] as [number, number] }, ...extra });
    const moved = run(empty({ ads: { a: camp(100) } }), empty({ ads: { a: camp(150) } }));
    assert.deepEqual(kinds(moved), ["ad_bid_changed"]);
    assert.equal(moved[0]!.nmId, "1");
    assert.deepEqual(run(empty({ ads: { a: camp(100) } }), empty({ ads: { a: camp(100.2) } })), []);
    // Старый снимок без бюджета, лимита и артикулов (до обновления): лишних событий нет.
    assert.deepEqual(run(empty({ ads: { a: { name: "Поиск", status: "Активна" } } }), empty({ ads: { a: camp(100) } })), []);
  });

  it("реклама: всплеск расхода по медиане предыдущих дней, обычные колебания молчат", () => {
    const day = (date: string, spend: number) => ({ date, spend, orders: 3 });
    const base = [day("2026-10-14", 300), day("2026-10-15", 320), day("2026-10-16", 310), day("2026-10-17", 290), day("2026-10-18", 305)];
    const spike = run(empty(), empty({ adsDaily: [...base, day("2026-10-19", 700)] }));
    assert.deepEqual(kinds(spike), ["ad_spend_spike"]);
    assert.match(spike[0]!.detail, /700/);
    assert.deepEqual(run(empty(), empty({ adsDaily: [...base, day("2026-10-19", 400)] })), []);
    assert.deepEqual(run(empty(), empty({ adsDaily: [day("2026-10-18", 100), day("2026-10-19", 900)] })), []);
  });

  it("карточки: блокировка и снятие, падение оценки, падение выкупа; без рекомендаций, только факты", () => {
    const blocked = run(empty({ blocked: { "1": "" } }), empty({ blocked: { "1": "", "2": "Запрещённый товар" } }));
    assert.deepEqual(kinds(blocked), ["card_blocked"]);
    assert.equal(blocked[0]!.severity, "critical");
    assert.match(blocked[0]!.detail, /Запрещённый товар/);
    assert.deepEqual(kinds(run(empty({ blocked: { "1": "" } }), empty({ blocked: {} }))), ["card_unblocked"]);

    const rating = run(empty({ ratings: { "1": [4.8, 30] } }), empty({ ratings: { "1": [4.6, 31] } }));
    assert.deepEqual(kinds(rating), ["rating_changed"]);
    assert.equal(rating[0]!.severity, "important");
    assert.match(rating[0]!.detail, /4,8 → 4,6/);
    assert.deepEqual(run(empty({ ratings: { "1": [4.8, 30] } }), empty({ ratings: { "1": [4.65, 31] } })), []);
    assert.deepEqual(run(empty({ ratings: { "1": [4.8, 6] } }), empty({ ratings: { "1": [4.2, 7] } })), []);

    const buyout = run(empty({ buyouts: { "1": [80, 100] } }), empty({ buyouts: { "1": [60, 100] } }));
    assert.deepEqual(kinds(buyout), ["buyout_changed"]);
    assert.equal(buyout[0]!.severity, "important");
    // Шум: на 22 заказах 8 пунктов не значимы.
    assert.deepEqual(run(empty({ buyouts: { "1": [80, 22] } }), empty({ buyouts: { "1": [72, 22] } })), []);
    // Данных у прошлого снимка не было: сравнивать нечего.
    assert.deepEqual(run(empty(), empty({ ratings: { "1": [4.0, 30] }, buyouts: { "1": [50, 100] }, blocked: { "1": "x" } })), []);
  });

  it("поздно пришедшие блокировки не стирают память: пустой снимок сохраняет прошлые значения", () => {
    const withBlocked = baselineOfSignals(empty({ blocked: { "1": "" } }));
    const afterEmpty = baselineOfSignals(empty({ blocked: null }), withBlocked);
    assert.deepEqual(afterEmpty.blocked, { "1": "" });
  });

  it("акции: новая акция, вход и выход товаров с названиями", () => {
    const promo = (participants: string[]) => ({ name: "Осень", startAt: "2026-10-25", endAt: "2026-10-30", participants });
    const out = run(empty({ promos: { a: promo(["1", "2"]) } }), empty({ promos: { a: promo(["2", "3"]), b: promo([]) } }));
    assert.deepEqual(kinds(out).sort(), ["promo_entered", "promo_left", "promo_new"]);
    assert.match(out.find((e) => e.kind === "promo_entered")!.detail, /Товар 3/);
    assert.equal(out.find((e) => e.kind === "promo_left")!.severity, "important");
  });

  it("заказы FBS: новые и отменённые считаются с прошлого снимка, повтор тех же заказов событий не даёт", () => {
    const prev = empty({ orders: { "1": { canceled: false, price: 100 }, "2": { canceled: false, price: 200 } } });
    const next = empty({ capturedAt: "2026-10-21T11:00:00Z", orders: { "1": { canceled: true, price: 100 }, "2": { canceled: false, price: 200 }, "3": { canceled: false, price: 300 }, "4": { canceled: false, price: 50 } } });
    const out = run(prev, next);
    assert.equal(out.find((e) => e.kind === "orders_new")!.title, "Новых заказов FBS: 2");
    assert.match(out.find((e) => e.kind === "orders_new")!.detail, /350/);
    assert.equal(out.find((e) => e.kind === "orders_canceled")!.title, "Отменено заказов FBS: 1");
    assert.deepEqual(run(next, { ...next, capturedAt: "2026-10-21T11:30:00Z" }), []);
  });

  it("после перерыва больше недели заказы не сравниваются: нет лавины «новых» заказов", () => {
    const prev = empty({ capturedAt: "2026-10-01T10:00:00Z", orders: { "1": { canceled: false, price: 1 } } });
    const out = run(prev, empty({ orders: { "9": { canceled: false, price: 1 }, "8": { canceled: false, price: 1 } } }));
    assert.equal(kinds(out).includes("orders_new"), false);
  });

  it("поставки, документы и вывод денег", () => {
    const prev = empty({ supplies: { s1: { name: "П1", done: false } }, finance: { forWithdraw: 1000, docs: { d1: "Отчёт" } } });
    const next = empty({ supplies: { s1: { name: "П1", done: true }, s2: { name: "П2", done: false } }, finance: { forWithdraw: 5200, docs: { d1: "Отчёт", d2: "Акт" } } });
    assert.deepEqual(kinds(run(prev, next)).sort(), ["finance_document", "finance_withdraw_up", "supply_closed", "supply_created"]);
    // Рост меньше порога не событие.
    assert.deepEqual(kinds(run(prev, empty({ supplies: prev.supplies, finance: { forWithdraw: 1500, docs: prev.finance!.docs } }))), []);
  });

  it("штрафы: событие только при росте от порога, формулировка про 28 дней", () => {
    assert.equal(run(empty({ penalties: 1000 }), empty({ penalties: 1050 })).length, 0);
    assert.equal(run(empty({ penalties: 1000 }), empty({ penalties: 900 })).length, 0);
    const out = run(empty({ penalties: 1000 }), empty({ penalties: 1500 }));
    assert.equal(out[0]!.kind, "penalties_up");
    assert.match(out[0]!.detail, /28 дней/);
  });

  it("негативные отзывы: только новые, тяжёлые (1–2★) важнее; известные не повторяются", () => {
    const old = { id: "a", nmId: "1", rating: 3, text: "старый" };
    const prev = empty({ negatives: [old] });
    const next = empty({ negatives: [old, { id: "b", nmId: "1", rating: 1, text: "сломалось" }, { id: "c", nmId: "2", rating: 3, text: "так себе" }] });
    const out = run(prev, next);
    assert.equal(out.length, 2);
    assert.equal(out.find((e) => e.id.endsWith(":b"))!.severity, "important");
    assert.equal(out.find((e) => e.id.endsWith(":c"))!.severity, "info");
    assert.equal(out[0]!.productTitle, "Товар 1");
  });

  it("доступы токена: потеря критична, возврат — к сведению", () => {
    const out = run(empty({ scopes: { advert: true, supplies: false } }), empty({ scopes: { advert: false, supplies: true } }));
    assert.equal(out.length, 2);
    assert.equal(out.find((e) => e.kind === "access_lost")!.severity, "critical");
    assert.match(out.find((e) => e.kind === "access_lost")!.title, /Реклама/);
    assert.equal(out.find((e) => e.kind === "access_restored")!.severity, "info");
    assert.match(out.find((e) => e.kind === "access_restored")!.title, /Поставки/);
  });

  it("если WB не отдал блок (null), событий по нему нет", () => {
    const prev = empty({ ads: { "1": { name: "К", status: "Активна" } }, penalties: 100 });
    assert.deepEqual(run(prev, empty()), []);
  });
});
