import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import type { SellerProductEvent } from "@/lib/seller-hub/event-engine/types";
import { detectFactIntent, factText, findProducts, kbFact, productQueryTokens } from "./assistant-facts";
import type { RenderCtx } from "./assistant-render";

const NOW = Date.parse("2026-11-20T12:00:00Z"); // 15:00 по Москве
const items = [
  { externalId: "1", vendorCode: "V10-3", title: "Строительное ведро 10л, 3шт", price: 1500, discountedPrice: 1415, discountPercent: 2, stockFbo: 89, stockFbs: 0 },
  { externalId: "2", vendorCode: "V10-5", title: "Строительное ведро 10л, 5шт", price: 2200, discountedPrice: 2000, stockFbo: 40 },
  { externalId: "3", vendorCode: "V5-3", title: "Строительное ведро 5л, 3шт", price: 900, discountedPrice: 900, stockFbo: 7 },
  { externalId: "4", vendorCode: "K16", title: "Основа для кашпо 16л, 5шт", price: 700, discountedPrice: 650, stockFbo: 3 },
];
const snapshot = {
  syncedAt: new Date(NOW - 10 * 60_000).toISOString(),
  items,
  analytics: { periodStart: "", periodEnd: "", ordersTotal: 7, revenueTotal: 13000, buyoutsTotal: 0, avgOrderValue: 1857, daily: [{ date: "2026-11-19", orders: 4, revenue: 8142 }, { date: "2026-11-20", orders: 3, revenue: 4857 }], currency: "RUB" },
  orders: { newCount: 2, inAssembly: 0, inDelivery: 1, delivered: 0, canceled: 0 },
} as unknown as SellerCatalogSnapshot;
const ev = (id: string, over: Partial<SellerProductEvent>): SellerProductEvent => ({ id, createdAt: new Date(NOW - 3_600_000).toISOString(), kind: "stock_out", group: "stock", severity: "important", title: `Событие ${id}`, detail: "", productTitle: null, vendorCode: null, nmId: null, itemId: null, ...over });
const ctx = (events: SellerProductEvent[] = []): RenderCtx => ({ snapshot, events, tasks: [], nowMs: NOW, url: "https://karto.pro/studio/seller-hub" });

describe("понимание вопросов про цифры", () => {
  it("заказы, акции, воронка, оборот, реклама, остатки, цена, новости, планы", () => {
    assert.equal(detectFactIntent("Сколько у меня заказов сегодня?"), "today");
    assert.equal(detectFactIntent("дай мне краткую сводку сегодняшнего дня"), "today");
    assert.equal(detectFactIntent("заказы за вчера"), "yesterday");
    assert.equal(detectFactIntent("когда будут ближайшие акции"), "promos");
    assert.equal(detectFactIntent("какая у меня воронка"), "funnel");
    assert.equal(detectFactIntent("кто у меня основные дает обороты"), "top");
    assert.equal(detectFactIntent("как там моя реклама"), "ads");
    assert.equal(detectFactIntent("что заканчивается на складе"), "stock");
    assert.equal(detectFactIntent("какая цена на строительное ведро 10 литров 3 штуки"), "product");
    assert.equal(detectFactIntent("дай новости сегодняшнего дня"), "news_today");
    assert.equal(detectFactIntent("расскажи что Wildberries изменил вчера"), "wb_yesterday");
    assert.equal(detectFactIntent("какие новости за неделю"), "news_week");
    assert.equal(detectFactIntent("события за вчера"), "news_yesterday");
    assert.equal(detectFactIntent("какие события за последний день"), "news_today");
    assert.equal(detectFactIntent("когда закончится мой план"), "plans");
    assert.equal(detectFactIntent("составь план по ведрам"), null);
  });

  it("длинные рассуждения и советы идут агенту", () => {
    assert.equal(detectFactIntent("почему у меня упали заказы на этой неделе и что мне с этим делать вообще"), null);
    assert.equal(detectFactIntent("расскажи как лучше настроить рекламу для нового товара в моей категории пожалуйста"), null);
    assert.equal(detectFactIntent("анекдот"), null);
  });
});

describe("поиск товара по названию", () => {
  it("«строительное ведро 10 литров 3 штуки» находит ровно нужный", () => {
    assert.deepEqual(productQueryTokens("какая цена на строительное ведро 10 литров 3 штуки"), ["строительное", "ведро", "10л", "3"]);
    assert.deepEqual(findProducts(snapshot, "цена на строительное ведро 10 литров 3 штуки").map((r) => r.nmId), ["1"]);
    assert.deepEqual(findProducts(snapshot, "сколько стоит основа для кашпо 16 литров").map((r) => r.nmId), ["4"]);
    assert.deepEqual(findProducts(snapshot, "цена на самокат"), []);
  });

  it("несколько подходящих показываются списком; нет товара: просьба уточнить", () => {
    const many = factText("product", "цена на строительное ведро 10 литров", ctx()).join("\n");
    assert.match(many, /Нашёл несколько/);
    assert.match(many, /3шт/);
    assert.match(many, /5шт/);
    assert.match(factText("product", "цена на самокат", ctx()).join(""), /Не нашёл такой товар/);
    const one = factText("product", "цена на строительное ведро 10 литров 3 штуки", ctx()).join("\n");
    assert.match(one, /Цена — <b>1\s415\s₽<\/b> \(скидка 2\s%\)/);
    assert.match(one, /Остаток — <b>89\sшт<\/b>/);
  });
});

