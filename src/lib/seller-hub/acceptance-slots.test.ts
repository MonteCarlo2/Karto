import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWarehouseSlots, type AcceptanceRow } from "./acceptance-slots";

const r = (warehouseId: number, warehouseName: string, date: string, coefficient: number, allowUnload = true, boxTypeId: number | null = 2): AcceptanceRow => ({
  date,
  coefficient,
  warehouseId,
  warehouseName,
  allowUnload,
  boxTypeId,
  isSortingCenter: false,
});

describe("слоты приёмки", () => {
  const rows = [
    r(1, "Коледино", "2026-10-20", 1),
    r(1, "Коледино", "2026-10-21", 0),
    r(1, "Коледино", "2026-10-22", 0),
    r(1, "Коледино", "2026-10-23", -1),
    r(2, "Казань", "2026-10-19", 1),
    r(2, "Казань", "2026-10-20", 5),
    r(3, "Тула", "2026-10-19", 0, false),
    r(4, "Коледино", "2026-10-19", 0, true, 5),
  ];

  it("находит ближайший бесплатный день и самую дешёвую платную приёмку, закрытые дни не считает", () => {
    const list = buildWarehouseSlots(rows, 2);
    const kol = list.find((s) => s.warehouseId === 1)!;
    assert.equal(kol.nextFree, "2026-10-21");
    assert.deepEqual(kol.cheapestPaid, { date: "2026-10-20", coefficient: 1 });
    assert.equal(kol.openDays, 3);
    const kaz = list.find((s) => s.warehouseId === 2)!;
    assert.equal(kaz.nextFree, null);
    assert.deepEqual(kaz.cheapestPaid, { date: "2026-10-19", coefficient: 1 });
    assert.equal(kaz.openDays, 1);
  });

  it("коэффициент выше 1 — отгрузка закрыта, день не считается", () => {
    const k = buildWarehouseSlots([r(9, "Тест", "2026-10-20", 3), r(9, "Тест", "2026-10-21", 0)], 2)[0]!;
    assert.equal(k.openDays, 1);
    assert.equal(k.cheapestPaid, null);
  });

  it("склад, куда отгрузка запрещена, остаётся в списке без слотов и идёт последним", () => {
    const list = buildWarehouseSlots(rows, 2);
    assert.equal(list.at(-1)!.warehouseId, 3);
    assert.equal(list.at(-1)!.openDays, 0);
  });

  it("сначала склады с бесплатным слотом, затем с самым дешёвым платным; тип поставки фильтрует", () => {
    assert.deepEqual(buildWarehouseSlots(rows, 2).map((s) => s.warehouseId), [1, 2, 3]);
    assert.deepEqual(buildWarehouseSlots(rows, 5).map((s) => s.warehouseId), [4]);
    assert.equal(buildWarehouseSlots(rows, null).length, 4);
  });
});
