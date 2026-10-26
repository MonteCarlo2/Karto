import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAdAdvice, suggestedDepositRub, type AdvisorProduct } from "./ads-advisor";
import { adsByProduct } from "./ads-metrics";

const product = (patch: Partial<AdvisorProduct>): AdvisorProduct => ({
  nmId: "1",
  title: "Ведро",
  marginRub: 300,
  marginPercent: 20,
  stock: 50,
  orders28: 0,
  ...patch,
});

const nm = (spend: number, orders: number, orderSum: number, views = 1000) => ({
  views,
  clicks: 10,
  spend,
  orders,
  orderSum,
});

function advise(patch: Partial<Parameters<typeof buildAdAdvice>[0]>) {
  return buildAdAdvice({
    days: 7,
    campaigns: [],
    campaignStats: [],
    products: [],
    adsByProduct: [],
    ...patch,
  });
}

describe("buildAdAdvice", () => {
  it("реклама без заказов, потрачено больше маржи с 1 продажи — критично", () => {
    const result = advise({
      products: [product({})],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(400, 0, 0) } }]),
    });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.kind, "no_orders");
    assert.equal(result[0]!.level, "critical");
  });

  it("потрачено меньше маржи с 1 продажи — совета нет", () => {
    const result = advise({
      products: [product({})],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(200, 0, 0) } }]),
    });
    assert.equal(result.length, 0);
  });

  it("ДРР выше маржи — реклама съедает прибыль", () => {
    const result = advise({
      products: [product({ marginPercent: 10 })],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(300, 3, 1500) } }]),
    });
    assert.equal(result[0]!.kind, "margin_eaten");
  });

  it("бюджет закончился — критично, на 1 день — важно, достаточный — молчим", () => {
    const base = { campaignStats: [{ advertId: "9", spend: 700 }] };
    const status = { id: "9", status: 9, name: "Кампания" };
    assert.equal(advise({ ...base, campaigns: [{ ...status, budget: 0 }] })[0]!.level, "critical");
    assert.equal(advise({ ...base, campaigns: [{ ...status, budget: 100 }] })[0]!.level, "important");
    assert.equal(advise({ ...base, campaigns: [{ ...status, budget: 5000 }] }).length, 0);
  });

  it("кандидат: нет заказов за 28 дней, есть остаток и положительная маржа; бюджет из маржи", () => {
    const result = advise({ products: [product({ marginRub: 200 })] });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.kind, "candidate");
    assert.match(result[0]!.action, /1\s000\s₽/);
  });

  it("маржа неизвестна: мерка — средняя цена заказа по рекламе магазина", () => {
    const rows = adsByProduct([{ byNm: { "1": nm(300, 0, 0) } }]);
    const asked = advise({ products: [product({ marginRub: null, marginPercent: null })], adsByProduct: rows, storeCpo: 116 });
    assert.equal(asked[0]!.kind, "no_orders");
    assert.equal(asked[0]!.level, "important");
    const cheap = advise({ products: [product({ marginRub: null, marginPercent: null })], adsByProduct: rows, storeCpo: 500 });
    assert.equal(cheap.length, 0);
  });

  it("реклама товара с отрицательной маржой — отдельный совет", () => {
    const result = advise({
      products: [product({ marginRub: -80, marginPercent: -5 })],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(100, 2, 2000) } }]),
    });
    assert.equal(result[0]!.id, "negative-1");
  });

  it("не рекламируем товар без остатка, с отрицательной маржой или уже с заказами", () => {
    const result = advise({
      products: [
        product({ nmId: "a", stock: 0 }),
        product({ nmId: "b", marginRub: -50 }),
        product({ nmId: "c", orders28: 4 }),
        product({ nmId: "d", marginRub: null }),
      ],
    });
    assert.equal(result.length, 0);
  });
});

describe("действия в одну кнопку", () => {
  const status = { id: "9", status: 9, name: "Кампания", paymentType: "cpm" };

  it("пополнение: сумма — расход за неделю по текущему темпу, вверх до 100 ₽, не меньше 500 ₽", () => {
    assert.equal(suggestedDepositRub(0), 500);
    assert.equal(suggestedDepositRub(100), 700);
    assert.equal(suggestedDepositRub(163), 1200);
    assert.equal(suggestedDepositRub(999_999), 100_000);
  });

  it("закончился бюджет — совет с кнопкой «пополнить»", () => {
    const [item] = advise({
      campaigns: [{ ...status, budget: 0 }],
      campaignStats: [{ advertId: "9", spend: 700 }],
    });
    assert.deepEqual(item!.fix, { type: "deposit", campaignId: "9", campaignName: "Кампания", sumRub: 700 });
  });

  it("реклама без заказов в кампании с одним товаром — кнопка «пауза»", () => {
    const [item] = advise({
      campaigns: [{ ...status, bids: [{ nmId: "1", searchRub: 300, recommendationsRub: null }] }],
      products: [product({})],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(400, 0, 0) } }]),
    });
    assert.deepEqual(item!.fix, { type: "pause", campaignId: "9", campaignName: "Кампания" });
  });

  it("в кампании несколько товаров — предлагаем убрать только этот товар, а не ставить паузу всем", () => {
    const [item] = advise({
      campaigns: [
        {
          ...status,
          bids: [
            { nmId: "1", searchRub: 300, recommendationsRub: null },
            { nmId: "2", searchRub: 300, recommendationsRub: null },
          ],
        },
      ],
      products: [product({})],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(400, 0, 0) } }]),
    });
    assert.deepEqual(item!.fix, { type: "remove_nm", campaignId: "9", campaignName: "Кампания", nmId: "1" });
  });

  it("товар в нескольких кампаниях — кнопки нет, только совет", () => {
    const twice = advise({
      campaigns: [
        { ...status, bids: [{ nmId: "1", searchRub: 300, recommendationsRub: null }] },
        { ...status, id: "10", bids: [{ nmId: "1", searchRub: 300, recommendationsRub: null }] },
      ],
      products: [product({})],
      adsByProduct: adsByProduct([{ byNm: { "1": nm(400, 0, 0) } }]),
    });
    assert.equal(twice[0]!.fix, undefined);
  });
});
