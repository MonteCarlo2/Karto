import {
  percentOf,
  roundRub,
  taxAmountRub,
  volumeLitersFromCm,
  wbBillableLiters,
} from "./formulas";
import { calculateWbLogistics, wbLogisticsLineRub, wbMpCostsLineRub } from "./wb/logistics";
import {
  resolveWbCalculatorInput,
  resolveWbScenarios,
  type WbResolvedScenario,
} from "./wb/resolve-input";
import {
  getWbCategoryById,
  getWbCategoryLabel,
  getWbCommissionPercent,
  wbTariffMeta,
} from "./wb/tariffs";
import { getWbFbsCommissionWithDelivery } from "./wb/fbs-delivery-commission";
import { getWbWarehouseShortLabel } from "./wb-meta";
import type {
  UnitEconCalculatorInput,
  UnitEconCalculation,
  UnitEconFulfillmentResult,
  UnitEconResultLine,
  WbFulfillment,
} from "./types";

function scenarioLabel(scenario: WbResolvedScenario): string {
  const wh = getWbWarehouseShortLabel(scenario.warehouseId);
  if (scenario.model === "fbs") {
    return wh;
  }
  const supply = scenario.supplyType === "monopallet" ? "Монопаллета" : "Короб";
  return `${wh} · ${supply}`;
}

function buildWbResultLines(
  input: UnitEconCalculatorInput,
  params: {
    model: WbFulfillment;
    modelLabel: string;
    commissionPercent: number;
    billableLiters: number;
    warehouseId: string;
    supplyType?: "box" | "monopallet";
  }
): UnitEconFulfillmentResult {
  const price = Math.max(0, input.priceRub);
  const commission = roundRub(price * (params.commissionPercent / 100));

  const logistics = calculateWbLogistics({
    model: params.model,
    warehouseId: params.warehouseId,
    billableLiters: params.billableLiters,
    priceRub: price,
    buyoutPercent: input.buyoutPercent,
    turnoverDays: params.model === "fbw" ? input.wbTurnoverDays : undefined,
    localizationSharePercent: input.wbLocalizationSharePercent,
    supplyType: params.supplyType,
  });

  const logisticsTotal = wbLogisticsLineRub(logistics);
  const mpCosts = wbMpCostsLineRub(commission, logistics);
  const payout = roundRub(price - mpCosts);
  const promoShareRub = roundRub(price * (Math.max(0, input.promoSharePercent) / 100));
  const costPriceRub = Math.max(0, input.costPriceRub);
  const otherCostsRub = Math.max(0, input.otherCostsRub);

  const logisticsChildren: UnitEconResultLine[] = [
    {
      id: "logistics-to-client",
      label: "Логистика до клиента",
      amountRub: -logistics.logisticsRub,
      percentOfPrice: percentOf(price, logistics.logisticsRub),
      tone: "deduction",
    },
    {
      id: "logistics-from-client",
      label: "Логистика от клиента",
      amountRub: -(logistics.logisticsFromClientRub ?? 0),
      percentOfPrice: percentOf(price, logistics.logisticsFromClientRub ?? 0),
      tone: "deduction",
    },
    {
      id: "logistics-storage",
      label: "Хранение",
      amountRub: -logistics.storageRub,
      percentOfPrice: percentOf(price, logistics.storageRub),
      tone: "deduction",
    },
    {
      id: "logistics-acceptance",
      label: "Приёмка",
      amountRub: -logistics.acceptanceRub,
      percentOfPrice: percentOf(price, logistics.acceptanceRub),
      tone: "deduction",
    },
  ];

  const profitBeforeTax = payout - costPriceRub - otherCostsRub - promoShareRub;
  const taxRub = taxAmountRub(input.taxMode, price, profitBeforeTax);
  const totalExpensesRub = roundRub(mpCosts + taxRub + costPriceRub + otherCostsRub + promoShareRub);
  const profitRub = roundRub(price - totalExpensesRub);
  const marginPercent = price > 0 ? roundRub((profitRub / price) * 100) : 0;
  const invested = costPriceRub + otherCostsRub + promoShareRub;
  const roiPercent = invested > 0 ? roundRub((profitRub / invested) * 100) : null;

  const lines: UnitEconResultLine[] = [
    {
      id: "price",
      label: "Цена товара",
      amountRub: price,
      percentOfPrice: 100,
      tone: "neutral",
    },
    {
      id: "mp-costs",
      label: "Расходы на WB",
      amountRub: -mpCosts,
      percentOfPrice: percentOf(price, mpCosts),
      tone: "deduction",
      children: [
        {
          id: "commission",
          label: "Комиссия",
          amountRub: -commission,
          percentOfPrice: percentOf(price, commission),
          tone: "deduction",
        },
        {
          id: "logistics",
          label: "Логистика",
          amountRub: -logisticsTotal,
          percentOfPrice: percentOf(price, logisticsTotal),
          tone: "deduction",
          children: logisticsChildren,
        },
      ],
    },
    {
      id: "payout",
      label: "К переводу за товар",
      amountRub: payout,
      percentOfPrice: percentOf(price, payout),
      tone: payout >= 0 ? "payout" : "loss",
    },
  ];

  if (promoShareRub > 0) {
    lines.push({
      id: "promo",
      label: "Продвижение",
      amountRub: -promoShareRub,
      percentOfPrice: percentOf(price, promoShareRub),
      tone: "deduction",
    });
  }

  if (costPriceRub > 0) {
    lines.push({
      id: "cost",
      label: "Себестоимость",
      amountRub: -costPriceRub,
      percentOfPrice: percentOf(price, costPriceRub),
      tone: "deduction",
    });
  }

  if (otherCostsRub > 0) {
    lines.push({
      id: "other-costs",
      label: "Прочие расходы",
      amountRub: -otherCostsRub,
      percentOfPrice: percentOf(price, otherCostsRub),
      tone: "deduction",
    });
  }

  if (taxRub > 0) {
    lines.push({
      id: "taxes",
      label: "Налоги",
      amountRub: -taxRub,
      percentOfPrice: percentOf(price, taxRub),
      tone: "deduction",
    });
  }

  lines.push({
    id: "total-expenses",
    label: "Всего расходов",
    amountRub: -totalExpensesRub,
    percentOfPrice: percentOf(price, totalExpensesRub),
    tone: "deduction",
  });

  lines.push({
    id: "profit",
    label: "Прибыль",
    amountRub: profitRub,
    percentOfPrice: marginPercent,
    tone: profitRub >= 0 ? "profit" : "loss",
  });

  return {
    model: params.model,
    modelLabel: params.modelLabel,
    lines,
    mpCostsRub: mpCosts,
    payoutRub: payout,
    profitRub,
    marginPercent,
    roiPercent,
  };
}

