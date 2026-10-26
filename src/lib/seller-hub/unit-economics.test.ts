import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeUnitEconomics,
  decomposeMarginChange,
  deteriorationMoneyAtRisk,
  reconcileBankPayment,
  type RealizationWindowTotals,
  type UnitEconomics,
} from "./unit-economics";
const TO = 308_345;

function window(partial: Partial<RealizationWindowTotals> & Pick<RealizationWindowTotals, "N" | "S" | "RA" | "Pay" | "L">): RealizationWindowTotals {
  return {
    A: 0,
    Pen: 0,
    rebill: 0,
    StRealization: 0,
    ...partial,
  };
}

function econ(input: {
  N: number;
  S: number;
  RA: number;
  Pay: number;
  L: number;
  St: number;
  A?: number;
  cost: number;
  tax?: number;
  price?: number;
}): UnitEconomics {
  const result = computeUnitEconomics({
    window: window({
      N: input.N,
      S: input.S,
      RA: input.RA,
      Pay: input.Pay,
      L: input.L,
      A: input.A ?? 0,
    }),
    storage: { St: input.St, source: "paid_storage" },
    costPerUnit: input.cost,
    taxRatePercent: input.tax ?? null,
    currentPrice: input.price ?? input.S / input.N,
  });
  assert.ok(result);
  return result;
}

describe("computeUnitEconomics — эталон Б (без налога)", () => {
  // Промпт 13 с налогом 6%: P=−740, u=−74, BE=1107.
  // Без налога: P=Pay−L−St−A−C=7500−1500−200−0−6000=−200; u=−20; BE=⌈770/0.75⌉=1027.
  it("базовый товар Б", () => {
    const e = econ({
      N: 10,
      S: 10_000,
      RA: 9_000,
      Pay: 7_500,
      L: 1_500,
      St: 200,
      cost: 600,
      tax: 6,
      price: 1_000,
    });
    assert.equal(e.Tax, 0);
    assert.equal(e.P, -200);
    assert.equal(e.u, -20);
    assert.ok(Math.abs(e.m - -0.02) < 1e-9);
    assert.equal(e.k, 0.25);
    assert.equal(e.r, 0.9);
    assert.equal(e.F, 770);
    assert.equal(e.breakEvenPrice, 1_027);
    assert.equal(e.priceForTarget(0.2), 1_400);
    assert.ok(Math.abs((e.uNow ?? 0) - -20) < 0.01);
  });

  it("безубыточность: 1027 в плюс, 1026 в минус", () => {
    const e = econ({
      N: 10,
      S: 10_000,
      RA: 9_000,
      Pay: 7_500,
      L: 1_500,
      St: 200,
      cost: 600,
      tax: 6,
      price: 1_000,
    });
    const denom = 1 - 0.25;
    assert.ok(1_027 * denom - 770 > 0);
    assert.ok(1_026 * denom - 770 < 0);
    assert.equal(e.breakEvenPrice, 1_027);
  });

  it("ставка налога в настройках не влияет на u/m/BE", () => {
    const a = econ({
      N: 10,
      S: 10_000,
      RA: 9_000,
      Pay: 7_500,
      L: 1_500,
      St: 200,
      cost: 600,
      price: 1_000,
    });
    const b = econ({
      N: 10,
      S: 10_000,
      RA: 9_000,
      Pay: 7_500,
      L: 1_500,
      St: 200,
      cost: 600,
      tax: 35,
      price: 1_000,
    });
    assert.equal(a.P, b.P);
    assert.equal(a.u, b.u);
    assert.equal(a.breakEvenPrice, b.breakEvenPrice);
  });
});

describe("severity для убыточной цены", () => {
  it("Б: убыток 200 = 0.06% < 1% порога Важно", () => {
    assert.ok(200 / TO < 0.01);
    assert.ok(200 / TO >= 0);
  });

  it("Б×50: убыток 10_000 ≈ 3.24% ≥ 1%", () => {
    assert.ok(10_000 / TO >= 0.01);
    assert.ok(10_000 / TO < 0.05);
  });
});

