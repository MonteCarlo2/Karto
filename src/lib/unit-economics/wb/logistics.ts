import { roundRub } from "../formulas";
import {
  WB_DEFAULT_IRP_HIGH_COEF_PERCENT,
  WB_DEFAULT_IRP_PERCENT,
  WB_DEFAULT_MONOPALLET_ACCEPTANCE_PER_LITER,
  WB_HIGH_LOGISTICS_COEF_PERCENT,
  WB_MONOPALLET_ACCEPTANCE_UNIT_LITERS,
  WB_MONOPALLET_STORAGE_CAPACITY_LITERS,
  WB_REVERSE_ADDITIONAL_LITER_RUB,
  WB_REVERSE_FIRST_LITER_RUB,
  WB_REVERSE_LOGISTICS_CAP_RUB,
  WB_REVERSE_LOGISTICS_MIN_RUB,
  WB_REVERSE_LOGISTICS_WAREHOUSE_DIVISOR,
  WB_STORAGE_COEF_HIGH_PERCENT,
  WB_STORAGE_COEF_MID_PERCENT,
  WB_STORAGE_LOGISTICS_BOX_DIVISOR,
} from "./fbw-constants";
import {
  getWbWarehouse,
  lookupWbLocalizationBracket,
  wbLogisticsBaseRates,
} from "./tariffs";
import type { WbFbwSupplyType, WbLogisticsResult, WbWarehouse } from "./types";

const WB_STORAGE_COEF_DIVISOR = 146.5;
const WB_BASE_STORAGE_FIRST_LITER_DAY_RUB = 0.13;
const WB_FBS_MARKETPLACE_LOGISTICS_FACTOR = 0.6097;

function billableExtraLiters(billableLiters: number): number {
  return Math.max(0, Math.max(1, billableLiters) - 1);
}

function resolveFbwCoefPercent(warehouse: WbWarehouse | undefined): number {
  return (
    warehouse?.fbwCoefPercent ??
    warehouse?.monopalletFbwCoefPercent ??
    warehouse?.fbsCoefPercent ??
    100
  );
}

function defaultIrpPercent(warehouse: WbWarehouse | undefined): number {
  const fbwCoef = resolveFbwCoefPercent(warehouse);
  return fbwCoef >= WB_HIGH_LOGISTICS_COEF_PERCENT
    ? WB_DEFAULT_IRP_HIGH_COEF_PERCENT
    : WB_DEFAULT_IRP_PERCENT;
}

function modelRates(
  warehouseId: string,
  model: "fbw" | "fbs",
  supplyType: WbFbwSupplyType = "box"
): { firstLiterRub: number; additionalLiterRub: number } {
  const warehouse = getWbWarehouse(warehouseId);

  if (model === "fbs") {
    return {
      firstLiterRub: warehouse?.fbsFirstLiterRub ?? warehouse?.firstLiterRub ?? wbLogisticsBaseRates.firstLiterRub,
      additionalLiterRub:
        warehouse?.fbsAdditionalLiterRub ??
        warehouse?.additionalLiterRub ??
        wbLogisticsBaseRates.additionalLiterRub,
    };
  }

  if (supplyType === "monopallet") {
    return {
      firstLiterRub:
        warehouse?.monopalletFbwFirstLiterRub ??
        warehouse?.fbwFirstLiterRub ??
        warehouse?.firstLiterRub ??
        wbLogisticsBaseRates.firstLiterRub,
      additionalLiterRub:
        warehouse?.monopalletFbwAdditionalLiterRub ??
        warehouse?.fbwAdditionalLiterRub ??
        warehouse?.additionalLiterRub ??
        wbLogisticsBaseRates.additionalLiterRub,
    };
  }

  if (supplyType === "box" && warehouse?.logisticsBoxScaled != null) {
    return {
      firstLiterRub: roundRub((warehouse.logisticsBoxScaled * wbLogisticsBaseRates.firstLiterRub) / 1000),
      additionalLiterRub: roundRub(
        (warehouse.logisticsBoxScaled * wbLogisticsBaseRates.additionalLiterRub) / 1000
      ),
    };
  }

  return {
    firstLiterRub: warehouse?.fbwFirstLiterRub ?? warehouse?.firstLiterRub ?? wbLogisticsBaseRates.firstLiterRub,
    additionalLiterRub:
      warehouse?.fbwAdditionalLiterRub ??
      warehouse?.additionalLiterRub ??
      wbLogisticsBaseRates.additionalLiterRub,
  };
}

