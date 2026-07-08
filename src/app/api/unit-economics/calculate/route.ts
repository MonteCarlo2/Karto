import { NextResponse } from "next/server";
import {
  calculateUnitEconomics,
  DEFAULT_UNIT_ECON_INPUT,
  defaultCategoryId,
  defaultClusterIds,
  resolveCategoryId,
  type UnitEconCalculatorInput,
} from "@/lib/unit-economics/server";

/** POST: расчёт юнит-экономики (пока demo-тарифы; позже — категории из Supabase). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<UnitEconCalculatorInput>;
    const marketplace = body.marketplace === "wildberries" ? "wildberries" : "ozon";
    const clusters = defaultClusterIds(marketplace);
    const categoryId = resolveCategoryId(
      marketplace,
      String(body.categoryId ?? defaultCategoryId(marketplace))
    );

    const input: UnitEconCalculatorInput = {
      ...DEFAULT_UNIT_ECON_INPUT,
      marketplace,
      categoryId,
      priceRub: Number(body.priceRub) || 0,
      lengthCm: Number(body.lengthCm) || 0,
      widthCm: Number(body.widthCm) || 0,
      heightCm: Number(body.heightCm) || 0,
      weightKg: Number(body.weightKg) || 0,
      costPriceRub: Number(body.costPriceRub) || 0,
      taxMode:
        body.taxMode === "usn6" ||
        body.taxMode === "usn15" ||
        body.taxMode === "usn25" ||
        body.taxMode === "none"
          ? body.taxMode
          : "none",
      buyoutPercent: Number(body.buyoutPercent) || 90,
      otherCostsRub: Number(body.otherCostsRub) || 0,
      promoSharePercent: Number(body.promoSharePercent) || 0,
      shipClusterId: String(body.shipClusterId ?? clusters.shipClusterId),
      deliveryClusterId: String(body.deliveryClusterId ?? clusters.deliveryClusterId),
      shipmentHandoff:
        body.shipmentHandoff === "courier" ? "courier" : DEFAULT_UNIT_ECON_INPUT.shipmentHandoff,
      pickupPointType:
        body.pickupPointType === "sort_center" ? "sort_center" : DEFAULT_UNIT_ECON_INPUT.pickupPointType,
      acceptanceType: body.acceptanceType === "mix" ? "mix" : DEFAULT_UNIT_ECON_INPUT.acceptanceType,
      shipmentsInBatch: Math.max(1, Number(body.shipmentsInBatch) || 1),
      fbsCargoUnitType: body.fbsCargoUnitType === "pallet" ? "pallet" : "box",
      useAdvancedProfitCalc: Boolean(body.useAdvancedProfitCalc),
      profitTaxPercent: [0, 4, 6, 8, 15, 25].includes(Number(body.profitTaxPercent))
        ? (Number(body.profitTaxPercent) as 0 | 4 | 6 | 8 | 15 | 25)
        : 0,
      useFbsCargoUnit: Boolean(body.useFbsCargoUnit),
      wbUseLocalizationIndices: Boolean(body.wbUseLocalizationIndices),
      wbLocalizationSharePercent:
        body.wbUseLocalizationIndices && body.wbLocalizationSharePercent != null
          ? Math.max(0, Math.min(100, Number(body.wbLocalizationSharePercent)))
          : null,
      wbFbsDeliveryHours: Math.min(
        72,
        Math.max(30, Math.round(Number(body.wbFbsDeliveryHours) || 30))
      ),
      wbTurnoverDays: Math.max(0, Math.round(Number(body.wbTurnoverDays) || 32)),
      wbSalesModel: body.wbSalesModel === "fbw" ? "fbw" : "fbs",
      wbEnabledFbw: body.wbEnabledFbw != null ? Boolean(body.wbEnabledFbw) : false,
      wbEnabledFbs: body.wbEnabledFbs != null ? Boolean(body.wbEnabledFbs) : body.wbSalesModel !== "fbw",
      wbFbwWarehouseIds: Array.isArray(body.wbFbwWarehouseIds)
        ? body.wbFbwWarehouseIds.map(String)
        : undefined,
      wbFbsWarehouseIds: Array.isArray(body.wbFbsWarehouseIds)
        ? body.wbFbsWarehouseIds.map(String)
        : undefined,
      wbFbwSupplyTypes: Array.isArray(body.wbFbwSupplyTypes)
        ? body.wbFbwSupplyTypes.filter((t): t is "box" | "monopallet" => t === "box" || t === "monopallet")
        : undefined,
      wbFbwSupplyType: body.wbFbwSupplyType === "monopallet" ? "monopallet" : "box",
    };
    const result = calculateUnitEconomics(input);
    return NextResponse.json({ success: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка расчёта";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
