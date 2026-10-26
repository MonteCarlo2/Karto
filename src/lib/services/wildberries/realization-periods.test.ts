import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPeriodWindows } from "./realization-margin";

const sale = (rrDate: string, nmId: number, o: Record<string, unknown> = {}) => ({
  rrDate,
  nmId,
  sellerOperName: "Продажа",
  quantity: 1,
  retailPriceWithDisc: 1000,
  retailAmount: 1000,
  forPay: 700,
  deliveryService: 0,
  ...o,
});

describe("окна экономики по периодам для аналитики", () => {
  const DATE_TO = "2026-10-19";
  const rows = [
    sale("2026-10-19", 1), // последний день: во всех окнах «текущее»
    sale("2026-10-13", 1), // 7-дневное окно: 13..19 → да
    sale("2026-10-12", 1), // за пределами 7 дн., в «до» для 7 дн. (6..12), в 14 дн. текущее
    sale("2026-10-05", 1), // 14 дн.: 6..19 → нет, «до» для 14 (сент. 22..окт. 5) → да
    sale("2026-07-25", 1), // дальше 90 дней от dateTo? 2026-07-22 — начало 90-дневного окна; 25 июля внутри 90, для 60 дн. нет
    sale("2026-10-19", 2, { sellerOperName: "Возврат", quantity: 1, retailAmount: 500, retailPriceWithDisc: 500, forPay: 350 }),
    sale("2026-10-19", 0, { deliveryService: 300, quantity: 0, retailAmount: 0, retailPriceWithDisc: 0, forPay: 0, sellerOperName: "Логистика" }),
  ];
  const p = buildPeriodWindows(rows, DATE_TO);

  it("текущее и предыдущее окна считаются по датам; 7 и 14 дней имеют предыдущее окно, 60 и 90 нет", () => {
    assert.equal(p["7"]!.byNm["1"]!.current.N, 2);
    assert.equal(p["7"]!.byNm["1"]!.prior!.N, 1);
    assert.equal(p["14"]!.byNm["1"]!.current.N, 3);
    assert.equal(p["14"]!.byNm["1"]!.prior!.N, 1);
    assert.equal(p["28"]!.priorFrom, "2026-08-25");
    assert.equal(p["60"]!.priorFrom, null);
    assert.equal(p["60"]!.byNm["1"]!.prior, null);
    assert.equal(p["90"]!.byNm["1"]!.current.N, 5);
  });

  it("возвраты вычитаются, строки без артикула собираются отдельно", () => {
    assert.equal(p["7"]!.byNm["2"]!.current.N, -1);
    assert.equal(p["7"]!.noNm.current.L, 300);
    assert.equal(p["7"]!.byNm["0"], undefined);
  });

  it("даты после dateTo и без даты в окна не попадают", () => {
    const q = buildPeriodWindows([sale("2026-10-25", 1), { nmId: 1, sellerOperName: "Продажа", quantity: 1 }], DATE_TO);
    assert.equal(q["7"]!.byNm["1"], undefined);
  });
});