/** FBW короб: при разных коэф. FBW/FBS логистика до клиента ниже, чем у монопаллеты. */
export function calculateWbFbwBoxLogisticsToClientRub(params: {
  warehouseId: string;
  forwardRub: number;
  priceRub: number;
  buyoutPercent: number;
  localizationSharePercent?: number | null;
}): number {
  const warehouse = getWbWarehouse(params.warehouseId);
  const fbwCoef = warehouse?.fbwCoefPercent ?? warehouse?.fbsCoefPercent ?? 100;
  const fbsCoef = warehouse?.fbsCoefPercent ?? fbwCoef;
  const buyoutFactor = Math.max(0.01, Math.min(1, params.buyoutPercent / 100));
  const coefSpread = Math.max(0, fbsCoef - fbwCoef);

  if (warehouse?.logisticsBoxScaled != null) {
    return roundRub(params.forwardRub / buyoutFactor);
  }

  if (coefSpread > 0) {
    const adjustedForward =
      params.forwardRub * (fbwCoef / (fbwCoef + 1.5 * coefSpread));
    return roundRub(adjustedForward);
  }

  const irpPercent =
    params.localizationSharePercent == null
      ? defaultIrpPercent(warehouse)
      : lookupWbLocalizationBracket(params.localizationSharePercent)?.salesDistributionPercent ??
        defaultIrpPercent(warehouse);
  const forwardWithIrp =
    params.forwardRub + Math.max(0, params.priceRub) * (irpPercent / 100);
  return roundRub(forwardWithIrp / buyoutFactor);
}

/** FBW монопаллета: max(короб, моно) forward; при коэф. FBW ≥ 200% — × coef / 230 / buyout, иначе / buyout. */
export function calculateWbFbwMonopalletLogisticsToClientRub(params: {
  warehouseId: string;
  forwardRub: number;
  boxForwardRub: number;
  buyoutPercent: number;
}): number {
  const warehouse = getWbWarehouse(params.warehouseId);
  const fbwCoef = resolveFbwCoefPercent(warehouse);
  const monopalletCoef = warehouse?.monopalletFbwCoefPercent ?? fbwCoef;
  const buyoutFactor = Math.max(0.01, Math.min(1, params.buyoutPercent / 100));
  const useBoxForwardForMono =
    Boolean(warehouse?.logisticsBoxScaled) && !warehouse?.hasKorobaStorageTariff;
  const forwardRub = useBoxForwardForMono
    ? Math.max(params.forwardRub, params.boxForwardRub)
    : params.forwardRub;

  if (fbwCoef >= WB_HIGH_LOGISTICS_COEF_PERCENT && monopalletCoef > fbwCoef) {
    return roundRub((forwardRub * fbwCoef) / WB_REVERSE_LOGISTICS_CAP_RUB / buyoutFactor);
  }

  return roundRub(forwardRub / buyoutFactor);
}

export function calculateWbForwardLogisticsRub(params: {
  model: "fbw" | "fbs";
  warehouseId: string;
  billableLiters: number;
  priceRub?: number;
  localizationSharePercent?: number | null;
  supplyType?: WbFbwSupplyType;
}): number {
  const { firstLiterRub, additionalLiterRub } = modelRates(
    params.warehouseId,
    params.model,
    params.supplyType ?? "box"
  );
  const extra = billableExtraLiters(params.billableLiters);
  const volumePart = firstLiterRub + extra * additionalLiterRub;

  const bracket = lookupWbLocalizationBracket(params.localizationSharePercent);
  const localizationIndex = bracket?.localizationIndex ?? 1;
  const salesDistributionPercent = bracket?.salesDistributionPercent ?? 0;
  const price = Math.max(0, params.priceRub ?? 0);

  return roundRub(volumePart * localizationIndex + price * (salesDistributionPercent / 100));
}

