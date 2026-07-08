import { ozonWholeRub } from "../formulas";
import { ozonTariffMeta } from "./tariffs";
import { lookupOzonLogisticsRate, resolveOzonVolumeBandId } from "./tariffs";
import type { OzonLogisticsBreakdown } from "./types";

export function calculateOzonLogistics(params: {
  model: "fbo" | "fbs";
  shipCluster: string;
  deliveryCluster: string;
  billableLiters: number;
  priceRub: number;
  buyoutPercent: number;
}): OzonLogisticsBreakdown {
  const buyoutFactor = Math.max(0, Math.min(1, params.buyoutPercent / 100));
  const bandId = resolveOzonVolumeBandId(params.billableLiters);

  const forward = lookupOzonLogisticsRate(
    params.shipCluster,
    params.deliveryCluster,
    bandId,
    params.priceRub
  );
  const local = lookupOzonLogisticsRate(
    params.shipCluster,
    params.shipCluster,
    bandId,
    params.priceRub
  );

  const routeLogisticsRub =
    params.model === "fbo" ? forward.rate : local.rate;
  const deliveryToPickupRub = ozonTariffMeta.deliveryToPickupMaxRub ?? 25;
  const reversePerReturnRub = local.rate + deliveryToPickupRub;
  const expectedReverseRub = (1 - buyoutFactor) * reversePerReturnRub;
  const totalExpectedRub = routeLogisticsRub + deliveryToPickupRub + expectedReverseRub;

  return {
    routeLogisticsRub,
    deliveryToPickupRub,
    reversePerReturnRub,
    expectedReverseRub,
    totalExpectedRub,
    usedDefaultTariff: forward.usedDefault || local.usedDefault,
  };
}

export function ozonLogisticsLineRub(breakdown: OzonLogisticsBreakdown): number {
  return ozonWholeRub(
    breakdown.routeLogisticsRub +
      breakdown.deliveryToPickupRub +
      breakdown.expectedReverseRub
  );
}
