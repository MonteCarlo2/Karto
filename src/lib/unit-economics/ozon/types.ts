export type OzonCommissionTier = [number, number, number];

export type OzonCategoryItem = {
  id: string;
  parentName: string;
  categoryName: string;
  name: string;
  label: string;
  commissionFbo: OzonCommissionTier;
  commissionFbs: OzonCommissionTier;
};

export type OzonVolumeBand = {
  id: number;
  label: string;
  minLiters: number;
  maxLiters: number;
};

export type OzonLogisticsRate = {
  ship: string;
  delivery: string;
  bandId: number;
  under300: number;
  over300: number;
};

export type OzonDefaultLogisticsRate = {
  bandId: number;
  under300: number;
  over300: number;
};

export type OzonFbsProcessingFees = {
  effectiveFrom: string;
  pickupPerShipment: number;
  dropoffScTrust: number;
  dropoffScPiece: number;
  dropoffPvz: number;
  dropoffScTable: number;
};

export type OzonFbsCargoUnitFees = {
  effectiveFrom: string;
  boxRub: number;
  palletRub: number;
};

export type OzonTariffMeta = {
  commissionsEffectiveFrom: string;
  logisticsEffectiveFrom: string;
  commissionSource: string;
  logisticsSource: string;
  categoryCount: number;
  shipClusters: string[];
  deliveryClusters: string[];
  defaultCategoryId: string;
  defaultShipCluster: string;
  defaultDeliveryCluster: string;
  acquiringPercentDefault: number;
  deliveryToPickupMaxRub: number;
  deliveryToPickupEffectiveFrom: string;
  fbsProcessing: OzonFbsProcessingFees;
  fbsCargoUnit: OzonFbsCargoUnitFees;
};

export type OzonLogisticsBreakdown = {
  routeLogisticsRub: number;
  deliveryToPickupRub: number;
  reversePerReturnRub: number;
  expectedReverseRub: number;
  totalExpectedRub: number;
  usedDefaultTariff: boolean;
};