export function calculateWbCustomerReturnRub(params: {
  warehouseId: string;
  billableLiters: number;
}): number {
  const warehouse = getWbWarehouse(params.warehouseId);
  const extra = billableExtraLiters(params.billableLiters);
  const volumeReturn = WB_REVERSE_FIRST_LITER_RUB + extra * WB_REVERSE_ADDITIONAL_LITER_RUB;
  const warehouseCoefPercent = resolveFbwCoefPercent(warehouse);
  const scaled = (volumeReturn * warehouseCoefPercent) / WB_REVERSE_LOGISTICS_WAREHOUSE_DIVISOR;
  return roundRub(
    Math.max(
      WB_REVERSE_LOGISTICS_MIN_RUB,
      Math.min(WB_REVERSE_LOGISTICS_CAP_RUB, scaled)
    )
  );
}

function calculateWbBoxStorageRub(params: {
  warehouse: WbWarehouse;
  billableLiters: number;
  days: number;
  localizationStorageMultiplier: number;
}): number {
  const { warehouse, billableLiters, days, localizationStorageMultiplier } = params;
  const firstRate = warehouse.storageFirstLiterDayRub;
  const additionalRate = warehouse.storageAdditionalLiterDayRub ?? firstRate;
  if (!firstRate) return 0;

  const liters = Math.max(1, billableLiters);
  const extra = billableExtraLiters(liters);
  const base = (firstRate + (additionalRate ?? 0) * extra) * days * localizationStorageMultiplier;
  const storageCoef = warehouse.storageCoefPercent ?? 100;

  if (warehouse.storageBoxDayMultiplier) {
    return roundRub(warehouse.storageBoxDayMultiplier * days * localizationStorageMultiplier);
  }

  if (warehouse.hasKorobaStorageTariff) {
    if (storageCoef >= WB_STORAGE_COEF_HIGH_PERCENT) {
      return roundRub(base * (storageCoef / WB_STORAGE_COEF_DIVISOR));
    }

    if (
      storageCoef >= WB_STORAGE_COEF_MID_PERCENT &&
      warehouse.logisticsBoxScaled != null
    ) {
      const fbwCoef = warehouse.fbwCoefPercent ?? 100;
      return roundRub(
        (warehouse.logisticsBoxScaled *
          WB_BASE_STORAGE_FIRST_LITER_DAY_RUB *
          liters *
          days *
          localizationStorageMultiplier *
          WB_REVERSE_LOGISTICS_WAREHOUSE_DIVISOR) /
          (WB_STORAGE_LOGISTICS_BOX_DIVISOR * fbwCoef)
      );
    }

    if (storageCoef >= 150) {
      return roundRub(base * (storageCoef / WB_STORAGE_COEF_DIVISOR));
    }
  }

  if (storageCoef >= 150) {
    return roundRub(base * (storageCoef / WB_STORAGE_COEF_DIVISOR));
  }

  const boxMultiplier = warehouse.storageBoxDayMultiplier ?? 1;
  return roundRub(base * boxMultiplier);
}

export function calculateWbStorageRub(params: {
  warehouseId: string;
  billableLiters: number;
  turnoverDays?: number;
  localizationSharePercent?: number | null;
  supplyType?: WbFbwSupplyType;
}): number {
  const warehouse = getWbWarehouse(params.warehouseId);
  const days = Math.max(0, params.turnoverDays ?? 0);
  if (days <= 0 || !warehouse) return 0;

  const bracket = lookupWbLocalizationBracket(params.localizationSharePercent);
  const localizationStorageMultiplier = (bracket?.storageCoefPercent ?? 100) / 100;

  if (params.supplyType === "monopallet") {
    const palletRate = warehouse.monopalletStorageFirstPalletDayRub;
    if (!palletRate) return 0;
    const liters = Math.max(0.01, params.billableLiters);
    const share = liters / WB_MONOPALLET_STORAGE_CAPACITY_LITERS;
    return roundRub(palletRate * days * share * localizationStorageMultiplier);
  }

  return calculateWbBoxStorageRub({
    warehouse,
    billableLiters: params.billableLiters,
    days,
    localizationStorageMultiplier,
  });
}

export function calculateWbAcceptanceRub(params: {
  warehouseId: string;
  billableLiters: number;
  supplyType?: WbFbwSupplyType;
}): number {
  const warehouse = getWbWarehouse(params.warehouseId);
  if (!warehouse) return 0;

  const liters = Math.max(0.01, params.billableLiters);

  if (params.supplyType === "monopallet") {
    const perLiter =
      warehouse.acceptanceMonopalletRubPerLiter || WB_DEFAULT_MONOPALLET_ACCEPTANCE_PER_LITER;
    return roundRub((perLiter * liters) / WB_MONOPALLET_ACCEPTANCE_UNIT_LITERS);
  }

  const boxRate = warehouse.acceptanceBoxRub;
  if (!boxRate) return 0;
  return roundRub((boxRate * liters) / WB_MONOPALLET_ACCEPTANCE_UNIT_LITERS);
}

