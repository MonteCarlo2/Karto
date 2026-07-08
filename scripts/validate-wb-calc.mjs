import { calculateWbUnitEconomics } from "../src/lib/unit-economics/calculate-wb.ts";
import { calculateWbForwardLogisticsRub } from "../src/lib/unit-economics/wb/logistics.ts";
import {
  getWbFbsCommissionWithDelivery,
  WB_FBS_DELIVERY_HOURS_MAX,
  WB_FBS_DELIVERY_HOURS_MIN,
} from "../src/lib/unit-economics/wb/fbs-delivery-commission.ts";
import { WB_FBW_WAREHOUSES } from "../src/lib/unit-economics/wb-meta.ts";
import meta from "../src/lib/unit-economics/data/wb/meta.json" with { type: "json" };
function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: got ${actual}, expected ${expected}`);
}

const bucket = {
  billableLiters: 12,
};

const baseCases = [
  { warehouseId: "volgograd", expected: 220 },
  { warehouseId: "ryazan-tyushevskoe", expected: 240 },
  { warehouseId: "marketplejs-severo-kavkazskij-federalnyj-okrug", expected: 260 },
];

for (const testCase of baseCases) {
  const actual = calculateWbForwardLogisticsRub({
    model: "fbs",
    warehouseId: testCase.warehouseId,
    billableLiters: bucket.billableLiters,
  });
  assertEq(actual, testCase.expected, `forward logistics ${testCase.warehouseId}`);
}

const localized = calculateWbForwardLogisticsRub({
  model: "fbs",
  warehouseId: "volgograd",
  billableLiters: 2,
  priceRub: 1000,
  localizationSharePercent: 37,
});
assertEq(localized, 113.4, "IL/IRP example at 37% share");

assertEq(meta.defaultWarehouseId, "volgograd", "default warehouse");

const baseFbs = 33;
assertEq(getWbFbsCommissionWithDelivery(baseFbs, 30), 33, "FBS commission at 30h");
assertEq(getWbFbsCommissionWithDelivery(baseFbs, 31), 33.1, "FBS commission at 31h");
assertEq(getWbFbsCommissionWithDelivery(baseFbs, 48), 34.8, "FBS commission at 48h");
assertEq(getWbFbsCommissionWithDelivery(baseFbs, 72), 37.2, "FBS commission at 72h");
assertEq(WB_FBS_DELIVERY_HOURS_MIN, 30, "delivery hours min");
assertEq(WB_FBS_DELIVERY_HOURS_MAX, 72, "delivery hours max");
assertEq(
  WB_FBW_WAREHOUSES.filter((w) => w.label.startsWith("Маркетплейс:")).length,
  0,
  "FBW excludes marketplace-only directions"
);

const officialCase = calculateWbUnitEconomics({
  marketplace: "wildberries",
  categoryId: meta.defaultCategoryId,
  priceRub: 2000,
  lengthCm: 25,
  widthCm: 25,
  heightCm: 20,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "usn6",
  buyoutPercent: 87,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: "volgograd",
  deliveryClusterId: "volgograd",
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  wbFbsDeliveryHours: 30,
  wbTurnoverDays: 32,
  wbUseLocalizationIndices: false,
  wbLocalizationSharePercent: null,
  wbEnabledFbs: true,
  wbEnabledFbw: false,
  wbFbsWarehouseIds: ["volgograd"],
});

const fbs = officialCase.results[0];
assertEq(officialCase.results.length, 1, "single FBS scenario count");
assertEq(fbs.payoutRub, 1078.28, "official payout");
assertEq(fbs.profitRub, 958.28, "official profit");
assertEq(fbs.mpCostsRub, 921.72, "official mp costs");

const commissionLine = fbs.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "commission");
assertEq(Math.abs(commissionLine?.amountRub ?? 0), 660, "official commission");

const logisticsLine = fbs.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-to-client");
assertEq(Math.abs(logisticsLine?.amountRub ?? 0), 261.72, "official logistics to client");

const fbwVolgogradMono = calculateWbUnitEconomics({
  marketplace: "wildberries",
  categoryId: meta.defaultCategoryId,
  priceRub: 1500,
  lengthCm: 20,
  widthCm: 30,
  heightCm: 15,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "usn6",
  buyoutPercent: 87,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: "volgograd",
  deliveryClusterId: "volgograd",
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  wbTurnoverDays: 32,
  wbUseLocalizationIndices: false,
  wbLocalizationSharePercent: null,
  wbEnabledFbw: true,
  wbEnabledFbs: false,
  wbFbwWarehouseIds: ["volgograd"],
  wbFbwSupplyTypes: ["monopallet"],
}).results[0];

const monoStorage = fbwVolgogradMono.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-storage");
const monoAcceptance = fbwVolgogradMono.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-acceptance");

assertEq(Math.abs(monoStorage?.amountRub ?? 0), 5.5, "FBW monopallet storage Volgograd");
assertEq(Math.abs(monoAcceptance?.amountRub ?? 0), 3.13, "FBW monopallet acceptance Volgograd");

const voronezhBase = {
  marketplace: "wildberries",
  categoryId: meta.defaultCategoryId,
  priceRub: 1500,
  lengthCm: 20,
  widthCm: 30,
  heightCm: 15,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "usn6",
  buyoutPercent: 87,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: "volgograd",
  deliveryClusterId: "volgograd",
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  wbTurnoverDays: 32,
  wbUseLocalizationIndices: false,
  wbLocalizationSharePercent: null,
  wbEnabledFbw: true,
  wbEnabledFbs: false,
  wbFbwWarehouseIds: ["voronezh"],
};

const voronezhBox = calculateWbUnitEconomics({
  ...voronezhBase,
  wbFbwSupplyTypes: ["box"],
}).results[0];
const voronezhMono = calculateWbUnitEconomics({
  ...voronezhBase,
  wbFbwSupplyTypes: ["monopallet"],
}).results[0];

const boxAcceptance = voronezhBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-acceptance");
const boxStorage = voronezhBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-storage");
const boxToClient = voronezhBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-to-client");

assertEq(Math.abs(boxAcceptance?.amountRub ?? 0), 15.3, "FBW box acceptance Voronezh");
assertEq(Math.abs(boxStorage?.amountRub ?? 0), 34.6, "FBW box storage Voronezh");
assertEq(Math.abs(boxToClient?.amountRub ?? 0), 215.45, "FBW box logistics to client Voronezh");
assertEq(voronezhBox.profitRub, 691.15, "FBW box profit Voronezh");
assertEq(voronezhMono.profitRub, 654.8, "FBW monopallet profit Voronezh");
if (voronezhBox.profitRub <= voronezhMono.profitRub) {
  throw new Error("Voronezh: box should be more profitable than monopallet");
}

const belayaBase = {
  ...voronezhBase,
  priceRub: 1000,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 40,
  wbFbwWarehouseIds: ["belaya-dacha"],
};

const belayaBox = calculateWbUnitEconomics({
  ...belayaBase,
  wbFbwSupplyTypes: ["box"],
}).results[0];
const belayaMono = calculateWbUnitEconomics({
  ...belayaBase,
  wbFbwSupplyTypes: ["monopallet"],
}).results[0];

const belayaBoxToClient = belayaBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-to-client");
const belayaFromClient = belayaBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "logistics")
  ?.children?.find((l) => l.id === "logistics-from-client");
const belayaCommission = belayaBox.lines
  .find((l) => l.id === "mp-costs")
  ?.children?.find((l) => l.id === "commission");

assertEq(Math.abs(belayaCommission?.amountRub ?? 0), 285, "FBW commission Belaya Dacha");
assertEq(Math.abs(belayaBoxToClient?.amountRub ?? 0), 471.26, "FBW box to client Belaya Dacha");
assertEq(Math.abs(belayaFromClient?.amountRub ?? 0), 29.89, "FBW from client Belaya Dacha");
assertEq(belayaBox.profitRub, 70.41, "FBW box profit Belaya Dacha");
assertEq(belayaMono.profitRub, 325.25, "FBW monopallet profit Belaya Dacha");
if (belayaBox.profitRub >= belayaMono.profitRub) {
  throw new Error("Belaya Dacha: monopallet should be more profitable than box");
}

const bucketCase = {
  marketplace: "wildberries",
  categoryId: meta.defaultCategoryId,
  priceRub: 1000,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 40,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "usn6",
  buyoutPercent: 87,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: "volgograd",
  deliveryClusterId: "volgograd",
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  wbTurnoverDays: 32,
  wbUseLocalizationIndices: false,
  wbLocalizationSharePercent: null,
  wbEnabledFbw: true,
  wbEnabledFbs: false,
};

const minskResults = calculateWbUnitEconomics({
  ...bucketCase,
  wbFbwWarehouseIds: ["minsk"],
  wbFbwSupplyTypes: ["box", "monopallet"],
}).results;
assertEq(minskResults.length, 2, "Minsk box + monopallet scenarios");
const minskBox = minskResults.find((r) => r.modelLabel.includes("Короб"));
const minskMono = minskResults.find((r) => r.modelLabel.includes("Монопаллета"));
assertEq(minskBox?.profitRub, 96.59, "FBW box profit Minsk");
assertEq(minskMono?.profitRub, 162.33, "FBW monopallet profit Minsk");
if ((minskBox?.profitRub ?? 0) >= (minskMono?.profitRub ?? 0)) {
  throw new Error("Minsk: monopallet should be more profitable than box");
}

const kazanResults = calculateWbUnitEconomics({
  ...bucketCase,
  wbFbwWarehouseIds: ["kazan"],
  wbFbwSupplyTypes: ["box", "monopallet"],
}).results;
assertEq(kazanResults.length, 2, "Kazan box + monopallet scenarios");
const kazanBox = kazanResults.find((r) => r.modelLabel.includes("Короб"));
const kazanMono = kazanResults.find((r) => r.modelLabel.includes("Монопаллета"));
assertEq(kazanBox?.profitRub, 19.94, "FBW box profit Kazan");
assertEq(kazanMono?.profitRub, 55.2, "FBW monopallet profit Kazan");
if ((kazanBox?.profitRub ?? 0) >= (kazanMono?.profitRub ?? 0)) {
  throw new Error("Kazan: monopallet should be more profitable than box");
}

const sarapulResults = calculateWbUnitEconomics({
  ...bucketCase,
  wbFbwWarehouseIds: ["sarapul"],
  wbFbwSupplyTypes: ["box", "monopallet"],
}).results;
assertEq(sarapulResults.length, 2, "Sarapul box + monopallet scenarios");
const sarapulBox = sarapulResults.find((r) => r.modelLabel.includes("Короб"));
const sarapulMono = sarapulResults.find((r) => r.modelLabel.includes("Монопаллета"));
assertEq(sarapulBox?.profitRub, 180.54, "FBW box profit Sarapul");
assertEq(sarapulMono?.profitRub, 124.17, "FBW monopallet profit Sarapul");
if ((sarapulBox?.profitRub ?? 0) <= (sarapulMono?.profitRub ?? 0)) {
  throw new Error("Sarapul: box should be more profitable than monopallet");
}

const emptyWb = calculateWbUnitEconomics({
  marketplace: "wildberries",
  categoryId: meta.defaultCategoryId,
  priceRub: 1500,
  lengthCm: 20,
  widthCm: 30,
  heightCm: 15,
  weightKg: 0.165,
  costPriceRub: 0,
  taxMode: "usn6",
  buyoutPercent: 87,
  otherCostsRub: 0,
  promoSharePercent: 0,
  shipClusterId: "volgograd",
  deliveryClusterId: "volgograd",
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  wbEnabledFbw: false,
  wbEnabledFbs: false,
  wbFbwWarehouseIds: [],
  wbFbsWarehouseIds: [],
});
assertEq(emptyWb.results.length, 0, "no scenarios when both models off");

console.log("OK — WB logistics matches official tariff files");