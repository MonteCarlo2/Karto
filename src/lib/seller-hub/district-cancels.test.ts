import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { districtCancels } from "./district-cancels";

const row = (district: string, orders: number, cancelled: number, nmId = "1") => ({ nmId, district, region: "", orders, cancelled });

describe("отмены по округам", () => {
  it("считает долю отмен по округу и выделяет повышенные относительно магазина", () => {
    const r = districtCancels([
      row("Центральный федеральный округ", 100, 10),
      row("Центральный федеральный округ", 20, 2, "2"),
      row("Дальневосточный федеральный округ", 20, 8),
      row("Южный федеральный округ", 30, 3),
    ]);
    assert.equal(Math.round(r.shopShare! * 1000), 135);
    const east = r.districts.find((d) => d.district === "Дальневосточный")!;
    assert.equal(east.cancelShare, 0.4);
    assert.equal(east.high, true);
    assert.equal(r.districts.find((d) => d.district === "Центральный")!.orders, 120);
    assert.equal(r.districts.find((d) => d.district === "Центральный")!.high, false);
    assert.equal(r.districts[0]!.district, "Дальневосточный");
  });

  it("округа с малым числом заказов не оцениваются; без заказов долей нет", () => {
    assert.equal(districtCancels([row("Уральский федеральный округ", 5, 4)]).districts.length, 0);
    assert.equal(districtCancels([]).shopShare, null);
  });
});
