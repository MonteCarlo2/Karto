export type WbCategoryItem = {
  id: string;
  parentName: string;
  categoryName: string;
  name: string;
  label: string;
  commissionFbw: number;
  commissionFbs: number;
};

export type WbTariffMeta = {
  commissionsEffectiveFrom: string;
  commissionSource: string;
  categoryCount: number;
  logisticsEffectiveFrom: string | null;
  logisticsSource: string | null;
  defaultCategoryId: string;
  defaultWarehouseId: string;
  acquiringIncludedInCommission: boolean;
  models: {
    fbw: { label: string; description: string };
    fbs: { label: string; description: string };
  };
};

export type WbFbwSupplyType = "box" | "monopallet";

export type WbWarehouse = {
  id: string;
  label: string;
  logisticsCoef?: number;
  firstLiterRub?: number;
  additionalLiterRub?: number;
  fbwFirstLiterRub?: number | null;
  fbwAdditionalLiterRub?: number | null;
  fbsFirstLiterRub?: number | null;
  fbsAdditionalLiterRub?: number | null;
  fbwCoefPercent?: number | null;
  fbsCoefPercent?: number | null;
  storageCoefPercent?: number | null;
  storageFirstLiterDayRub?: number | null;
  storageAdditionalLiterDayRub?: number | null;
  storageBoxDayMultiplier?: number | null;
  monopalletFbwFirstLiterRub?: number | null;
  monopalletFbwAdditionalLiterRub?: number | null;
  monopalletFbwCoefPercent?: number | null;
  monopalletStorageCoefPercent?: number | null;
  monopalletStorageFirstPalletDayRub?: number | null;
  acceptanceBoxRub?: number | null;
  acceptanceMonopalletRubPerLiter?: number | null;
  acceptsBox?: boolean;
  acceptsMonopallet?: boolean;
  profitCalculatorWarehouse?: boolean;
  logisticsBoxScaled?: number | null;
  hasKorobaStorageTariff?: boolean;
  customerReturnRub?: number;
  returnToSellerPvzFirstRub?: number;
  returnToSellerPvzAdditionalRub?: number;
  returnUnclaimedRub?: number;
};

export type WbLocalizationBracket = {
  minShare: number;
  maxShare: number;
  localizationIndex: number;
  salesDistributionPercent: number;
  storageCoefPercent: number;
};

export type WbLogisticsResult = {
  /** Логистика до клиента (для FBS — с учётом доли выкупа). */
  logisticsRub: number;
  logisticsFromClientRub?: number;
  forwardRub?: number;
  storageRub: number;
  acceptanceRub: number;
  expectedReverseRub: number;
  usedDefault: boolean;
  localizationIndex?: number;
  salesDistributionPercent?: number;
};
