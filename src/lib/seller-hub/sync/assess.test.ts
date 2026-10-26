import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { assessBaseSnapshot } from "./assess";

const snap = (count: number, patch: Partial<SellerCatalogSnapshot> = {}): SellerCatalogSnapshot =>
  ({
    marketplaceId: "wildberries",
    items: Array.from({ length: count }, (_, i) => ({ id: String(i), externalId: String(i) })),
    syncedAt: "2026-10-22T10:00:00Z",
    totalCount: count,
    scopes: { content: true, prices: true, stocks: true },
    ...patch,
  }) as unknown as SellerCatalogSnapshot;

describe("можно ли публиковать новый базовый снимок", () => {
  it("первый снимок публикуется, если он не пустой", () => {
    assert.deepEqual(assessBaseSnapshot(null, snap(44), 0), { publish: true });
    assert.equal(assessBaseSnapshot(null, snap(0), 0).publish, false);
  });

  it("каталог прочитан не целиком: не публикуется", () => {
    const r = assessBaseSnapshot(snap(44), snap(44, { truncated: true }), 0);
    assert.equal(r.publish, false);
  });

  it("товаров стало вдвое меньше: сбой чтения, прежний снимок остаётся", () => {
    const r = assessBaseSnapshot(snap(1000), snap(300), 0);
    assert.equal(r.publish, false);
    assert.match((r as { reason: string }).reason, /1000/);
  });

  it("в маленьком каталоге реальное удаление проходит", () => {
    assert.equal(assessBaseSnapshot(snap(5), snap(2), 0).publish, true);
  });

  it("обычное изменение числа товаров проходит", () => {
    assert.equal(assessBaseSnapshot(snap(1000), snap(990), 0).publish, true);
    assert.equal(assessBaseSnapshot(snap(1000), snap(1030), 0).publish, true);
  });

  it("пропали цены, которые были раньше: не публикуем, а после трёх неудач подряд считаем решением владельца", () => {
    const before = snap(44);
    const after = snap(44, { scopes: { content: true, prices: false, stocks: true } });
    const first = assessBaseSnapshot(before, after, 0);
    assert.equal(first.publish, false);
    assert.match((first as { reason: string }).reason, /Цены и скидки/);
    assert.equal(assessBaseSnapshot(before, after, 3).publish, true);
  });
});
