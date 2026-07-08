"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type {
  UnitEconFulfillmentResult,
  UnitEconMarketplace,
  UnitEconResultLine,
} from "@/lib/unit-economics";
import { UE } from "@/components/unit-economics/unit-economics-ui";
import { cn } from "@/lib/utils";

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function isDeductionLine(line: UnitEconResultLine): boolean {
  return (
    line.tone === "deduction" ||
    (line.amountRub < 0 && !["payout", "profit"].includes(line.id))
  );
}

function isPayoutLine(line: UnitEconResultLine): boolean {
  return line.id === "payout" || line.tone === "payout";
}

function isProfitLine(line: UnitEconResultLine): boolean {
  return line.id === "profit" || line.tone === "profit";
}

function barTrackColor(line: UnitEconResultLine, marketplace: UnitEconMarketplace): string {
  if (isPayoutLine(line)) return "rgba(0, 176, 80, 0.12)";
  if (isProfitLine(line)) return "rgba(0, 176, 80, 0.1)";
  if (isDeductionLine(line)) {
    return marketplace === "ozon" ? "rgba(0, 91, 255, 0.12)" : "rgba(203, 17, 171, 0.12)";
  }
  if (line.id === "price") return "rgba(0, 0, 0, 0.06)";
  return "#EEEEEE";
}

function barFillColor(
  line: UnitEconResultLine,
  rowHovered: boolean,
  marketplace: UnitEconMarketplace
): string {
  if (isPayoutLine(line) || isProfitLine(line)) {
    return line.amountRub >= 0 ? UE.greenPayout : UE.loss;
  }
  if (line.tone === "loss") return UE.loss;
  if (rowHovered && isDeductionLine(line)) return UE.lime;
  if (isDeductionLine(line)) {
    return marketplace === "ozon" ? "rgba(0, 91, 255, 0.65)" : "rgba(203, 17, 171, 0.65)";
  }
  if (line.id === "price") return "#D1D5DB";
  return UE.costBar;
}

function ResultBar({
  line,
  rowHovered,
  marketplace,
}: {
  line: UnitEconResultLine;
  rowHovered: boolean;
  marketplace: UnitEconMarketplace;
}) {
  const width = Math.min(100, Math.max(0, Math.abs(line.percentOfPrice)));
  const highlight = isPayoutLine(line) || isProfitLine(line);

  return (
    <div
      className={cn(
        "mt-1 overflow-hidden rounded-[2px] transition-colors duration-200",
        highlight ? "h-2" : "h-1.5"
      )}
      style={{ backgroundColor: barTrackColor(line, marketplace) }}
    >
      <motion.div
        initial={false}
        animate={{
          width: `${width}%`,
          backgroundColor: barFillColor(line, rowHovered, marketplace),
        }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="h-full rounded-[2px]"
      />
    </div>
  );
}

function findLine(lines: UnitEconResultLine[], id: string): UnitEconResultLine | undefined {
  for (const line of lines) {
    if (line.id === id) return line;
    if (line.children) {
      const child = findLine(line.children, id);
      if (child) return child;
    }
  }
  return undefined;
}

function amountClass(line: UnitEconResultLine): string {
  if (line.id === "payout" || line.id === "profit") {
    return line.amountRub >= 0 ? "font-bold" : "font-bold text-red-600";
  }
  if (line.tone === "loss") return "font-semibold text-red-600";
  if (line.id === "total-expenses") return "font-semibold";
  return "font-semibold text-black/85";
}

function amountStyle(line: UnitEconResultLine): React.CSSProperties | undefined {
  if ((line.id === "payout" || line.id === "profit") && line.amountRub >= 0) {
    return { color: UE.greenPayout };
  }
  return undefined;
}

function ExpandToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="mt-0.5 flex shrink-0 items-center justify-center p-0 transition hover:opacity-75 active:scale-[0.97]"
    >
      <ChevronDown
        className={cn("h-5 w-5 text-[#005BFF] transition-transform duration-200", open ? "" : "-rotate-90")}
        strokeWidth={3}
      />
    </button>
  );
}

function SchemeCell({
  line,
  rowHovered,
  marketplace,
  highlight = false,
}: {
  line: UnitEconResultLine | undefined;
  rowHovered: boolean;
  marketplace: UnitEconMarketplace;
  highlight?: boolean;
}) {
  if (!line) {
    return <div className="text-right text-base tabular-nums text-black/25">—</div>;
  }

  return (
    <div className="min-w-0 text-right">
      <div
        className={cn(
          "tabular-nums leading-none",
          highlight ? "text-lg" : "text-base",
          amountClass(line)
        )}
        style={amountStyle(line)}
      >
        {line.amountRub < 0 ? "−" : ""}
        {formatRub(Math.abs(line.amountRub))}
      </div>
      <div
        className={cn(
          "mt-1 tabular-nums leading-none",
          highlight ? "text-sm font-semibold" : "text-xs font-medium"
        )}
        style={amountStyle(line) ?? { color: UE.textMuted }}
      >
        {formatPercent(Math.abs(line.percentOfPrice))}
      </div>
      <ResultBar line={line} rowHovered={rowHovered} marketplace={marketplace} />
    </div>
  );
}

function buildRowOrder(marketplace: UnitEconMarketplace): string[] {
  if (marketplace === "ozon") {
    return [
      "price",
      "commission",
      "acquiring",
      "logistics",
      "mp-total",
      "promo",
      "cost",
      "other-costs",
      "taxes",
      "total-expenses",
      "payout",
      "profit",
    ];
  }

  return ["price", "mp-costs", "payout", "promo", "cost", "other-costs", "taxes", "total-expenses", "profit"];
}

