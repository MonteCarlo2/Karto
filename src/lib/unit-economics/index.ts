import { calculateWbUnitEconomics } from "./calculate-wb";
import {
  OZON_DEFAULT_CATEGORY_ID,
  OZON_DEFAULT_DELIVERY_CLUSTER,
  OZON_DEFAULT_SHIP_CLUSTER,
} from "./ozon-meta";
import {
  WB_DEFAULT_CATEGORY_ID,
  WB_DEFAULT_WAREHOUSE_ID,
} from "./wb-meta";
import type { UnitEconCalculatorInput, UnitEconCalculation, UnitEconMarketplace } from "./types";

/** @deprecated Клиентский расчёт — только для обратной совместимости. Используйте API. */
export function calculateUnitEconomicsClient(input: UnitEconCalculatorInput): UnitEconCalculation {
  if (input.marketplace === "ozon") {
    throw new Error("Ozon расчитывается через API");
  }
  return calculateWbUnitEconomics(input);
}

export function defaultCategoryId(marketplace: UnitEconMarketplace): string {
  if (marketplace === "ozon") return OZON_DEFAULT_CATEGORY_ID;
  return WB_DEFAULT_CATEGORY_ID;
}

export { resolveCategoryId } from "./resolve-category";

export const DEFAULT_UNIT_ECON_INPUT: UnitEconCalculatorInput = {
  marketplace: "ozon",
  categoryId: OZON_DEFAULT_CATEGORY_ID,
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
  shipClusterId: OZON_DEFAULT_SHIP_CLUSTER,
  deliveryClusterId: OZON_DEFAULT_DELIVERY_CLUSTER,
  shipmentHandoff: "pickup_point",
  pickupPointType: "pvz",
  acceptanceType: "mono",
  shipmentsInBatch: 1,
  fbsCargoUnitType: "box",
  useAdvancedProfitCalc: false,
  profitTaxPercent: 0,
  useFbsCargoUnit: false,
  wbUseLocalizationIndices: false,
  wbLocalizationSharePercent: null,
  wbFbsDeliveryHours: 30,
  wbTurnoverDays: 32,
  wbSalesModel: "fbs",
  wbEnabledFbw: false,
  wbEnabledFbs: true,
  wbFbwWarehouseIds: [],
  wbFbsWarehouseIds: ["volgograd"],
  wbFbwSupplyTypes: ["box"],
  wbFbwSupplyType: "box",
};

export function defaultClusterIds(marketplace: UnitEconMarketplace): {
  shipClusterId: string;
  deliveryClusterId: string;
} {
  if (marketplace === "ozon") {
    return {
      shipClusterId: OZON_DEFAULT_SHIP_CLUSTER,
      deliveryClusterId: OZON_DEFAULT_DELIVERY_CLUSTER,
    };
  }
  return { shipClusterId: WB_DEFAULT_WAREHOUSE_ID, deliveryClusterId: WB_DEFAULT_WAREHOUSE_ID };
}

export * from "./types";
export * from "./demo-tariffs";
export * from "./formulas";
export * from "./clusters";
export * from "./ozon-meta";
export * from "./wb-meta";
