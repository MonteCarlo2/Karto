import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findStalePrices, stalePriceMessage } from "./price-write";

const read = (rows: Array<[number, number | null, number | null]>) =>
  new Map(rows.map(([nmId, price, discountPercent]) => [nmId, { price, discountPercent }]));

describe("сверка цены перед записью", () => {
  it("цена в WB такая же, как на экране: запись можно отправлять", () => {
    const stale = findStalePrices([{ nmId: 1, expected: { price: 1500, discount: 30 } }], read([[1, 1500, 30]]));
    assert.deepEqual(stale, []);
  });

  it("цену поменяли в WB минуты назад: запись блокируется, видно обе цены", () => {
    const stale = findStalePrices([{ nmId: 1, expected: { price: 1500, discount: 30 } }], read([[1, 1700, 30]]));
    assert.equal(stale.length, 1);
    assert.deepEqual(stale[0]!.current, { price: 1700, discount: 30 });
    const text = stalePriceMessage(stale);
    assert.match(text, /Мы ничего не записали/);
    assert.match(text, /1\s?500/);
    assert.match(text, /1\s?700/);
  });

  it("скидку поменяли в WB: тоже блокируется; у WB нет скидки — это 0", () => {
    assert.equal(findStalePrices([{ nmId: 1, expected: { price: 1500, discount: 30 } }], read([[1, 1500, 25]])).length, 1);
    assert.equal(findStalePrices([{ nmId: 1, expected: { price: 1500, discount: 0 } }], read([[1, 1500, null]])).length, 0);
  });

  it("округление не считается изменением", () => {
    assert.deepEqual(findStalePrices([{ nmId: 1, expected: { price: 1500.2, discount: 29.6 } }], read([[1, 1499.8, 30.2]])), []);
  });

  it("пропускает: нет ожидания, WB не вернул товар, ожидаемое значение неизвестно", () => {
    assert.deepEqual(findStalePrices([{ nmId: 1 }], read([[1, 999, 10]])), []);
    assert.deepEqual(findStalePrices([{ nmId: 2, expected: { price: 1500, discount: 30 } }], read([[1, 999, 10]])), []);
    assert.deepEqual(findStalePrices([{ nmId: 1, expected: { price: null, discount: null } }], read([[1, 999, 10]])), []);
  });

  it("из нескольких товаров блокирует только изменившиеся и сообщает их число", () => {
    const stale = findStalePrices(
      [
        { nmId: 1, expected: { price: 100, discount: 0 } },
        { nmId: 2, expected: { price: 200, discount: 0 } },
        { nmId: 3, expected: { price: 300, discount: 0 } },
        { nmId: 4, expected: { price: 400, discount: 0 } },
        { nmId: 5, expected: { price: 500, discount: 0 } },
      ],
      read([[1, 101, 0], [2, 200, 0], [3, 301, 0], [4, 401, 0], [5, 501, 0]]),
    );
    assert.equal(stale.length, 4);
    assert.match(stalePriceMessage(stale), /и ещё 1/);
  });
});
