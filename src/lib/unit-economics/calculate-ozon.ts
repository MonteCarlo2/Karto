import {
  ozonAcquiringRub,
  ozonBillableLiters,
  ozonCommissionRub,
  ozonWholeRub,
  percentOf,
  roundRub,
  volumeLitersFromCm,
} from "./formulas";
import { fbsCargoUnitProcessingRub, fbsShipmentProcessingRub } from "./ozon/fees";
import { calculateOzonLogistics, ozonLogisticsLineRub } from "./ozon/logistics";
import { resolveOzonBuyoutPercent, resolveOzonCalculatorInput } from "./ozon/resolve-input";
import {
  getOzonCategoryById,
  getOzonCategoryLabel,
  getOzonCommissionPercent,
  ozonTariffMeta,
} from "./ozon/tariffs";
import type {
  UnitEconCalculatorInput,
  UnitEconCalculation,
  UnitEconFulfillmentResult,
  UnitEconResultLine,
} from "./types";

function ozonProfitTaxRub(profitBeforeTaxRub: number, profitTaxPercent: number): number {
  if (profitTaxPercent <= 0 || profitBeforeTaxRub <= 0) return 0;
  return ozonWholeRub(profitBeforeTaxRub * (profitTaxPercent / 100));
}

function buildProfitMetrics(
  input: UnitEconCalculatorInput,
  priceRub: number,
  payoutRub: number,
  promoShareRub: number
): Pick<UnitEconFulfillmentResult, "profitRub" | "marginPercent" | "roiPercent"> {
  if (!input.useAdvancedProfitCalc) {
    return { profitRub: null, marginPercent: null, roiPercent: null };
  }

  const costPriceRub = input.costPriceRub;
  const otherCostsRub = input.otherCostsRub;
  const profitTaxPercent = input.profitTaxPercent ?? 0;

  if (costPriceRub <= 0 && otherCostsRub <= 0 && profitTaxPercent <= 0 && promoShareRub <= 0) {
    return { profitRub: null, marginPercent: null, roiPercent: null };
  }

  const profitBeforeTax = payoutRub - costPriceRub - otherCostsRub - promoShareRub;
  const tax = ozonProfitTaxRub(profitBeforeTax, profitTaxPercent);
  const profit = roundRub(profitBeforeTax - tax);
  const margin = priceRub > 0 ? roundRub((profit / priceRub) * 100) : 0;
  const invested = costPriceRub + otherCostsRub + promoShareRub;
  const roi = invested > 0 ? roundRub((profit / invested) * 100) : null;

  return { profitRub: profit, marginPercent: margin, roiPercent: roi };
}

