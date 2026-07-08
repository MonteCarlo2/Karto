import type { AcceptanceType, PickupPointType, ShipmentHandoff } from "./types";

export type UnitEconCluster = {
  id: string;
  label: string;
  /** Множитель логистики (демо до Excel). */
  logisticsFactor: number;
};

export const WB_SHIP_CLUSTERS: UnitEconCluster[] = [
  { id: "kol", label: "Коледино", logisticsFactor: 1 },
  { id: "pod", label: "Подольск", logisticsFactor: 0.98 },
  { id: "kzn", label: "Казань", logisticsFactor: 1.05 },
  { id: "krk", label: "Краснодар", logisticsFactor: 1.07 },
  { id: "ekb", label: "Екатеринбург", logisticsFactor: 1.1 },
];

export const WB_DELIVERY_CLUSTERS: UnitEconCluster[] = [
  { id: "central", label: "Центральный", logisticsFactor: 1 },
  { id: "nw", label: "Северо-Запад", logisticsFactor: 1.04 },
  { id: "volga", label: "Приволжский", logisticsFactor: 1.06 },
  { id: "south", label: "Южный", logisticsFactor: 1.08 },
  { id: "ural", label: "Уральский", logisticsFactor: 1.11 },
];

export function clusterLogisticsMultiplier(
  shipClusterId: string,
  deliveryClusterId: string,
  shipClusters: UnitEconCluster[],
  deliveryClusters: UnitEconCluster[]
): number {  const ship = shipClusters.find((c) => c.id === shipClusterId)?.logisticsFactor ?? 1;
  const delivery = deliveryClusters.find((c) => c.id === deliveryClusterId)?.logisticsFactor ?? 1;
  return round3((ship + delivery) / 2);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function shipmentHandoffFactor(handoff: ShipmentHandoff): number {
  return handoff === "courier" ? 1.08 : 1;
}

export function pickupPointFactor(type: PickupPointType): number {
  return type === "sort_center" ? 0.96 : 1;
}

export function acceptanceFactor(type: AcceptanceType): number {
  return type === "mono" ? 0.98 : 1;
}

export function batchShipmentFactor(count: number): number {
  if (count <= 1) return 1;
  if (count <= 5) return 0.97;
  if (count <= 15) return 0.94;
  return 0.91;
}
