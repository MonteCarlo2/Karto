export type UnitEconMarketplace = "ozon" | "wildberries";

export type OzonFulfillment = "fbo" | "fbs";
export type WbFulfillment = "fbw" | "fbs";

export type UnitEconTaxMode = "none" | "usn6" | "usn15" | "usn25";

/** Налог на прибыль в расширенном расчёте Ozon, %. */
export type OzonProfitTaxPercent = 0 | 4 | 6 | 8 | 15 | 25;

export type ShipmentHandoff = "pickup_point" | "courier";
export type PickupPointType = "pvz" | "sort_center";
export type AcceptanceType = "mono" | "mix";

export type UnitEconCategory = {
  id: string;
  marketplace: UnitEconMarketplace;
  name: string;
  parentName?: string;
  /** Комиссия маркетплейса, % от цены продажи */
  commissionPercent: number;
};

export type UnitEconCalculatorInput = {
  marketplace: UnitEconMarketplace;
  categoryId: string;
  priceRub: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  costPriceRub: number;
  taxMode: UnitEconTaxMode;
  /** Доля выкупа, % (100 = без возвратов) */
  buyoutPercent: number;
  /** Прочие расходы на единицу, ₽ */
  otherCostsRub: number;
  /** Доля расходов на продвижение, % от цены (WB) */
  promoSharePercent: number;
  /** Кластер отправки */
  shipClusterId: string;
  /** Кластер доставки */
  deliveryClusterId: string;
  /** Ozon: в пункте приёма / курьеру */
  shipmentHandoff: ShipmentHandoff;
  pickupPointType: PickupPointType;
  acceptanceType: AcceptanceType;
  /** Отправления в одной отгрузке, шт */
  shipmentsInBatch: number;
  /** Ozon FBS: тип грузоместа для тарифа обработки */
  fbsCargoUnitType?: "box" | "pallet";
  /** Расширенный расчёт: выкуп, налог, себестоимость (как блок «чистая прибыль» у Ozon). */
  useAdvancedProfitCalc?: boolean;
  /** Налог на прибыль, % — только при useAdvancedProfitCalc */
  profitTaxPercent?: OzonProfitTaxPercent;
  /** Учитывать обработку грузоместа FBS (короб/палета). */
  useFbsCargoUnit?: boolean;
  /** WB: доля локальных заказов, % (null/undefined = расчёт без ИЛ/ИРП). */
  wbLocalizationSharePercent?: number | null;
  /** WB: учитывать индексы локализации и распределения продаж. */
  wbUseLocalizationIndices?: boolean;
  /** WB FBS: за сколько часов довезёте товар до склада (30–72). Влияет на комиссию FBS. */
  wbFbsDeliveryHours?: number;
  /** WB FBW: оборачиваемость остатков, дни (хранение). */
  wbTurnoverDays?: number;
  /** @deprecated Используйте wbEnabledFbw / wbEnabledFbs. */
  wbSalesModel?: WbFulfillment;
  /** WB: включить расчёт FBW (склад WB). */
  wbEnabledFbw?: boolean;
  /** WB: включить расчёт FBS (маркетплейс). */
  wbEnabledFbs?: boolean;
  /** WB FBW: склады для сравнения. */
  wbFbwWarehouseIds?: string[];
  /** WB FBS: склады маркетплейса для сравнения. */
  wbFbsWarehouseIds?: string[];
  /** WB FBW: типы поставки (можно оба сразу). */
  wbFbwSupplyTypes?: ("box" | "monopallet")[];
  /** @deprecated Используйте wbFbwSupplyTypes. */
  wbFbwSupplyType?: "box" | "monopallet";
};

export type UnitEconResultLine = {
  id: string;
  label: string;
  amountRub: number;
  percentOfPrice: number;
  tone: "neutral" | "deduction" | "payout" | "profit" | "loss";
  children?: UnitEconResultLine[];
};

export type UnitEconFulfillmentResult = {
  model: OzonFulfillment | WbFulfillment;
  modelLabel: string;
  lines: UnitEconResultLine[];
  mpCostsRub: number;
  payoutRub: number;
  profitRub: number | null;
  marginPercent: number | null;
  roiPercent: number | null;
};

export type UnitEconCalculation = {
  marketplace: UnitEconMarketplace;
  categoryName: string;
  priceRub: number;
  volumeLiters: number;
  billableLiters: number;
  results: UnitEconFulfillmentResult[];
  demoTariffs: boolean;
  tariffsMeta?: {
    commissionsEffectiveFrom: string;
    logisticsEffectiveFrom: string;
  };
};