describe("ответы по цифрам", () => {
  it("заказы сегодня и вчера: настоящие числа, сравнение, оговорка про незаконченный день", () => {
    const today = factText("today", "", ctx()).join("\n");
    assert.match(today, /Заказов — <b>3<\/b>/);
    assert.match(today, /На сумму — <b>4\s857\s₽<\/b>/);
    assert.match(today, /Вчера: 4 шт, 8 142 ₽/);
    assert.match(today, /день ещё не закончился/);
    assert.match(today, /Новых заказов на сборку: <b>2<\/b>/);
    const yesterday = factText("yesterday", "", ctx()).join("\n");
    assert.match(yesterday, /Заказов — <b>4<\/b>/);
    assert.match(yesterday, /Средний чек — <b>2.036/);
    assert.doesNotMatch(yesterday, /ещё не закончился/);
  });

  it("нет данных кабинета: понятная фраза, а не ошибка", () => {
    assert.match(factText("today", "", { ...ctx(), snapshot: null }).join(""), /ещё не загружены/);
  });

  it("новости: сегодня, вчера, и только от Wildberries", () => {
    const events = [ev("a", {}), ev("b", { createdAt: new Date(NOW - 30 * 3_600_000).toISOString(), kind: "news_item", group: "news", title: "Новая комиссия <WB>" }), ev("c", { createdAt: new Date(NOW - 30 * 3_600_000).toISOString(), kind: "tariff_logistics_changed", group: "money", title: "Логистика подорожала" })];
    const today = factText("news_today", "", ctx(events)).join("\n");
    assert.match(today, /Событие a/);
    assert.doesNotMatch(today, /комиссия/);
    const wbYesterday = factText("wb_yesterday", "", ctx(events)).join("\n");
    assert.match(wbYesterday, /Что изменил Wildberries вчера/);
    assert.match(wbYesterday, /Новая комиссия &lt;WB&gt;/);
    assert.match(wbYesterday, /Логистика подорожала/);
    assert.doesNotMatch(wbYesterday, /Событие a/);
    assert.match(factText("wb_today", "", ctx(events)).join(""), /От Wildberries новостей и изменений нет/);
  });
});

describe("база знаний как запасной ответ", () => {
  it("находит раздел про комиссии и отвечает его текстом", () => {
    const kb = kbFact("какая комиссия у Wildberries");
    assert.ok(kb && kb.length > 0);
    assert.match(kb!.join("\n"), /Из базы знаний KARTO/);
    assert.equal(kbFact("анекдот про кота"), null);
  });
});

describe("новые заказы FBS", () => {
  const orders = (extra: Array<Record<string, unknown>>) => ({ items: [{ externalId: "11", title: "Ведро 10 л" }], orders: { newCount: extra.filter((o) => o.supplierStatus === "new").length, orders: extra } }) as unknown as SellerCatalogSnapshot;

  it("понимает «покажи новые FBS-заказы», но не вопрос «как отгрузить»", () => {
    for (const q of ["покажи новые ФБС-заказы", "сколько новых заказов fbs", "какие заказы ждут сборки", "новые заказы"]) assert.equal(detectFactIntent(q), "fbs_new", q);
    for (const q of ["как отгрузить заказ fbs", "что нажать чтобы отгрузить заказ", "сколько заказов сегодня"]) assert.notEqual(detectFactIntent(q), "fbs_new", q);
  });

  it("показывает только новые: число и список без лишних статусов", async () => {
    const { fbsNewText } = await import("./assistant-facts");
    const now = Date.parse("2026-11-23T10:00:00Z");
    const snap = orders([
      { externalId: 1, nmId: 11, price: 1200, createdAt: "2026-11-23T09:00:00Z", supplierStatus: "new", wbStatus: "waiting" },
      { externalId: 2, nmId: 11, price: 900, createdAt: "2026-11-23T08:00:00Z", supplierStatus: "new", wbStatus: "waiting" },
      { externalId: 3, nmId: 11, price: 900, createdAt: "2026-11-22T08:00:00Z", supplierStatus: "complete", wbStatus: "sorted" },
      { externalId: 4, nmId: 11, price: 900, createdAt: "2026-11-22T07:00:00Z", supplierStatus: "cancel", wbStatus: "canceled" },
    ]);
    const text = fbsNewText(snap, now, "https://karto.pro").join("\n");
    assert.match(text, /Новые заказы FBS: 2/);
    assert.match(text, /Ведро 10 л/);
    assert.match(text, /1\s200\s₽ · 1 ч назад/);
    assert.ok(!/в доставке|отменён|отменен/i.test(text));
    const none = fbsNewText({ ...snap, orders: { newCount: 0, orders: [] } } as unknown as SellerCatalogSnapshot, now, "u").join("");
    assert.match(none, /Новых заказов нет/);
  });
});

describe("объяснения не подменяются выдачей цифр", () => {
  it("«что такое ДРР» и «как снизить ДРР» идут к агенту, «как идёт реклама» к цифрам", () => {
    for (const q of ["что такое ДРР и как его снижать?", "как снизить ДРР", "почему упала реклама", "объясни воронку", "как считается выкуп"]) assert.equal(detectFactIntent(q), null, q);
    assert.equal(detectFactIntent("как идёт реклама"), "ads");
    assert.equal(detectFactIntent("какая воронка"), "funnel");
  });
});
