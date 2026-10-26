import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCoverRows,
  buildOosRisks,
  buildShipmentPlan,
  demandByDistrict,
  isRealDistrict,
  normalizeDistrict,
  summarizeWarehouses,
} from "./logistics";
import type { SellerRegionOrdersRow, SellerWarehouseStockRow } from "./types";

const order = (nmId: string, district: string, orders: number, cancelled = 0): SellerRegionOrdersRow => ({
  nmId,
  district,
  region: "Область",
  orders,
  cancelled,
});
const stock = (nmId: string, region: string, quantity: number, warehouseId = 1): SellerWarehouseStockRow => ({
  nmId,
  warehouseId,
  warehouseName: `Склад ${warehouseId}`,
  regionName: region,
  quantity,
  inWayToClient: 0,
  inWayFromClient: 0,
});

describe("normalizeDistrict / isRealDistrict", () => {
  it("убирает «федеральный округ» и распознаёт виртуальный «Склад WB»", () => {
    assert.equal(normalizeDistrict("Центральный федеральный округ"), "Центральный");
    assert.equal(normalizeDistrict("Южный ФО"), "Южный");
    assert.equal(isRealDistrict("Склад WB"), false);
    assert.equal(isRealDistrict("Центральный"), true);
  });
});

describe("demandByDistrict", () => {
  it("считает заказы без отмен и доли, по убыванию", () => {
    const { total, districts } = demandByDistrict([
      order("1", "Центральный федеральный округ", 30, 5),
      order("1", "Южный федеральный округ", 10),
      order("2", "Центральный федеральный округ", 5),
    ]);
    assert.equal(total, 40);
    assert.deepEqual(districts.map((d) => [d.district, d.orders]), [
      ["Центральный", 30],
      ["Южный", 10],
    ]);
    assert.equal(districts[0]!.share, 0.75);
  });

  it("можно посмотреть один артикул", () => {
    const { total } = demandByDistrict([order("1", "Южный", 10), order("2", "Южный", 7)], "2");
    assert.equal(total, 7);
  });
});

describe("summarizeWarehouses", () => {
  it("суммирует остатки по складу и считает артикулы с остатком", () => {
    const rows = summarizeWarehouses([
      stock("1", "Центральный", 10, 5),
      stock("2", "Центральный", 0, 5),
      stock("3", "Центральный", 4, 5),
      stock("1", "Южный", 20, 7),
    ]);
    assert.deepEqual(rows.map((r) => [r.warehouseId, r.quantity, r.products]), [
      [7, 20, 1],
      [5, 14, 2],
    ]);
  });
});

describe("buildShipmentPlan", () => {
  it("нужно = спрос в день × дни покрытия − остаток округа, вверх до кратности короба", () => {
    // 60 заказов за 30 дней = 2 в день; на 45 дней нужно 90; в округе 40 — отгрузить 50, при кратности 12 → 60.
    const plan = buildShipmentPlan({
      orders: [order("1", "Центральный федеральный округ", 60)],
      stock: [stock("1", "Центральный", 40)],
      periodDays: 30,
      coverDays: 45,
      multiple: 12,
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0]!.dailyDemand, 2);
    assert.equal(plan[0]!.stock, 40);
    assert.equal(plan[0]!.daysCover, 20);
    assert.equal(plan[0]!.need, 60);
  });

  it("остатка хватает — отгрузка 0; отменённые заказы спрос не создают", () => {
    const plan = buildShipmentPlan({
      orders: [order("1", "Южный", 30, 30)],
      stock: [],
      periodDays: 30,
      coverDays: 30,
      multiple: 1,
    });
    assert.deepEqual(plan, []);
    const covered = buildShipmentPlan({
      orders: [order("1", "Южный", 30)],
      stock: [stock("1", "Южный", 500)],
      periodDays: 30,
      coverDays: 30,
      multiple: 1,
    });
    assert.equal(covered[0]!.need, 0);
  });

  it("виртуальный «Склад WB» не считается остатком округа; строки по убыванию потребности", () => {
    const plan = buildShipmentPlan({
      orders: [order("1", "Центральный", 30), order("1", "Южный", 90)],
      stock: [stock("1", "Склад WB", 1000)],
      periodDays: 30,
      coverDays: 10,
      multiple: 1,
    });
    assert.deepEqual(plan.map((r) => [r.district, r.need]), [
      ["Южный", 30],
      ["Центральный", 10],
    ]);
  });
});

describe("buildOosRisks", () => {
  it("общий остаток (WB + ваш склад) ÷ спрос в день, уровни 14 и 30 дней, по возрастанию запаса", () => {
    const risks = buildOosRisks({
      orders: [order("1", "Южный", 60), order("2", "Южный", 60), order("3", "Южный", 60), order("4", "Южный", 0)],
      periodDays: 30,
      wbStock: [stock("1", "Склад WB", 10), stock("2", "Центральный", 30)],
      ownStock: new Map([["1", 10], ["2", 15], ["3", 500]]),
    });
    // спрос 2 в день: арт.1 остаток 20 → 10 дней (14), арт.2 остаток 45 → 22,5 дня (30), арт.3 остаток 500 → 250 дней (не в списке)
    assert.deepEqual(risks.map((r) => [r.nmId, r.daysCover, r.level]), [
      ["1", 10, "soon14"],
      ["2", 22.5, "soon30"],
    ]);
  });

  it("товары без спроса не попадают в список, нулевой остаток — 0 дней", () => {
    const risks = buildOosRisks({ orders: [order("1", "Южный", 30)], periodDays: 30, wbStock: [], ownStock: new Map() });
    assert.deepEqual(risks.map((r) => [r.nmId, r.daysCover]), [["1", 0]]);
    assert.deepEqual(buildOosRisks({ orders: [], periodDays: 30, wbStock: [], ownStock: new Map() }), []);
  });
});

describe("buildCoverRows", () => {
  it("показывает запас по всем товарам со спросом, от короткого к длинному, с уровнями", () => {
    const rows = buildCoverRows({
      orders: [order("1", "Южный", 60), order("2", "Южный", 60), order("3", "Южный", 60)],
      periodDays: 30,
      wbStock: [stock("1", "Склад WB", 10), stock("2", "Центральный", 30)],
      ownStock: new Map([["1", 10], ["2", 15], ["3", 500]]),
    });
    assert.deepEqual(rows.map((r) => [r.nmId, r.daysCover, r.level]), [
      ["1", 10, "soon14"],
      ["2", 22.5, "soon30"],
      ["3", 250, "ok"],
    ]);
  });
});
