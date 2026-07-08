import metaJson from "./data/wb/meta.json";
import { listWbWarehousesFromTariffs } from "./wb/tariffs";
import type { WbWarehouse } from "./wb/types";

export type WbWarehouseOption = {
  id: string;
  label: string;
  /** Короткое имя без префикса «Маркетплейс:». */
  shortLabel: string;
  /** FBW: короб. */
  fbwBoxAvailable?: boolean;
  /** FBW: монопаллета. */
  fbwMonopalletAvailable?: boolean;
  /** FBS: маркетплейс-склад. */
  fbsAvailable?: boolean;
  /** Есть в TSV-снапшоте калькулятора прибыли WB. */
  profitCalculatorWarehouse?: boolean;
};

export const wbMeta = metaJson;

export function formatWbWarehouseShortLabel(label: string): string {
  return label.replace(/^Маркетплейс:\s*/i, "").trim();
}

function isMarketplaceWarehouse(w: WbWarehouse): boolean {
  return /^Маркетплейс:\s*/i.test(w.label);
}

function toWarehouseOption(w: WbWarehouse): WbWarehouseOption {
  const marketplaceWarehouse = isMarketplaceWarehouse(w);
  return {
    id: w.id,
    label: w.label,
    shortLabel: formatWbWarehouseShortLabel(w.label),
    fbwBoxAvailable: Boolean(!marketplaceWarehouse && w.acceptsBox && w.fbwFirstLiterRub != null),
    fbwMonopalletAvailable: Boolean(
      !marketplaceWarehouse && w.acceptsMonopallet && w.monopalletFbwFirstLiterRub != null
    ),
    fbsAvailable: w.fbsFirstLiterRub != null,
    profitCalculatorWarehouse: Boolean(w.profitCalculatorWarehouse),
  };
}

export const WB_WAREHOUSES: WbWarehouseOption[] = listWbWarehousesFromTariffs()
  .map(toWarehouseOption)
  .sort((a, b) => a.label.localeCompare(b.label, "ru"));

/** Склады, для которых есть строки в TSV-снапшоте с logistics_box/storage_box. */
export const WB_PROFIT_CALCULATOR_WAREHOUSES: WbWarehouseOption[] = WB_WAREHOUSES.filter(
  (w) => w.profitCalculatorWarehouse
);

export const WB_FBW_WAREHOUSES: WbWarehouseOption[] = WB_WAREHOUSES.filter(
  (w) => w.fbwBoxAvailable || w.fbwMonopalletAvailable
);

export const WB_FBS_WAREHOUSES: WbWarehouseOption[] = WB_WAREHOUSES.filter((w) => w.fbsAvailable);

export function listWbWarehousesForModel(model: "fbw" | "fbs"): WbWarehouseOption[] {
  return model === "fbw" ? WB_FBW_WAREHOUSES : WB_FBS_WAREHOUSES;
}

export function listWbWarehousesForSupplyType(
  supplyType: "box" | "monopallet"
): WbWarehouseOption[] {
  return WB_FBW_WAREHOUSES.filter((w) =>
    supplyType === "monopallet" ? w.fbwMonopalletAvailable : w.fbwBoxAvailable
  );
}

export function defaultWbWarehouseId(model: "fbw" | "fbs"): string {
  const list = listWbWarehousesForModel(model);
  const preferred = list.find((w) => w.id === metaJson.defaultWarehouseId);
  if (preferred) return preferred.id;
  return list[0]?.id ?? metaJson.defaultWarehouseId;
}

export const WB_DEFAULT_CATEGORY_ID = metaJson.defaultCategoryId;
export const WB_DEFAULT_WAREHOUSE_ID = metaJson.defaultWarehouseId;

export function getWbWarehouseLabel(warehouseId: string): string {
  return WB_WAREHOUSES.find((w) => w.id === warehouseId)?.label ?? warehouseId;
}

export function getWbWarehouseShortLabel(warehouseId: string): string {
  return WB_WAREHOUSES.find((w) => w.id === warehouseId)?.shortLabel ?? warehouseId;
}

export function listWbWarehouses(): WbWarehouse[] {
  return listWbWarehousesFromTariffs();
}
