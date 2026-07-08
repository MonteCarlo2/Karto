"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { OzonCategorySearch } from "@/components/unit-economics/ozon-category-search";
import { UnitEconomicsComparisonTable } from "@/components/unit-economics/unit-economics-comparison-table";
import { UnitEconomicsHeader } from "@/components/unit-economics/unit-economics-header";
import { SectionIcon } from "@/components/unit-economics/unit-economics-icons";
import {
  CalculatePrimaryButton,
  FieldLabel,
  FieldStack,
  FormSection,
  MonolithPanel,
  NumberField,
  HandoffSwitch,
  OptionalToggle,
  ParamGrid,
  ParamGridItem,
  ResetSecondaryButton,
  SelectField,
  TabSwitch,
  UE,
} from "@/components/unit-economics/unit-economics-ui";
import {
  WbSupplyTypeCheckboxes,
  WbWarehouseMultiSelect,
} from "@/components/unit-economics/wb-warehouse-multi-select";
import {
  DEFAULT_UNIT_ECON_INPUT,
  defaultCategoryId,
  defaultClusterIds,
  OZON_DELIVERY_CLUSTERS,
  OZON_SHIP_CLUSTERS,
  volumeLitersFromCm,
  ozonBillableLiters,
  wbBillableLiters,
  listWbWarehousesForModel,
  WB_FBW_WAREHOUSES,
  WB_FBS_WAREHOUSES,
  WB_DEFAULT_WAREHOUSE_ID,
  type UnitEconCalculation,
  type UnitEconCalculatorInput,
  type UnitEconFulfillmentResult,
  type UnitEconMarketplace,
  type UnitEconResultLine,
} from "@/lib/unit-economics";

const UNIT_ECON_SESSION_KEY = "karto:unit-economics:session";

type PersistedUnitEconomicsState = {
  input?: Partial<UnitEconCalculatorInput>;
  dimensionMode?: "size" | "volume";
};

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function defaultInputForMarketplace(marketplace: UnitEconMarketplace): UnitEconCalculatorInput {
  const clusters = defaultClusterIds(marketplace);

  if (marketplace === "wildberries") {
    return {
      ...DEFAULT_UNIT_ECON_INPUT,
      marketplace,
      categoryId: defaultCategoryId(marketplace),
      ...clusters,
      buyoutPercent: 87,
      taxMode: "usn6",
      useAdvancedProfitCalc: false,
      wbSalesModel: "fbs",
      wbEnabledFbw: false,
      wbEnabledFbs: true,
      wbFbwSupplyTypes: ["box"],
      wbFbwSupplyType: "box",
      wbFbwWarehouseIds: [],
      wbFbsWarehouseIds: [WB_DEFAULT_WAREHOUSE_ID],
      shipClusterId: WB_DEFAULT_WAREHOUSE_ID,
      deliveryClusterId: WB_DEFAULT_WAREHOUSE_ID,
    };
  }

  return {
    ...DEFAULT_UNIT_ECON_INPUT,
    marketplace,
    categoryId: defaultCategoryId(marketplace),
    ...clusters,
  };
}

