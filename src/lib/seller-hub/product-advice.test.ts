import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForProductOption, optionApplies, parseProductAdvice, type ProductFacts } from "./product-advice";

const f = (patch: Partial<ProductFacts> = {}): ProductFacts => ({
  nmId: "1",
  title: "Ведро",
  verdict: "leaky",
  pillars: { traffic: "", conversion: "", buyout: "", content: "", rating: "" },
  priceRub: 1000,
  basePriceRub: 1250,
  discountPercent: 20,
  breakEvenRub: 700,
  marginPercent: 25,
  stock: 50,
  coverDays: 30,
  orders28: 5,
  ads: null,
  photo: { score: 85, band: "strong" },
  text: { score: 60, band: "average" },
  promotions: { available: 1, joined: 0 },
  ...patch,
});

describe("применимость вариантов", () => {
  it("реклама: нужна маржа, остаток и отсутствие рекламы", () => {
    assert.equal(optionApplies("start_ads", f()), true);
    assert.equal(optionApplies("start_ads", f({ marginPercent: -3 })), false);
    assert.equal(optionApplies("start_ads", f({ stock: 0 })), false);
    assert.equal(optionApplies("start_ads", f({ ads: { advertised: true, spend: 10, orders: 0, drr: null } })), false);
  });
  it("себестоимость: вариант применим, только если маржа неизвестна", () => {
    assert.equal(optionApplies("enter_cost", f({ marginPercent: null })), true);
    assert.equal(optionApplies("enter_cost", f()), false);
  });
  it("акция, фото, текст и запас", () => {
    assert.equal(optionApplies("join_promo", f({ promotions: { available: 0, joined: 1 } })), false);
    assert.equal(optionApplies("improve_photo", f()), false); // фото сильные
    assert.equal(optionApplies("improve_text", f()), true);
    assert.equal(optionApplies("restock", f({ coverDays: 5 })), true);
    assert.equal(optionApplies("restock", f()), false);
  });
});

describe("цена и действия", () => {
  it("снижение на 5%, но не ниже безубыточной цены с подушкой; скидка продавца сохраняется", () => {
    const a = actionForProductOption("lower_price", f());
    assert.deepEqual(a, { type: "price", nmId: "1", targetRub: 950.4, baseRub: 1188, discount: 20, currentRub: 1000, currentBaseRub: 1250 });
    const near = actionForProductOption("lower_price", f({ priceRub: 760, basePriceRub: 950, breakEvenRub: 720 }));
    assert.equal(near?.type === "price" ? near.targetRub : null, 756); // пол: 720 × 1,05
    assert.equal(actionForProductOption("lower_price", f({ priceRub: 735, basePriceRub: 918.75, breakEvenRub: 700 })), null); // пол 735: ниже нельзя
    assert.equal(actionForProductOption("lower_price", f({ breakEvenRub: null })), null);
  });
  it("тестовая реклама превращается в создание кампании", () => {
    assert.deepEqual(actionForProductOption("start_ads", f()), { type: "create_campaign", nmId: "1", name: "KARTO тест: Ведро" });
  });
});

describe("parseProductAdvice", () => {
  it("отбрасывает неприменимые и неизвестные варианты, не больше трёх; товар без ответа получает «нет плана»", () => {
    const text = JSON.stringify({ advice: [{ nmId: "1", headline: "h", summary: "s", options: [
      { kind: "improve_photo", reason: "фото сильные" },
      { kind: "join_promo", reason: "r" },
      { kind: "magic", reason: "?" },
      { kind: "start_ads", reason: "r" },
      { kind: "lower_price", reason: "r" },
      { kind: "keep", reason: "четвёртый" },
    ] }] });
    const out = parseProductAdvice(text, [f(), f({ nmId: "2" })])!;
    assert.deepEqual(out[0]!.options.map((o) => o.kind), ["join_promo", "start_ads", "lower_price"]);
    assert.equal(out[1]!.headline, "Нет плана");
    assert.equal(parseProductAdvice("не json", [f()]), null);
  });
});