describe("decomposeMarginChange", () => {
  it("ухудшение из-за WB: сумма = Δu", () => {
    const prev = econ({
      N: 100,
      S: 100_000,
      RA: 100_000,
      Pay: 76_000,
      L: 8_000,
      St: 1_000,
      cost: 500,
      tax: 0,
      price: 1_000,
    });
    const curr = econ({
      N: 100,
      S: 100_000,
      RA: 100_000,
      Pay: 73_000,
      L: 15_000,
      St: 1_000,
      cost: 500,
      tax: 0,
      price: 1_000,
    });
    assert.equal(prev.P, 17_000);
    assert.equal(curr.P, 7_000);
    const d = decomposeMarginChange({ prev, curr, costTracked: true });
    assert.ok(d);
    assert.ok(Math.abs(d.sum - (curr.u - prev.u)) < 0.01);
    assert.ok(Math.abs(d.feeRate - -30) < 0.01);
    assert.ok(Math.abs(d.logistics - -70) < 0.01);
    const money = deteriorationMoneyAtRisk({ decomp: d, P1: prev.P, P2: curr.P, N2: curr.N });
    assert.ok(Math.abs(money - 10_000) < 0.01);
  });

  it("снижение цены не окупилось → деньги 7500", () => {
    const prev = econ({
      N: 100,
      S: 100_000,
      RA: 100_000,
      Pay: 75_000,
      L: 8_000,
      St: 1_000,
      cost: 500,
      tax: 0,
      price: 1_000,
    });
    const curr = econ({
      N: 100,
      S: 90_000,
      RA: 90_000,
      Pay: 67_500,
      L: 8_000,
      St: 1_000,
      cost: 500,
      tax: 0,
      price: 900,
    });
    const d = decomposeMarginChange({ prev, curr, costTracked: true });
    assert.ok(d);
    assert.ok(Math.abs(d.price - -75) < 0.01);
    const money = deteriorationMoneyAtRisk({ decomp: d, P1: prev.P, P2: curr.P, N2: curr.N });
    assert.equal(money, 7_500);
  });

  it("снижение цены окупилось → деньги 0", () => {
    const prev = econ({
      N: 100,
      S: 100_000,
      RA: 100_000,
      Pay: 75_000,
      L: 8_000,
      St: 1_000,
      cost: 500,
      tax: 0,
      price: 1_000,
    });
    const curr = econ({
      N: 200,
      S: 180_000,
      RA: 180_000,
      Pay: 135_000,
      L: 16_000,
      St: 2_000,
      cost: 500,
      tax: 0,
      price: 900,
    });
    assert.ok(curr.P >= prev.P);
    const d = decomposeMarginChange({ prev, curr, costTracked: true });
    assert.ok(d);
    const money = deteriorationMoneyAtRisk({ decomp: d, P1: prev.P, P2: curr.P, N2: curr.N });
    assert.equal(money, 0);
  });
});

describe("цель маржи", () => {
  it("Б при цене 1300: недобор ~550 (без налога; со налогом было ~1252)", () => {
    const e = econ({
      N: 10,
      S: 13_000,
      RA: 11_700,
      Pay: 9_750,
      L: 1_500,
      St: 200,
      cost: 600,
      tax: 6,
      price: 1_300,
    });
    // Без налога: P=9750−1500−200−6000=2050; m≈15.77%; gap=(0.2−m)×S≈550.
    assert.ok(Math.abs(e.P - 2_050) < 1);
    assert.ok(Math.abs(e.m - 0.1577) < 0.001);
    const gap = (0.2 - e.m) * e.S;
    assert.ok(Math.abs(gap - 550) < 2);
    assert.equal(e.priceForTarget(0.2), 1_400);
  });
});

describe("пограничные", () => {
  it("N≤0 → null", () => {
    assert.equal(
      computeUnitEconomics({
        window: window({ N: 0, S: 1000, RA: 900, Pay: 700, L: 100 }),
        storage: { St: 0, source: "fbs_zero" },
        costPerUnit: 100,
        taxRatePercent: null,
        currentPrice: 1000,
      }),
      null,
    );
  });

  it("нет себестоимости → null", () => {
    assert.equal(
      computeUnitEconomics({
        window: window({ N: 10, S: 10_000, RA: 9_000, Pay: 7_500, L: 1_500 }),
        storage: { St: 200, source: "paid_storage" },
        costPerUnit: null,
        taxRatePercent: 6,
        currentPrice: 1000,
      }),
      null,
    );
  });

  it("знаменатель ≤ 0 → breakEvenImpossible", () => {
    const e = computeUnitEconomics({
      window: window({ N: 10, S: 10_000, RA: 10_000, Pay: 0, L: 0 }),
      storage: { St: 0, source: "fbs_zero" },
      costPerUnit: 100,
      taxRatePercent: 35,
      currentPrice: 1000,
    });
    assert.ok(e);
    // k = 1 → denom = 0 (налог игнорируется)
    assert.equal(e.breakEvenImpossible, true);
    assert.equal(e.breakEvenPrice, null);
  });

  it("штраф не входит в P", () => {
    const e = econ({
      N: 10,
      S: 10_000,
      RA: 9_000,
      Pay: 7_500,
      L: 1_500,
      St: 200,
      cost: 600,
      tax: 6,
      price: 1_000,
    });
    const withPen = computeUnitEconomics({
      window: { ...window({ N: 10, S: 10_000, RA: 9_000, Pay: 7_500, L: 1_500 }), Pen: 5_000 },
      storage: { St: 200, source: "paid_storage" },
      costPerUnit: 600,
      taxRatePercent: 6,
      currentPrice: 1_000,
    });
    assert.ok(withPen);
    assert.equal(withPen.P, e.P);
    assert.equal(withPen.Pen, 5_000);
  });
});

describe("reconcileBankPayment", () => {
  it("сумма сходится", () => {
    const r = reconcileBankPayment({
      byNm: [
        { Pay: 100, L: 10, St: 1, A: 2, Pen: 3 },
        { Pay: 50, L: 5, St: 0, A: 0, Pen: 0 },
      ],
      noNm: { Pay: 0, L: 0, St: 4, A: 0, Pen: 0 },
      bankPaymentSum: 100 - 10 - 1 - 2 - 3 + 50 - 5 - 4,
    });
    assert.equal(r.ok, true);
    assert.equal(r.delta, 0);
  });
});
