import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffSellerEvents, emptyEventsState, hashText, type ProductReading } from "./compare";
import type { SellerEventsState } from "./types";

const reading = (over: Partial<ProductReading> = {}): ProductReading => ({
  nmId: "1", itemId: "i1", title: "Ведро 10л", vendorCode: "V1", price: 100, discount: 0, promoPrice: 100, stock: 5, salesQty: 1, priorSalesQty: 1,
  contentScore: 80, photoCount: 5, coverDays: 30, descriptionHash: hashText("описание"), descriptionLength: 8, characteristicsCount: 10, hasVideo: false, ...over,
});
const store = { syncAt: "2026-10-21T10:00:00Z", unansweredFeedbacks: 0, unansweredQuestions: 0 };

/** Первый снимок запоминает значения, второй сравнивается с ним. */
function second(first: ProductReading, next: ProductReading) {
  const a = diffSellerEvents({ now: "2026-10-20T10:00:00Z", previous: emptyEventsState(), products: [first], store });
  const captured: SellerEventsState = { ...a, store: { ...a.store, captured: true } };
  return diffSellerEvents({ now: "2026-10-21T10:00:00Z", previous: captured, products: [next], store: { ...store, syncAt: "2026-10-21T10:05:00Z" } }).events;
}

describe("настоящие изменения карточки", () => {
  it("название, описание, характеристики и видео дают отдельные события «было → стало»", () => {
    const ev = second(reading(), reading({ title: "Ведро 12л", descriptionHash: hashText("новое описание"), descriptionLength: 14, characteristicsCount: 12, hasVideo: true }));
    const kinds = ev.map((e) => e.kind).sort();
    assert.deepEqual(kinds, ["card_characteristics_changed", "card_description_changed", "card_title_changed", "card_video_changed"]);
    assert.match(ev.find((e) => e.kind === "card_title_changed")!.detail, /Было: Ведро 10л\nСтало: Ведро 12л/);
    assert.equal(ev.find((e) => e.kind === "card_description_changed")!.detail, "Было 8 симв., стало 14");
    assert.equal(ev.find((e) => e.kind === "card_characteristics_changed")!.detail, "Было 10, стало 12");
    assert.equal(ev.find((e) => e.kind === "card_video_changed")!.title, "В карточку добавлено видео");
  });

  it("пересчёт нашей оценки карточки событием не является: при тех же полях карточки событий нет", () => {
    const ev = second(reading({ contentScore: 82 }), reading({ contentScore: 86 }));
    assert.deepEqual(ev, []);
  });

  it("если раньше поле не читалось (null), сравнения нет: первое чтение только запоминается", () => {
    const ev = second(reading({ descriptionHash: null, descriptionLength: null, characteristicsCount: null, hasVideo: null }), reading({ title: "Ведро 10л" }));
    assert.deepEqual(ev, []);
  });

  it("отпечаток стабилен и различает тексты", () => {
    assert.equal(hashText("abc"), hashText("abc"));
    assert.notEqual(hashText("abc"), hashText("abd"));
  });
});
