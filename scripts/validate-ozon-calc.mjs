import { calculateOzonUnitEconomics } from "../src/lib/unit-economics/calculate-ozon.ts";
import meta from "../src/lib/unit-economics/data/ozon/meta.json" with { type: "json" };

function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: got ${actual}, expected ${expected}`);
}

const baseInput = {
  marketplace: "ozon",
  categoryId: meta.defaultCategoryId,
  priceRub: 320,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 40,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "none",
  buyoutPercent: 90,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: meta.defaultShipCluster,
  deliveryClusterId: meta.defaultDeliveryCluster,
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  fbsCargoUnitType: "box",
  useAdvancedProfitCalc: false,
  profitTaxPercent: 0,
  useFbsCargoUnit: false,
};

function run(handoff) {
  const result = calculateOzonUnitEconomics({
    ...baseInput,
    shipmentHandoff: handoff,
  });
  const fbo = result.results.find((x) => x.model === "fbo");
  const fbs = result.results.find((x) => x.model === "fbs");
  const line = (model, id) => model.lines.find((l) => l.id === id);
  const child = (model, id) => {
    const parent = line(model, "logistics");
    return parent?.children?.find((c) => c.id === id);
  };
  return { fbo, fbs, line, child };
}

const pickup = run("pickup_point");
assertEq(Math.abs(pickup.line(pickup.fbo, "commission").amountRub), 134, "FBO commission");
assertEq(Math.abs(pickup.line(pickup.fbs, "commission").amountRub), 154, "FBS commission");
assertEq(Math.abs(pickup.line(pickup.fbo, "acquiring").amountRub), 3, "acquiring");
assertEq(Math.abs(pickup.line(pickup.fbo, "logistics").amountRub), 144, "FBO processing");
assertEq(Math.abs(pickup.line(pickup.fbs, "logistics").amountRub), 174, "FBS processing pickup");
assertEq(Math.abs(pickup.child(pickup.fbo, "logistics-route").amountRub), 119, "FBO logistics");
assertEq(Math.abs(pickup.child(pickup.fbo, "logistics-delivery-pickup").amountRub), 25, "FBO delivery");
assertEq(pickup.fbo.payoutRub, 39, "FBO payout");
assertEq(pickup.fbs.payoutRub, -11, "FBS payout");

const courier = run("courier");
assertEq(Math.abs(courier.line(courier.fbs, "logistics").amountRub), 164, "FBS processing courier");

console.log("OK — Ozon tariff logic matches reference");