function gridTemplateColumns(columnCount: number): string {
  if (columnCount <= 0) return "minmax(0, 1fr)";
  const dataCol =
    columnCount <= 4 ? "minmax(136px, 1fr)" : "minmax(136px, 152px)";
  return `minmax(180px, 1.25fr) ${Array(columnCount).fill(dataCol).join(" ")}`;
}

function ComparisonRow({
  label,
  lineId,
  results,
  marketplace,
  depth = 0,
  defaultOpen = false,
  highlight = false,
}: {
  label: string;
  lineId: string;
  results: UnitEconFulfillmentResult[];
  marketplace: UnitEconMarketplace;
  depth?: number;
  defaultOpen?: boolean;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);
  const linesPerResult = results.map((r) => findLine(r.lines, lineId));
  const line = linesPerResult.find(Boolean);
  const childIds = line?.children?.map((c) => c.id) ?? [];
  const expandable = childIds.length > 0;
  const isDeductionRow =
    !highlight &&
    lineId !== "price" &&
    linesPerResult.some((l) => l && isDeductionLine(l));

  const gridCols = gridTemplateColumns(results.length);

  return (
    <>
      <div
        className={cn(
          "grid items-start gap-x-4 border-b border-[#F0F0F0] px-0.5",
          highlight ? "py-4" : depth > 0 ? "py-2" : "py-2.5",
          isDeductionRow && "hover:bg-[#FAFAF8]",
          highlight &&
            lineId === "payout" &&
            "rounded-lg bg-gradient-to-r from-[#00B050]/10 via-[#B9FF4B]/12 to-transparent",
          highlight &&
            lineId === "profit" &&
            "rounded-lg bg-gradient-to-r from-[#00B050]/8 via-transparent to-transparent"
        )}
        style={{
          ...(depth > 0 ? { backgroundColor: "#FAFAFA" } : {}),
          gridTemplateColumns: gridCols,
        }}
        onMouseEnter={() => isDeductionRow && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className="flex min-w-0 items-start gap-2"
          style={{ paddingLeft: depth > 0 ? 28 + (depth - 1) * 10 : 0 }}
        >
          {expandable ? (
            <ExpandToggle open={open} onClick={() => setOpen((v) => !v)} />
          ) : depth === 0 ? (
            <span className="inline-block w-5 shrink-0" aria-hidden />
          ) : (
            <span className="inline-block w-5 shrink-0" />
          )}
          <span
            className={cn(
              "min-w-0 leading-snug",
              highlight
                ? "pt-0.5 text-base font-bold text-black"
                : depth > 0
                  ? "pt-0.5 text-sm font-medium text-black/65"
                  : "pt-0.5 text-base font-medium text-black/85"
            )}
          >
            {label}
          </span>
        </div>
        {linesPerResult.map((resultLine, index) => (
          <SchemeCell
            key={`${lineId}-${index}`}
            line={resultLine}
            rowHovered={hovered}
            marketplace={marketplace}
            highlight={highlight}
          />
        ))}
      </div>
      {expandable && open
        ? childIds.map((childId) => {
            const childLine = line?.children?.find((c) => c.id === childId);
            return (
              <ComparisonRow
                key={childId}
                label={childLine?.label ?? childId}
                lineId={childId}
                results={results}
                marketplace={marketplace}
                depth={depth + 1}
              />
            );
          })
        : null}
    </>
  );
}

export function UnitEconomicsComparisonTable({
  results,
  marketplace,
}: {
  results: UnitEconFulfillmentResult[];
  marketplace: UnitEconMarketplace;
}) {
  if (!results.length) return null;

  const order = buildRowOrder(marketplace);
  const ids = new Set<string>();
  for (const result of results) {
    for (const line of result.lines) ids.add(line.id);
  }
  const rows = [...ids].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const gridCols = gridTemplateColumns(results.length);
  const minTableWidth = results.length > 4 ? 200 + results.length * 152 : undefined;
  const profitValues = results
    .map((result) => result.profitRub)
    .filter((v): v is number => v !== null);
  const bestProfit = profitValues.length ? Math.max(...profitValues) : null;

  return (
    <div className="w-full overflow-x-auto">
      <div style={minTableWidth ? { minWidth: minTableWidth } : undefined}>
        <div
          className="grid items-end gap-x-4 border-b border-[#E5E5E5] pb-3"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="text-sm font-semibold text-[#6B7280]">Статья</div>
          {results.map((result, index) => (
            <div
              key={`${result.model}-${result.modelLabel}-${index}`}
              className="flex min-w-0 flex-col items-end gap-1 text-right text-[13px] font-semibold leading-snug text-black text-balance"
              title={result.modelLabel}
            >
              <span>{result.modelLabel}</span>
              {bestProfit != null &&
              result.profitRub === bestProfit &&
              results.length > 1 ? (
                <span className="rounded-full bg-[#00B050]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#00A14A]">
                  Лучший
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <div>
          {rows.map((id) => {
            const line =
              results.map((r) => findLine(r.lines, id)).find(Boolean);
            return (
              <ComparisonRow
                key={id}
                lineId={id}
                label={line?.label ?? id}
                results={results}
                marketplace={marketplace}
                defaultOpen={id === "mp-costs"}
                highlight={id === "payout" || id === "profit"}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