function readPersistedUnitEconomicsState(): PersistedUnitEconomicsState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(UNIT_ECON_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedUnitEconomicsState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readInitialInput(): UnitEconCalculatorInput {
  const persisted = readPersistedUnitEconomicsState();
  const marketplace =
    persisted.input?.marketplace === "wildberries" || persisted.input?.marketplace === "ozon"
      ? persisted.input.marketplace
      : DEFAULT_UNIT_ECON_INPUT.marketplace;

  return {
    ...defaultInputForMarketplace(marketplace),
    ...persisted.input,
  };
}

function readInitialDimensionMode(): "size" | "volume" {
  const persisted = readPersistedUnitEconomicsState();
  return persisted.dimensionMode === "volume" ? "volume" : "size";
}

function findResultLine(lines: UnitEconResultLine[], id: string): UnitEconResultLine | undefined {
  for (const line of lines) {
    if (line.id === id) return line;
    const child = line.children ? findResultLine(line.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

function collectResultRows(
  lines: UnitEconResultLine[],
  rows: { id: string; label: string }[] = [],
  depth = 0
): { id: string; label: string }[] {
  for (const line of lines) {
    rows.push({ id: line.id, label: `${"  ".repeat(depth)}${line.label}` });
    if (line.children?.length) collectResultRows(line.children, rows, depth + 1);
  }
  return rows;
}

function csvCell(value: string | number): string {
  const text = String(value).replace(/\r?\n/g, " ");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadResultsCsv(results: UnitEconFulfillmentResult[], productSummary: string): void {
  if (!results.length) return;

  const rows = collectResultRows(results[0].lines);
  const csvRows = [
    ["Статья", ...results.map((result) => result.modelLabel)],
    ...rows.map((row) => [
      row.label,
      ...results.map((result) => {
        const line = findResultLine(result.lines, row.id);
        return line ? `${formatRub(line.amountRub)} (${line.percentOfPrice}%)` : "";
      }),
    ]),
  ];

  const csv = `\uFEFF${csvRows.map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = productSummary.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80) || "unit-economics";
  link.href = url;
  link.download = `${safeName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function UnitEconomicsCalculator() {
  const [input, setInput] = useState<UnitEconCalculatorInput>(DEFAULT_UNIT_ECON_INPUT);
  const [dimensionMode, setDimensionMode] = useState<"size" | "volume">("size");
  const [calculation, setCalculation] = useState<UnitEconCalculation | null>(null);
  const [calcLoading, setCalcLoading] = useState(true);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [stateRestored, setStateRestored] = useState(false);

  const shipClusters =
    input.marketplace === "ozon"
      ? OZON_SHIP_CLUSTERS
      : listWbWarehousesForModel("fbs");

  const wbFbwEnabled = input.wbEnabledFbw ?? false;
  const wbFbsEnabled = input.wbEnabledFbs ?? input.wbSalesModel !== "fbw";
  const wbFbwWarehouseIds = input.wbFbwWarehouseIds ?? [];
  const wbFbsWarehouseIds =
    input.wbFbsWarehouseIds !== undefined
      ? input.wbFbsWarehouseIds
      : [input.shipClusterId || WB_DEFAULT_WAREHOUSE_ID];
  const wbFbwSupplyTypes = input.wbFbwSupplyTypes ?? ["box"];
  const deliveryClusters = OZON_DELIVERY_CLUSTERS;

  const volumeLiters = volumeLitersFromCm(input.lengthCm, input.widthCm, input.heightCm);
  const billableLiters =
    input.marketplace === "ozon"
      ? ozonBillableLiters(volumeLiters, input.weightKg)
      : wbBillableLiters(volumeLiters, input.weightKg);

  useEffect(() => {
    setInput(readInitialInput());
    setDimensionMode(readInitialDimensionMode());
    setStateRestored(true);
  }, []);

  useEffect(() => {
    if (!stateRestored) return;
    try {
      window.sessionStorage.setItem(
        UNIT_ECON_SESSION_KEY,
        JSON.stringify({ input, dimensionMode })
      );
    } catch {
      // Session persistence is a convenience; calculation should never depend on it.
    }
  }, [input, dimensionMode, stateRestored]);

  useEffect(() => {
    if (!stateRestored) return;
    let cancelled = false;
    setCalcLoading(true);
    setCalcError(null);

    const timer = setTimeout(() => {
      fetch("/api/unit-economics/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (!data.success) {
            setCalcError(data.error ?? "Ошибка расчёта");
            return;
          }
          setCalculation(data.result);
        })
        .catch(() => {
          if (!cancelled) setCalcError("Не удалось выполнить расчёт");
        })
        .finally(() => {
          if (!cancelled) setCalcLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [input, stateRestored]);

  const activeCalculation = calculation ?? {
    marketplace: input.marketplace,
    categoryName: "",
    priceRub: input.priceRub,
    volumeLiters,
    billableLiters,
    demoTariffs: input.marketplace !== "ozon",
    results: [],
  };

  const patch = (partial: Partial<UnitEconCalculatorInput>) => {
    setInput((prev) => ({ ...prev, ...partial }));
  };

  const switchMarketplace = (marketplace: UnitEconMarketplace) => {
    const clusters = defaultClusterIds(marketplace);
    setInput((prev) => ({
      ...DEFAULT_UNIT_ECON_INPUT,
      marketplace,
      categoryId: defaultCategoryId(marketplace),
      ...clusters,
      priceRub: prev.priceRub,
      lengthCm: prev.lengthCm,
      widthCm: prev.widthCm,
      heightCm: prev.heightCm,
      weightKg: prev.weightKg,
      costPriceRub: prev.costPriceRub,
      otherCostsRub: prev.otherCostsRub,
      promoSharePercent: prev.promoSharePercent,
      ...(marketplace === "wildberries"
        ? {
            buyoutPercent: 87,
            taxMode: "usn6" as const,
            useAdvancedProfitCalc: false,
            wbSalesModel: "fbs" as const,
            wbEnabledFbw: false,
            wbEnabledFbs: true,
            wbFbwSupplyTypes: ["box"] as const,
            wbFbwSupplyType: "box" as const,
            wbFbwWarehouseIds: [],
            wbFbsWarehouseIds: [WB_DEFAULT_WAREHOUSE_ID],
            shipClusterId: WB_DEFAULT_WAREHOUSE_ID,
            deliveryClusterId: WB_DEFAULT_WAREHOUSE_ID,
          }
        : { buyoutPercent: 90, taxMode: "none" as const }),
    }));
  };

  const reset = () => {
    setInput(defaultInputForMarketplace(input.marketplace));
    setDimensionMode("size");
    setCalculation(null);
    setCalcError(null);
  };

  const comparisonResults = calculation?.results ?? activeCalculation.results;
  const wideResults = comparisonResults.length >= 3;
  const resultsRef = useRef<HTMLDivElement>(null);

  const productSummary =
    activeCalculation.categoryName && activeCalculation.priceRub > 0
      ? `${activeCalculation.categoryName} · ${formatRub(activeCalculation.priceRub)}`
      : "Новый товар";

  const handleCalculate = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!stateRestored) {
    return <div className="min-h-screen" style={{ backgroundColor: UE.pageBg }} />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: UE.pageBg }}>
      <div
        className={`mx-auto px-5 py-8 transition-[max-width] duration-300 sm:px-8 ${
          wideResults ? "max-w-[1680px]" : "max-w-[1440px]"
        }`}
      >
        <UnitEconomicsHeader
          marketplace={input.marketplace}
          onMarketplaceChange={switchMarketplace}
        />

        <div
          className={`grid grid-cols-1 items-start gap-8 ${
            wideResults
              ? "lg:grid-cols-[minmax(520px,520px)_minmax(0,1fr)]"
              : "lg:grid-cols-[1fr_1.1fr]"
          }`}
        >
          {/* Левая колонка — единый монолит */}
          <div>
            <MonolithPanel>
              <FormSection title="Параметры товара" icon={<SectionIcon name="product" />}>
                <FieldStack>
                  <OzonCategorySearch
                    key={input.marketplace}
                    categoryId={input.categoryId}
                    marketplace={input.marketplace}
                    onChange={(categoryId) => patch({ categoryId })}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel>Цена</FieldLabel>
                      <NumberField
                        value={input.priceRub}
                        onChange={(v) => patch({ priceRub: v })}
                        prefix="₽"
                      />
                    </div>
                    <div>
                      <FieldLabel>Вес</FieldLabel>
                      <NumberField
                        value={input.weightKg}
                        onChange={(v) => patch({ weightKg: v })}
                        suffix="кг"
                        step={0.001}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <FieldLabel className="mb-0">Габариты</FieldLabel>
                      <TabSwitch
                        value={dimensionMode}
                        options={[
                          { value: "size", label: "Габариты" },
                          { value: "volume", label: "Объём" },
                        ]}
                        onChange={setDimensionMode}
                      />
                    </div>

                    {dimensionMode === "size" ? (
                      <div className="grid max-w-[88%] grid-cols-3 gap-3">
                        <div>
                          <FieldLabel>Длина</FieldLabel>
                          <NumberField
                            value={input.lengthCm}
                            onChange={(v) => patch({ lengthCm: v })}
                            suffix="см"
                          />
                        </div>
                        <div>
                          <FieldLabel>Ширина</FieldLabel>
                          <NumberField
                            value={input.widthCm}
                            onChange={(v) => patch({ widthCm: v })}
                            suffix="см"
                          />
                        </div>
                        <div>
                          <FieldLabel>Высота</FieldLabel>
                          <NumberField
                            value={input.heightCm}
                            onChange={(v) => patch({ heightCm: v })}
                            suffix="см"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="max-w-[50%]">
                        <NumberField
                          value={volumeLiters}
                          onChange={(v) => {
                            const side = Math.cbrt(Math.max(0, v) * 1000);
                            patch({ lengthCm: side, widthCm: side, heightCm: side });
                          }}
                          suffix="л"
                          step={0.1}
                        />
                      </div>
                    )}

                    <p className="mt-2 text-xs tabular-nums" style={{ color: UE.textMuted }}>
                      Объём {volumeLiters.toFixed(1)} л · расчётный {billableLiters.toFixed(1)} л
                    </p>
                  </div>
                </FieldStack>
              </FormSection>

              <FormSection title="Параметры доставки" icon={<SectionIcon name="delivery" />}>
                {input.marketplace === "ozon" ? (
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <FieldLabel>Кластер отправки</FieldLabel>
                      <SelectField
                        value={input.shipClusterId}
                        onChange={(v) => patch({ shipClusterId: v })}
                      >
                        {shipClusters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div
                      className="mb-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-white"
                      aria-hidden
                    >
                      <ArrowRight className="h-4 w-4" style={{ color: UE.textMuted }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <FieldLabel>Кластер доставки</FieldLabel>
                      <SelectField
                        value={input.deliveryClusterId}
                        onChange={(v) => patch({ deliveryClusterId: v })}
                      >
                        {deliveryClusters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <OptionalToggle
                      label="Склад WB (FBW)"
                      description="Поставка на склад Wildberries — короб и/или монопаллета, сравнение по выбранным складам."
                      checked={wbFbwEnabled}
                      onChange={(checked) =>
                        patch({
                          wbEnabledFbw: checked,
                          ...(checked ? {} : { wbFbwWarehouseIds: [] }),
                        })
                      }
                    >
                      <div className="space-y-4">
                        <div>
                          <FieldLabel>Тип поставки</FieldLabel>
                          <WbSupplyTypeCheckboxes
                            selected={wbFbwSupplyTypes}
                            onChange={(types) =>
                              patch({ wbFbwSupplyTypes: types, wbFbwSupplyType: types[0] })
                            }
                          />
                        </div>
                        <WbWarehouseMultiSelect
                          label="Склады WB"
                          warehouses={WB_FBW_WAREHOUSES}
                          selectedIds={wbFbwWarehouseIds}
                          onChange={(ids) => patch({ wbFbwWarehouseIds: ids })}
                          placeholder="Выберите склад"
                        />
                      </div>
                    </OptionalToggle>

                    <OptionalToggle
                      label="Маркетплейс (FBS)"
                      description="Отгрузка на склад маркетплейса — можно сравнить несколько городов и срок доставки."
                      checked={wbFbsEnabled}
                      onChange={(checked) =>
                        patch({
                          wbEnabledFbs: checked,
                          ...(checked ? {} : { wbFbsWarehouseIds: [] }),
                        })
                      }
                    >
                      <div className="space-y-4">
                        <WbWarehouseMultiSelect
                          label="Склады маркетплейса"
                          warehouses={WB_FBS_WAREHOUSES}
                          selectedIds={wbFbsWarehouseIds}
                          onChange={(ids) => patch({ wbFbsWarehouseIds: ids })}
                          placeholder="Выберите склад"
                        />
                        <div>
                          <FieldLabel>За сколько часов довезёте товар до склада WB</FieldLabel>
                          <input
                            type="range"
                            min={30}
                            max={72}
                            step={1}
                            value={input.wbFbsDeliveryHours ?? 30}
                            onChange={(e) =>
                              patch({ wbFbsDeliveryHours: Number(e.target.value) })
                            }
                            className="mt-2 w-full accent-[#1F4E3D]"
                          />
                          <div
                            className="mt-1 flex justify-between text-xs tabular-nums"
                            style={{ color: UE.textMuted }}
                          >
                            <span>30 ч</span>
                            <span className="font-semibold text-base" style={{ color: UE.text }}>
                              {input.wbFbsDeliveryHours ?? 30} ч
                            </span>
                            <span>72 ч</span>
                          </div>
                          <p className="mt-2 text-xs leading-relaxed" style={{ color: UE.textMuted }}>
                            Комиссия FBS: +0,1 п.п. за каждый час после 30 ч.
                          </p>
                        </div>
                      </div>
                    </OptionalToggle>

                    <div className="mt-2">
                      <OptionalToggle
                        label="Индексы локализации и распределения продаж"
                        description="Как в калькуляторе WB с ИЛ/ИРП. Без галочки — расчёт без индексов (ИЛ=1, ИРП=0)."
                        checked={Boolean(input.wbUseLocalizationIndices)}
                        onChange={(checked) =>
                          patch({
                            wbUseLocalizationIndices: checked,
                            wbLocalizationSharePercent: checked
                              ? (input.wbLocalizationSharePercent ?? 60)
                              : null,
                          })
                        }
                      >
                        <ParamGrid cols={1}>
                          <ParamGridItem label="Доля локальных заказов">
                            <NumberField
                              value={input.wbLocalizationSharePercent ?? 0}
                              onChange={(v) =>
                                patch({
                                  wbLocalizationSharePercent: Math.min(100, Math.max(0, v)),
                                })
                              }
                              suffix="%"
                            />
                          </ParamGridItem>
                        </ParamGrid>
                      </OptionalToggle>
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection title="Параметры отгрузки" icon={<SectionIcon name="shipment" />}>
                {input.marketplace === "ozon" ? (
                  <div>
                    <FieldLabel>Способ передачи</FieldLabel>
                    <HandoffSwitch
                      value={input.shipmentHandoff}
                      options={[
                        { value: "pickup_point", label: "В пункте приёма" },
                        { value: "courier", label: "Курьеру Ozon" },
                      ]}
                      onChange={(v) =>
                        patch({ shipmentHandoff: v as UnitEconCalculatorInput["shipmentHandoff"] })
                      }
                    />
                  </div>
                ) : (
                  <ParamGrid cols={2}>
                    <ParamGridItem
                      label="Отправлений в одной отгрузке"
                      span={2}
                    >
                      <NumberField
                        value={input.shipmentsInBatch}
                        onChange={(v) => patch({ shipmentsInBatch: Math.max(1, Math.round(v)) })}
                        suffix="шт"
                        step={1}
                      />
                    </ParamGridItem>
                  </ParamGrid>
                )}
              </FormSection>

              <FormSection title="Расчёт чистой прибыли" icon={<SectionIcon name="profit" />} last>
                <FieldStack className="space-y-4">
                  {input.marketplace === "wildberries" ? (
                    <>
                      <ParamGrid cols={2}>
                        <ParamGridItem label="Оборачиваемость, дни">
                          <NumberField
                            value={input.wbTurnoverDays ?? 32}
                            onChange={(v) => patch({ wbTurnoverDays: Math.max(0, Math.round(v)) })}
                            suffix="дн"
                            step={1}
                          />
                          {wbFbwEnabled && !wbFbsEnabled ? null : wbFbsEnabled && !wbFbwEnabled ? (
                            <p className="mt-1 text-xs" style={{ color: UE.textMuted }}>
                              Для FBS хранение на складе WB не считается.
                            </p>
                          ) : (
                            <p className="mt-1 text-xs" style={{ color: UE.textMuted }}>
                              Для FBS не применяется; для FBW влияет на хранение.
                            </p>
                          )}
                        </ParamGridItem>
                        <ParamGridItem label="Доля выкупа">
                          <NumberField
                            value={input.buyoutPercent}
                            onChange={(v) =>
                              patch({ buyoutPercent: Math.min(100, Math.max(1, v)) })
                            }
                            suffix="%"
                          />
                        </ParamGridItem>
                        <ParamGridItem label="Себестоимость товара">
                          <NumberField
                            value={input.costPriceRub}
                            onChange={(v) => patch({ costPriceRub: v })}
                            prefix="₽"
                          />
                        </ParamGridItem>
                        <ParamGridItem label="Доля расходов на продвижение">
                          <NumberField
                            value={input.promoSharePercent}
                            onChange={(v) => patch({ promoSharePercent: v })}
                            suffix="%"
                          />
                        </ParamGridItem>
                        <ParamGridItem label="Налогообложение" span={2}>
                          <SelectField
                            value={input.taxMode}
                            onChange={(v) =>
                              patch({ taxMode: v as UnitEconCalculatorInput["taxMode"] })
                            }
                          >
                            <option value="usn6">УСН «Доходы» — 6%</option>
                            <option value="usn15">УСН «Доходы минус расходы» — 15%</option>
                            <option value="usn25">УСН «Доходы» — 25%</option>
                            <option value="none">Не учитывать</option>
                          </SelectField>
                        </ParamGridItem>
                      </ParamGrid>
                    </>
                  ) : (
                    <OptionalToggle
                      label="Доля выкупа, налог, себестоимость и прочее"
                      description="Расширенный расчёт: выкуп влияет на обратную логистику. В среднем по Ozon ~90%, у каждого продавца свой показатель."
                      checked={Boolean(input.useAdvancedProfitCalc)}
                      onChange={(checked) => patch({ useAdvancedProfitCalc: checked })}
                    >
                      <ParamGrid cols={2}>
                        <ParamGridItem label="Выкуп">
                          <NumberField
                            value={input.buyoutPercent}
                            onChange={(v) =>
                              patch({ buyoutPercent: Math.min(100, Math.max(1, v)) })
                            }
                            suffix="%"
                          />
                        </ParamGridItem>
                        <ParamGridItem label="Налог на прибыль">
                          <SelectField
                            value={String(input.profitTaxPercent ?? 0)}
                            onChange={(v) =>
                              patch({
                                profitTaxPercent: Number(v) as UnitEconCalculatorInput["profitTaxPercent"],
                              })
                            }
                          >
                            <option value="0">0%</option>
                            <option value="4">4%</option>
                            <option value="6">6%</option>
                            <option value="8">8%</option>
                            <option value="15">15%</option>
                            <option value="25">25%</option>
                          </SelectField>
                        </ParamGridItem>
                        <ParamGridItem label="Себестоимость товара">
                          <NumberField
                            value={input.costPriceRub}
                            onChange={(v) => patch({ costPriceRub: v })}
                            prefix="₽"
                          />
                        </ParamGridItem>
                        <ParamGridItem label="Маркетинг и прочие затраты">
                          <NumberField
                            value={input.otherCostsRub}
                            onChange={(v) => patch({ otherCostsRub: v })}
                            prefix="₽"
                          />
                        </ParamGridItem>
                      </ParamGrid>
                    </OptionalToggle>
                  )}

                  {input.marketplace === "ozon" ? (
                    <OptionalToggle
                      label="Обработка грузоместа FBS"
                      description="Тариф на короб или палету — дополнительно к базовому калькулятору."
                      checked={Boolean(input.useFbsCargoUnit)}
                      onChange={(checked) => patch({ useFbsCargoUnit: checked })}
                    >
                      <ParamGrid cols={2}>
                        <ParamGridItem label="Грузоместо">
                          <SelectField
                            value={input.fbsCargoUnitType ?? "box"}
                            onChange={(v) =>
                              patch({
                                fbsCargoUnitType: v as UnitEconCalculatorInput["fbsCargoUnitType"],
                              })
                            }
                          >
                            <option value="box">Короб — 80 ₽</option>
                            <option value="pallet">Палета — 175 ₽</option>
                          </SelectField>
                        </ParamGridItem>
                        <ParamGridItem label="Отправлений в отгрузке">
                          <NumberField
                            value={input.shipmentsInBatch}
                            onChange={(v) =>
                              patch({ shipmentsInBatch: Math.max(1, Math.round(v)) })
                            }
                            suffix="шт"
                            step={1}
                          />
                        </ParamGridItem>
                      </ParamGrid>
                    </OptionalToggle>
                  ) : null}
                </FieldStack>
              </FormSection>
            </MonolithPanel>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-3">
              <CalculatePrimaryButton onClick={handleCalculate} />
              <ResetSecondaryButton onClick={reset} />
            </div>
          </div>

          {/* Правая колонка — sticky монолит */}
          <div ref={resultsRef} className="sticky top-[24px] min-w-0 self-start">
            <MonolithPanel variant="results">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold" style={{ color: UE.text }}>
                    Расчёт прибыли и затрат
                  </h2>
                  <p className="mt-1.5 text-lg font-semibold tabular-nums" style={{ color: UE.text }}>
                    {productSummary}
                  </p>
                  <p
                    className={`mt-1 min-h-[20px] text-sm transition-opacity duration-150 ${
                      calcLoading || calcError ? "opacity-100" : "opacity-0"
                    } ${calcError ? "text-red-600" : ""}`}
                    style={{ color: calcError ? undefined : UE.textMuted }}
                  >
                    {calcError
                      ? calcError
                      : input.marketplace === "ozon"
                        ? "Считаем по тарифам Ozon…"
                        : "Считаем по тарифам Wildberries…"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadResultsCsv(comparisonResults, productSummary)}
                  disabled={!comparisonResults.length}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-black/10 bg-white text-black/70 shadow-[0_6px_18px_-12px_rgba(0,0,0,0.35)] transition hover:border-black/20 hover:bg-black/[0.03] hover:text-black disabled:pointer-events-none disabled:opacity-35 active:scale-[0.96]"
                  aria-label="Скачать таблицу"
                  title="Скачать таблицу"
                >
                  <Download className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </button>
              </div>

              {calculation?.results.length ? (
                <UnitEconomicsComparisonTable
                  results={comparisonResults}
                  marketplace={input.marketplace}
                />
              ) : (
                <p
                  className="rounded-[12px] border border-dashed border-black/10 bg-white/50 px-4 py-8 text-center text-sm leading-relaxed"
                  style={{ color: UE.textMuted }}
                >
                  {calcLoading
                    ? "Загрузка расчёта…"
                    : input.marketplace === "wildberries"
                      ? "Включите FBW и/или FBS, выберите склады и тип поставки — таблица появится здесь."
                      : "Укажите параметры товара для расчёта."}
                </p>
              )}
            </MonolithPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
