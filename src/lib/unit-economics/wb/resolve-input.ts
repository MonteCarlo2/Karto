import { clampWbFbsDeliveryHours } from "./fbs-delivery-commission";
import { resolveCategoryId } from "../resolve-category";
import {
  defaultWbWarehouseId,
  listWbWarehousesForModel,
  listWbWarehousesForSupplyType,
} from "../wb-meta";
import type { UnitEconCalculatorInput, WbFulfillment } from "../types";

export function resolveWbBuyoutPercent(input: UnitEconCalculatorInput): number {
  return Math.max(1, Math.min(100, input.buyoutPercent));
}

export function resolveWbSalesModel(input: UnitEconCalculatorInput): WbFulfillment {
  if (input.wbEnabledFbw && !input.wbEnabledFbs) return "fbw";
  if (input.wbEnabledFbs && !input.wbEnabledFbw) return "fbs";
  return input.wbSalesModel === "fbw" ? "fbw" : "fbs";
}

function resolveEnabledModels(input: UnitEconCalculatorInput): { fbw: boolean; fbs: boolean } {
  if (input.wbEnabledFbw != null || input.wbEnabledFbs != null) {
    return {
      fbw: Boolean(input.wbEnabledFbw),
      fbs: Boolean(input.wbEnabledFbs),
    };
  }
  const model = input.wbSalesModel === "fbw" ? "fbw" : "fbs";
  return { fbw: model === "fbw", fbs: model === "fbs" };
}

function resolveFbwSupplyTypes(input: UnitEconCalculatorInput): ("box" | "monopallet")[] {
  if (input.wbFbwSupplyTypes !== undefined) {
    return input.wbFbwSupplyTypes.filter((t) => t === "box" || t === "monopallet");
  }
  return [input.wbFbwSupplyType === "monopallet" ? "monopallet" : "box"];
}

function resolveWarehouseIds(
  input: UnitEconCalculatorInput,
  model: "fbw" | "fbs"
): string[] {
  const fromMulti =
    model === "fbw" ? input.wbFbwWarehouseIds : input.wbFbsWarehouseIds;

  if (fromMulti !== undefined) {
    const allowed = new Set(listWbWarehousesForModel(model).map((w) => w.id));
    return fromMulti.filter((id) => allowed.has(id));
  }

  const fallback = listWbWarehousesForModel(model).some((w) => w.id === input.shipClusterId)
    ? input.shipClusterId
    : defaultWbWarehouseId(model);
  return [fallback];
}

export type WbResolvedScenario = {
  model: WbFulfillment;
  warehouseId: string;
  supplyType?: "box" | "monopallet";
  deliveryHours?: number;
};

export function resolveWbScenarios(input: UnitEconCalculatorInput): WbResolvedScenario[] {
  const enabled = resolveEnabledModels(input);
  const scenarios: WbResolvedScenario[] = [];
  const deliveryHours = clampWbFbsDeliveryHours(input.wbFbsDeliveryHours ?? 30);

  if (enabled.fbw) {
    const warehouseIds = resolveWarehouseIds(input, "fbw");
    const supplyTypes = resolveFbwSupplyTypes(input);
    if (warehouseIds.length && supplyTypes.length) {
      for (const warehouseId of warehouseIds) {
        for (const supplyType of supplyTypes) {
          const allowed = listWbWarehousesForSupplyType(supplyType).some(
            (w) => w.id === warehouseId
          );
          if (!allowed) continue;
          scenarios.push({ model: "fbw", warehouseId, supplyType });
        }
      }
    }
  }

  if (enabled.fbs) {
    const warehouseIds = resolveWarehouseIds(input, "fbs");
    for (const warehouseId of warehouseIds) {
      scenarios.push({ model: "fbs", warehouseId, deliveryHours });
    }
  }

  return scenarios;
}

export function resolveWbCalculatorInput(input: UnitEconCalculatorInput): UnitEconCalculatorInput {
  const localizationShare =
    input.wbUseLocalizationIndices === true
      ? Math.max(0, Math.min(100, input.wbLocalizationSharePercent ?? 0))
      : null;

  const enabled = resolveEnabledModels(input);
  const fbwWarehouseIds =
    input.wbFbwWarehouseIds !== undefined
      ? resolveWarehouseIds(input, "fbw")
      : enabled.fbw
        ? resolveWarehouseIds(input, "fbw")
        : [];
  const fbsWarehouseIds =
    input.wbFbsWarehouseIds !== undefined
      ? resolveWarehouseIds(input, "fbs")
      : enabled.fbs
        ? resolveWarehouseIds(input, "fbs")
        : [];
  const supplyTypes = resolveFbwSupplyTypes(input);
  const primaryWarehouse =
    fbsWarehouseIds[0] ?? fbwWarehouseIds[0] ?? defaultWbWarehouseId("fbs");

  return {
    ...input,
    categoryId: resolveCategoryId("wildberries", input.categoryId),
    buyoutPercent: resolveWbBuyoutPercent(input),
    wbLocalizationSharePercent: localizationShare,
    wbFbsDeliveryHours: clampWbFbsDeliveryHours(input.wbFbsDeliveryHours ?? 30),
    wbTurnoverDays: Math.max(0, Math.round(input.wbTurnoverDays ?? 32)),
    wbEnabledFbw: enabled.fbw,
    wbEnabledFbs: enabled.fbs,
    wbSalesModel:
      enabled.fbw && !enabled.fbs ? "fbw" : enabled.fbs && !enabled.fbw ? "fbs" : input.wbSalesModel ?? "fbs",
    wbFbwWarehouseIds: fbwWarehouseIds,
    wbFbsWarehouseIds: fbsWarehouseIds,
    wbFbwSupplyTypes: supplyTypes,
    wbFbwSupplyType: supplyTypes[0] ?? "box",
    shipClusterId: primaryWarehouse,
    deliveryClusterId: primaryWarehouse,
  };
}