function calcOzonModel(
  input: UnitEconCalculatorInput,
  model: "fbo" | "fbs",
  modelLabel: string,
  commissionPercent: number,
  billableLiters: number
): UnitEconFulfillmentResult {
  const price = Math.max(0, input.priceRub);
  const commission = ozonCommissionRub(price, commissionPercent);
  const acquiring = ozonAcquiringRub(price);

  const logistics = calculateOzonLogistics({
    model,
    shipCluster: input.shipClusterId,
    deliveryCluster: input.deliveryClusterId,
    billableLiters,
    priceRub: price,
    buyoutPercent: resolveOzonBuyoutPercent(input),
  });

  const fbsShipmentFee =
    model === "fbs"
      ? ozonWholeRub(
          fbsShipmentProcessingRub({
            shipmentHandoff: input.shipmentHandoff,
            pickupPointType: input.pickupPointType,
            acceptanceType: input.acceptanceType,
          })
        )
      : 0;

  const fbsCargoFee =
    model === "fbs" && input.useFbsCargoUnit
      ? ozonWholeRub(
          fbsCargoUnitProcessingRub({
            cargoUnitType: input.fbsCargoUnitType ?? "box",
            shipmentsInBatch: input.shipmentsInBatch,
          })
        )
      : 0;

  const logisticsLineRub = ozonLogisticsLineRub(logistics);
  const processingAndDelivery = ozonWholeRub(logisticsLineRub + fbsShipmentFee + fbsCargoFee);
  const mpCosts = ozonWholeRub(commission + acquiring + processingAndDelivery);
  const payout = ozonWholeRub(price - mpCosts);
  const promoShareRub = roundRub(price * (Math.max(0, input.promoSharePercent) / 100));

  const logisticsChildren: UnitEconResultLine[] = [
    {
      id: "fbs-shipment-processing",
      label: "Обработка отправления",
      amountRub: model === "fbs" && fbsShipmentFee > 0 ? -fbsShipmentFee : 0,
      percentOfPrice: percentOf(price, model === "fbs" ? fbsShipmentFee : 0),
      tone: "deduction",
    },
    {
      id: "logistics-route",
      label: "Логистика",
      amountRub: -ozonWholeRub(logistics.routeLogisticsRub),
      percentOfPrice: percentOf(price, logistics.routeLogisticsRub),
      tone: "deduction",
    },
    {
      id: "logistics-delivery-pickup",
      label: "Доставка до места выдачи",
      amountRub: -ozonWholeRub(logistics.deliveryToPickupRub),
      percentOfPrice: percentOf(price, logistics.deliveryToPickupRub),
      tone: "deduction",
    },
  ];

  if (input.useAdvancedProfitCalc && logistics.expectedReverseRub > 0) {
    logisticsChildren.push({
      id: "logistics-reverse",
      label: "Обратная логистика",
      amountRub: -ozonWholeRub(logistics.expectedReverseRub),
      percentOfPrice: percentOf(price, logistics.expectedReverseRub),
      tone: "deduction",
    });
  }

  if (model === "fbs" && fbsCargoFee > 0) {
    logisticsChildren.push({
      id: "fbs-cargo-unit",
      label: "Обработка грузоместа FBS",
      amountRub: -fbsCargoFee,
      percentOfPrice: percentOf(price, fbsCargoFee),
      tone: "deduction",
    });
  }

  const logisticsLine: UnitEconResultLine = {
    id: "logistics",
    label: "Обработка и доставка",
    amountRub: -processingAndDelivery,
    percentOfPrice: percentOf(price, processingAndDelivery),
    tone: "deduction",
    children: logisticsChildren.filter(
      (line) =>
        line.id !== "logistics-reverse" ||
        (input.useAdvancedProfitCalc && logistics.expectedReverseRub > 0)
    ).filter((line) => line.id !== "fbs-cargo-unit" || fbsCargoFee > 0),
  };

  const lines: UnitEconResultLine[] = [
    {
      id: "price",
      label: "Цена товара",
      amountRub: price,
      percentOfPrice: 100,
      tone: "neutral",
    },
    {
      id: "commission",
      label: "Вознаграждение Ozon",
      amountRub: -commission,
      percentOfPrice: percentOf(price, commission),
      tone: "deduction",
    },
    {
      id: "acquiring",
      label: "Эквайринг",
      amountRub: -acquiring,
      percentOfPrice: percentOf(price, acquiring),
      tone: "deduction",
    },
    logisticsLine,
    {
      id: "mp-total",
      label: "Затраты на Ozon за шт.",
      amountRub: -mpCosts,
      percentOfPrice: percentOf(price, mpCosts),
      tone: "deduction",
    },
    {
      id: "payout",
      label: "К начислению за товар",
      amountRub: payout,
      percentOfPrice: percentOf(price, payout),
      tone: payout >= 0 ? "payout" : "loss",
    },
  ];

  const profitMetrics = buildProfitMetrics(input, price, payout, promoShareRub);

  if (profitMetrics.profitRub != null) {
    lines.push({
      id: "profit",
      label: "Чистая прибыль",
      amountRub: profitMetrics.profitRub,
      percentOfPrice: profitMetrics.marginPercent ?? 0,
      tone: profitMetrics.profitRub >= 0 ? "profit" : "loss",
    });
  }

  return {
    model,
    modelLabel,
    lines,
    mpCostsRub: mpCosts,
    payoutRub: payout,
    ...profitMetrics,
  };
}

export function calculateOzonUnitEconomics(rawInput: UnitEconCalculatorInput): UnitEconCalculation {
  const input = resolveOzonCalculatorInput(rawInput);
  const category = getOzonCategoryById(input.categoryId);
  const volumeLiters = volumeLitersFromCm(input.lengthCm, input.widthCm, input.heightCm);
  const billableLiters = ozonBillableLiters(volumeLiters, input.weightKg);
  const priceRub = Math.max(0, input.priceRub);

  const fboCommission = getOzonCommissionPercent(category, "fbo", priceRub);
  const fbsCommission = getOzonCommissionPercent(category, "fbs", priceRub);

  return {
    marketplace: "ozon",
    categoryName: category?.name ?? getOzonCategoryLabel(input.categoryId),
    priceRub,
    volumeLiters,
    billableLiters,
    demoTariffs: false,
    tariffsMeta: {
      commissionsEffectiveFrom: ozonTariffMeta.commissionsEffectiveFrom,
      logisticsEffectiveFrom: ozonTariffMeta.logisticsEffectiveFrom,
    },
    results: [
      calcOzonModel(input, "fbo", "FBO", fboCommission, billableLiters),
      calcOzonModel(input, "fbs", "FBS", fbsCommission, billableLiters),
    ],
  };
}
