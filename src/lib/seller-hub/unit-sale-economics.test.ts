import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeUnitSaleEconomics,
  emptyDeliveryAgg,
  shopDeliveryStats,
  type DeliveryLogisticsAgg,
} from "./unit-sale-economics";

function agg(patch: Partial<DeliveryLogisticsAgg>): DeliveryLogisticsAgg {
  return { ...emptyDeliveryAgg(), ...patch };
}

describe("computeUnitSaleEconomics", () => {
  it("example 1 prompt 14: p=1600 k=0.33 l≈371.74 → u=380.26 m=23.77% BE=1033", () => {
    const logistics = agg({
      D: 40,
      deliveryCost: 40 * 250,
      R: 10,
      returnCost: 10 * 150,
      S: 100_000,
      Pay: 67_000,
      RA: 100_000,
      A: 10 * (40 - 10),
    });
    // a = A/(D-R) = 10; s=0; c=310 → u = 1600×0.67 − 371.74 − 10 − 310 = 380.26
    const out = computeUnitSaleEconomics({
      logistics,
      shop: { D: 100, R: 20, returnCost: 3000, bShop: 0.8, rShop: 150 },
      storageRub90: 0,
      onWbWarehouse: false,
      currentPrice: 1600,
      costPerUnit: 310,
      taxRatePercent: null,
    });
    assert.ok(out);
    assert.ok(Math.abs(out.k - 0.33) < 1e-9);
    assert.ok(Math.abs(out.b - 0.7667) < 0.001);
    assert.ok(Math.abs(out.l - 371.74) < 0.05);
    assert.ok(Math.abs((out.u ?? 0) - 380.26) < 0.1);
    assert.ok(Math.abs((out.m ?? 0) - 0.2377) < 0.001);
    assert.equal(out.breakEvenPrice, 1033);
  });

  it("example 1: любая ставка налога в настройках → тот же результат", () => {
    const logistics = agg({
      D: 40,
      deliveryCost: 40 * 250,
      R: 10,
      returnCost: 10 * 150,
      S: 100_000,
      Pay: 67_000,
      RA: 100_000,
      A: 10 * (40 - 10),
    });
    const base = {
      logistics,
      shop: { D: 100, R: 20, returnCost: 3000, bShop: 0.8, rShop: 150 },
      storageRub90: 0,
      onWbWarehouse: false,
      currentPrice: 1600,
      costPerUnit: 310,
    };
    const a = computeUnitSaleEconomics({ ...base, taxRatePercent: null });
    const b = computeUnitSaleEconomics({ ...base, taxRatePercent: 6 });
    const c = computeUnitSaleEconomics({ ...base, taxRatePercent: 35 });
    assert.ok(a && b && c);
    assert.equal(a.u, b.u);
    assert.equal(a.u, c.u);
    assert.equal(a.breakEvenPrice, b.breakEvenPrice);
    assert.equal(a.breakEvenPrice, c.breakEvenPrice);
  });

  it("example 2: small volume without cost → u before cost", () => {
    const logistics = agg({
      D: 6,
      deliveryCost: 6 * 800,
      R: 2,
      returnCost: 2 * 500,
      S: 10_000,
      Pay: 6900,
      RA: 10_000,
      A: 5 * (6 - 2),
    });
    const out = computeUnitSaleEconomics({
      logistics,
      shop: { D: 100, R: 20, returnCost: 3000, bShop: 0.8, rShop: 150 },
      storageRub90: 0,
      onWbWarehouse: false,
      currentPrice: 3404,
      costPerUnit: null,
      taxRatePercent: null,
    });
    assert.ok(out);
    assert.ok(Math.abs(out.b - 0.7692) < 0.001);
    assert.ok(Math.abs(out.l - 1190) < 0.5);
    assert.ok(Math.abs(out.uBeforeCost - 1153.76) < 1);
    assert.ok(Math.abs(out.mBeforeCost - 0.3389) < 0.002);
    assert.equal(out.u, null);
    assert.equal(out.m, null);
  });

  it("D=0 → null", () => {
    const out = computeUnitSaleEconomics({
      logistics: agg({ D: 0, S: 1000, Pay: 700 }),
      shop: shopDeliveryStats([]),
      storageRub90: 0,
      onWbWarehouse: false,
      currentPrice: 1000,
      costPerUnit: 100,
      taxRatePercent: null,
    });
    assert.equal(out, null);
  });

  it("R=0 uses shop r", () => {
    const logistics = agg({
      D: 10,
      deliveryCost: 2500,
      R: 0,
      returnCost: 0,
      S: 5000,
      Pay: 3500,
      RA: 5000,
      A: 0,
    });
    const out = computeUnitSaleEconomics({
      logistics,
      shop: { D: 100, R: 20, returnCost: 3000, bShop: 0.8, rShop: 150 },
      storageRub90: 0,
      onWbWarehouse: false,
      currentPrice: 1000,
      costPerUnit: 100,
      taxRatePercent: null,
    });
    assert.ok(out);
    assert.equal(out.r, 150);
  });
});
