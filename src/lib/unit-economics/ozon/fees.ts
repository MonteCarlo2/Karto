import { ozonTariffMeta } from "./tariffs";
import type { AcceptanceType, PickupPointType, ShipmentHandoff } from "../types";

export type FbsCargoUnitType = "box" | "pallet";

export function fbsShipmentProcessingRub(params: {
  shipmentHandoff: ShipmentHandoff;
  pickupPointType: PickupPointType;
  acceptanceType: AcceptanceType;
}): number {
  const fees = ozonTariffMeta.fbsProcessing;
  if (params.shipmentHandoff === "courier") {
    return fees.pickupPerShipment;
  }
  if (params.pickupPointType === "pvz") {
    return fees.dropoffPvz;
  }
  return params.acceptanceType === "mono" ? fees.dropoffScTrust : fees.dropoffScPiece;
}

export function fbsCargoUnitProcessingRub(params: {
  cargoUnitType: FbsCargoUnitType;
  shipmentsInBatch: number;
}): number {
  const fees = ozonTariffMeta.fbsCargoUnit;
  const base = params.cargoUnitType === "pallet" ? fees.palletRub : fees.boxRub;
  const batch = Math.max(1, params.shipmentsInBatch);
  return base / batch;
}