function buildScenarioResult(
  input: UnitEconCalculatorInput,
  scenario: WbResolvedScenario,
  billableLiters: number,
  categoryCommissionFbw: number,
  categoryCommissionFbs: number
): UnitEconFulfillmentResult {
  const label = scenarioLabel(scenario);

  if (scenario.model === "fbw") {
    return buildWbResultLines(input, {
      model: "fbw",
      modelLabel: `FBW · ${label}`,
      commissionPercent: categoryCommissionFbw,
      billableLiters,
      warehouseId: scenario.warehouseId,
      supplyType: scenario.supplyType ?? "box",
    });
  }

  const fbsCommission = getWbFbsCommissionWithDelivery(
    categoryCommissionFbs,
    scenario.deliveryHours ?? input.wbFbsDeliveryHours ?? 30
  );

  return buildWbResultLines(input, {
    model: "fbs",
    modelLabel: `FBS · ${label}`,
    commissionPercent: fbsCommission,
    billableLiters,
    warehouseId: scenario.warehouseId,
  });
}

export function calculateWbUnitEconomics(rawInput: UnitEconCalculatorInput): UnitEconCalculation {
  const input = resolveWbCalculatorInput(rawInput);
  const category = getWbCategoryById(input.categoryId);
  const volumeLiters = volumeLitersFromCm(input.lengthCm, input.widthCm, input.heightCm);
  const billableLiters = wbBillableLiters(volumeLiters, input.weightKg);
  const priceRub = Math.max(0, input.priceRub);

  const fbwCommission = getWbCommissionPercent(category, "fbw");
  const fbsBaseCommission = getWbCommissionPercent(category, "fbs");
  const scenarios = resolveWbScenarios(input);

  const results = scenarios.map((scenario) =>
    buildScenarioResult(input, scenario, billableLiters, fbwCommission, fbsBaseCommission)
  );

  return {
    marketplace: "wildberries",
    categoryName: category?.name ?? getWbCategoryLabel(input.categoryId),
    priceRub,
    volumeLiters,
    billableLiters,
    demoTariffs: !wbTariffMeta.logisticsSource,
    tariffsMeta: {
      commissionsEffectiveFrom: wbTariffMeta.commissionsEffectiveFrom,
      logisticsEffectiveFrom: wbTariffMeta.logisticsEffectiveFrom ?? "—",
    },
    results,
  };
}