/** FBS: логистика маркетплейс-доставки, калибрована по официальному калькулятору WB. */
export function calculateWbFbsLogisticsToClientRub(
  forwardRub: number
): number {
  return roundRub(forwardRub * WB_FBS_MARKETPLACE_LOGISTICS_FACTOR);
}

export function calculateWbLogistics(params: {
  model: "fbw" | "fbs";
  warehouseId: string;
  billableLiters: number;
  priceRub: number;
  buyoutPercent: number;
  turnoverDays?: number;
  localizationSharePercent?: number | null;
  supplyType?: WbFbwSupplyType;
}): WbLogisticsResult {
  const buyoutFactor = Math.max(0, Math.min(1, params.buyoutPercent / 100));
  const supplyType = params.model === "fbw" ? params.supplyType ?? "box" : undefined;
  const forwardRub = calculateWbForwardLogisticsRub({
    model: params.model,
    warehouseId: params.warehouseId,
    billableLiters: params.billableLiters,
    priceRub: params.priceRub,
    localizationSharePercent: params.localizationSharePercent,
    supplyType,
  });
  const boxForwardRub =
    params.model === "fbw" && supplyType === "monopallet"
      ? calculateWbForwardLogisticsRub({
          model: params.model,
          warehouseId: params.warehouseId,
          billableLiters: params.billableLiters,
          priceRub: params.priceRub,
          localizationSharePercent: params.localizationSharePercent,
          supplyType: "box",
        })
      : forwardRub;

  const logisticsToClientRub =
    params.model === "fbw" && supplyType === "box"
      ? calculateWbFbwBoxLogisticsToClientRub({
          warehouseId: params.warehouseId,
          forwardRub,
          priceRub: params.priceRub,
          buyoutPercent: params.buyoutPercent,
          localizationSharePercent: params.localizationSharePercent,
        })
      : params.model === "fbw" && supplyType === "monopallet"
        ? calculateWbFbwMonopalletLogisticsToClientRub({
            warehouseId: params.warehouseId,
            forwardRub,
            boxForwardRub,
            buyoutPercent: params.buyoutPercent,
          })
        : calculateWbFbsLogisticsToClientRub(forwardRub);

  const reversePerReturnRub = calculateWbCustomerReturnRub({
    warehouseId: params.warehouseId,
    billableLiters: params.billableLiters,
  });
  const expectedReverseRub =
    params.model === "fbs"
      ? 0
      : roundRub((1 - buyoutFactor) * reversePerReturnRub);

  const storageRub =
    params.model === "fbw"
      ? calculateWbStorageRub({
          warehouseId: params.warehouseId,
          billableLiters: params.billableLiters,
          turnoverDays: params.turnoverDays,
          localizationSharePercent: params.localizationSharePercent,
          supplyType,
        })
      : 0;

  const acceptanceRub =
    params.model === "fbw"
      ? calculateWbAcceptanceRub({
          warehouseId: params.warehouseId,
          billableLiters: params.billableLiters,
          supplyType,
        })
      : 0;

  const warehouse = getWbWarehouse(params.warehouseId);
  const bracket = lookupWbLocalizationBracket(params.localizationSharePercent);

  return {
    logisticsRub: logisticsToClientRub,
    logisticsFromClientRub: expectedReverseRub,
    forwardRub,
    storageRub,
    acceptanceRub,
    expectedReverseRub,
    usedDefault: !warehouse,
    localizationIndex: bracket?.localizationIndex ?? 1,
    salesDistributionPercent: bracket?.salesDistributionPercent ?? 0,
  };
}

export function wbLogisticsLineRub(result: WbLogisticsResult): number {
  return roundRub(
    result.logisticsRub + result.storageRub + result.acceptanceRub + (result.logisticsFromClientRub ?? 0)
  );
}

export function wbMpCostsLineRub(commissionRub: number, logistics: WbLogisticsResult): number {
  return roundRub(commissionRub + wbLogisticsLineRub(logistics));
}
