import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  benjaminiHochberg,
  fisherExactTwoSided,
  poissonRateTest,
  twoProportionTest,
} from "./stats";

describe("poissonRateTest", () => {
  it("matches the 5→1 / 28d reference (not significant)", () => {
    const result = poissonRateTest(5, 28, 1, 28);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(Math.abs(result.pValue - 0.21875) < 0.001);
    assert.ok(result.pValue > 0.05);
    assert.ok(Math.abs(result.relativeChange - (1 / 5 - 1)) < 1e-9);
  });

  it("matches the 40→10 / 28d reference (significant)", () => {
    const result = poissonRateTest(40, 28, 10, 28);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.ok(result.pValue < 0.0001);
    assert.ok(result.relativeChange < -0.7);
  });

  it("returns no_data when both counts are zero", () => {
    const result = poissonRateTest(0, 28, 0, 28);
    assert.equal(result.status, "no_data");
    assert.equal(result.pValue, null);
  });
});

describe("twoProportionTest", () => {
  it("matches the 42/210 vs 20/200 reference", () => {
    const result = twoProportionTest(42, 210, 20, 200);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.test, "two_proportion_z");
    assert.ok(result.z != null && Math.abs(result.z - 2.83) < 0.05);
    assert.ok(Math.abs(result.pValue - 0.005) < 0.002);
  });

  it("marks s > n as inapplicable", () => {
    const result = twoProportionTest(10, 8, 5, 10);
    assert.equal(result.status, "inapplicable");
  });

  it("uses Fisher on small expected counts", () => {
    const result = twoProportionTest(1, 5, 4, 5);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.equal(result.test, "fisher_exact");
    assert.ok(result.pValue > 0);
    assert.ok(result.pValue <= 1);
  });

  it("Fisher agrees with a known 2×2 table", () => {
    // classic: [[1,9],[11,3]] two-sided around 0.001346
    const p = fisherExactTwoSided(1, 9, 11, 3);
    assert.ok(p < 0.01);
  });
});

describe("benjaminiHochberg", () => {
  it("rejects only the first two of the reference set at q=0.05", () => {
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205];
    const rejected = benjaminiHochberg(p, 0.05);
    assert.deepEqual(rejected, [true, true, false, false, false, false, false, false]);
  });
});
