import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffSellerEvents, emptyEventsState, hashText, type ProductReading } from "./compare";
import { promoReminders, promoShortName, type StoreSignals } from "./store-events";
import { newsToEvents } from "../news/analysis";
import type { SellerEventsState } from "./types";

// Реальные акции из календаря WB (даты в UTC, как их отдаёт WB: 21:00Z = 00:00 по Москве).
const promos: NonNullable<StoreSignals["promos"]> = {
  "3012": { name: "Осенние скидки (автоматические скидки)", startAt: "2026-10-07T21:00:00Z", endAt: "2026-10-30T20:59:59Z", participants: null, inPromo: 18, notInPromo: 26 },
  "3034": { name: "Большая распродажа: финал (автоматические скидки)", startAt: "2026-10-16T21:00:00Z", endAt: "2026-10-21T20:59:59Z", participants: null, inPromo: 7, notInPromo: 36 },
  "3038": { name: "11.11 (автоматические скидки)", startAt: "2026-10-21T21:00:00Z", endAt: "2026-11-15T20:59:59Z", participants: null, inPromo: 2, notInPromo: 42 },
  "3053": { name: "Осенние скидки (автоматические скидки)", startAt: "2026-10-26T21:00:00Z", endAt: "2026-11-20T20:59:59Z", participants: null, inPromo: 4, notInPromo: 40 },
};
const NOW = "2026-10-21T12:00:00Z";

describe("напоминания по календарю акций WB", () => {
  it("21 октября: «11.11» стартует завтра (22-го по Москве), финал распродажи заканчивается сегодня; далёкие акции молчат", () => {
    const out = promoReminders(promos, "2026-10-21", NOW);
    const titles = out.map((e) => e.title).sort();
    assert.deepEqual(titles, ["Акция «11.11» стартует завтра", "Акция «Большая распродажа: финал» заканчивается сегодня"]);
    const start = out.find((e) => e.title.includes("11.11"))!;
    assert.match(start.detail, /С 22 октября по 15 ноября/);
    assert.match(start.detail, /Участвуют 2 из 44 ваших товаров/);
    assert.equal(start.id, "promo_deadline:store:cal-3038:start");
    assert.equal(start.group, "price");
    assert.equal(start.severity, "important");
  });

  it("напоминания идут по порогам и не дублируются: идентификатор один и тот же в разные дни", () => {
    // «Осенние скидки» (3053) стартуют 27 октября по Москве.
    const a = promoReminders(promos, "2026-10-24", "2026-10-24T12:00:00Z").find((e) => e.id.includes("3053:start"));
    assert.equal(a!.title, "Акция «Осенние скидки» стартует через 3 дня");
    const b = promoReminders(promos, "2026-10-25", "2026-10-25T12:00:00Z").find((e) => e.id.includes("3053:start"));
    assert.equal(a!.id, b!.id);
    assert.equal(promoReminders(promos, "2026-10-23", "2026-10-23T12:00:00Z").some((e) => e.id.includes("3053:start")), false); // до старта 4 дня
    // «Осенние скидки» (3012) заканчиваются 30 октября по Москве.
    assert.equal(promoReminders(promos, "2026-10-29", "2026-10-29T12:00:00Z").find((e) => e.id.includes("3012:end"))!.title, "Акция «Осенние скидки» заканчивается завтра");
    assert.deepEqual(promoReminders(null, "2026-10-21", NOW), []);
  });

  it("акция, которая ещё не началась, об окончании не напоминает; без данных об участии числа не выдумываются", () => {
    const short = { x: { name: "Короткая", startAt: "2026-10-23T21:00:00Z", endAt: "2026-10-24T20:59:59Z", participants: null } };
    const out = promoReminders(short, "2026-10-23", "2026-10-23T12:00:00Z");
    assert.equal(out.some((e) => e.id.endsWith(":end")), false);
    assert.equal(out[0]!.detail.includes("Участвуют"), false);
    assert.equal(promoShortName("11.11 (автоматические скидки)"), "11.11");
  });

  it("новость о той же акции не дублирует напоминание: названия акций календаря отключают напоминания из новостей", () => {
    const item = { id: 7, header: "Автоакция «11.11»: повысьте продажи с 22 октября по 15 ноября", text: "", date: "2026-10-14T13:00:00.000Z", types: ["Персональная новость", "Акции"], tags: [] };
    const base = { categories: [], brands: [], worksFbs: false, worksFbw: false, warehouseNames: [] };
    const without = newsToEvents([item], base, "2026-10-21", NOW).filter((e) => e.kind === "promo_deadline");
    const withCal = newsToEvents([item], { ...base, promoNames: ["11.11"] }, "2026-10-21", NOW).filter((e) => e.kind === "promo_deadline");
    assert.equal(without.length, 1);
    assert.equal(withCal.length, 0);
  });
});

const reading = (over: Partial<ProductReading> = {}): ProductReading => ({
  nmId: "1", itemId: "i1", title: "Ведро 10л", vendorCode: "V1", price: 100, discount: 0, promoPrice: 100, stock: 20, salesQty: 1, priorSalesQty: 1,
  contentScore: 80, photoCount: 5, coverDays: 20, descriptionHash: hashText("описание"), descriptionLength: 8, characteristicsCount: 10, hasVideo: false, ...over,
});
const store = { syncAt: "2026-10-21T10:00:00Z", unansweredFeedbacks: 0, unansweredQuestions: 0 };
function second(first: ProductReading, next: ProductReading) {
  const a = diffSellerEvents({ now: "2026-10-20T10:00:00Z", previous: emptyEventsState(), products: [first], store });
  const captured: SellerEventsState = { ...a, store: { ...a.store, captured: true } };
  return diffSellerEvents({ now: "2026-10-21T12:00:00Z", previous: captured, products: [next], store: { ...store, syncAt: "2026-10-21T12:05:00Z" } }).events;
}

describe("прогноз: товар закончится", () => {
  it("запас стал короче порога: прогноз с датой и оговоркой, а не просто «мало запаса»", () => {
    const [e] = second(reading({ coverDays: 12, stock: 24 }), reading({ coverDays: 5, stock: 10 })).filter((x) => x.kind === "forecast_stockout");
    assert.ok(e);
    assert.equal(e.title, "Прогноз: товар закончится около 26 октября");
    assert.match(e.detail, /Остаток 10 шт\., хватит примерно на 5 дн\./);
    assert.match(e.detail, /если спрос вырастет, товар закончится раньше/);
    assert.equal(e.severity, "important");
    assert.equal(e.group, "stock");
  });

  it("порог не пересечён, товар уже закончился или запас остаётся длинным — прогноза нет; повтор в том же состоянии не создаётся", () => {
    assert.equal(second(reading({ coverDays: 20 }), reading({ coverDays: 15 })).some((x) => x.kind === "forecast_stockout"), false);
    assert.equal(second(reading({ coverDays: 5 }), reading({ coverDays: 3 })).some((x) => x.kind === "forecast_stockout"), false);
    const out = second(reading({ coverDays: 12, stock: 24 }), reading({ coverDays: 0, stock: 0 }));
    assert.equal(out.some((x) => x.kind === "forecast_stockout"), false);
    assert.equal(out.some((x) => x.kind === "stock_out"), true);
  });
});
