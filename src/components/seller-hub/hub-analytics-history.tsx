"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAnalyticsHistory } from "@/lib/seller-hub/client-api";
import { metricValue, type HistoryMetric, type HistoryPoint } from "@/lib/seller-hub/metric-history";
import { useSellerHubSyncMode } from "./sync-mode-context";
import { formatInt, formatRub, hub, HubSegmented, hubSans } from "./hub-ui";
import { CompareChart } from "./hub-analytics-charts";
import { Card, chartColors, dayLabel, EmptyNote, LoadingBlock, SourceNote } from "./hub-analytics-ui";

const MAX_PASSES = 6;
/** Последняя загруженная история: при возвращении на вкладку показывается сразу, а докачка идёт в фоне. */
let historyCache: State | null = null;

const METRICS: Array<{ id: HistoryMetric; label: string }> = [
  { id: "orders", label: "Заказы" },
  { id: "orderSum", label: "Сумма" },
  { id: "opens", label: "Просмотры" },
  { id: "carts", label: "В корзину" },
  { id: "cartConv", label: "CR в корзину" },
  { id: "orderConv", label: "CR в заказ" },
];

const fmt = (v: number, metric: HistoryMetric) => (metric === "orderSum" ? formatRub(v) : metric === "cartConv" || metric === "orderConv" ? `${v.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : formatInt(v));

type State = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; series: HistoryPoint[]; missing: number; notes: string[] };

/**
 * История показателей, накопленная в базе: заказы и остаток по дням. Каждое открытие вкладки докачивает до трёх недостающих дней
 * (лимит WB), поэтому глубина растёт сама, вплоть до 90 дней. Пропущенные дни остаются пропущенными, нулями не заполняются.
 */
export function HubAnalyticsHistory({ connected }: { connected?: boolean }) {
  const [state, setStateRaw] = useState<State>(() => historyCache ?? { status: "loading" });
  const setState = (next: State) => {
    if (next.status === "ok") historyCache = next;
    setStateRaw(next);
  };
  const [metric, setMetric] = useState<HistoryMetric>("orders");
  const syncMode = useSellerHubSyncMode();
  // При фоновом сборе историю докачивает сервер, вкладка только читает накопленное.
  const readOnly = syncMode === "background";

  useEffect(() => {
    if (!connected || syncMode === "unknown") return;
    let cancelled = false;
    // Недостающие дни докачиваются по три за проход; не больше MAX_PASSES за визит, чтобы не занимать общий лимит WB надолго.
    const pass = (left: number): void => {
      void loadSellerHubAnalyticsHistory({ readOnly })
        .then((res) => {
          if (cancelled) return;
          setState(res.ok ? { status: "ok", series: res.series, missing: res.missing, notes: res.notes } : { status: "error", error: res.error });
          if (res.ok && res.missing > 0 && res.notes.length === 0 && left > 1) pass(left - 1);
        })
        .catch((e: unknown) => {
          if (!cancelled) setState({ status: "error", error: e instanceof Error ? e.message : "История не загрузилась" });
        });
    };
    pass(readOnly ? 1 : MAX_PASSES);
    return () => {
      cancelled = true;
    };
  }, [connected, syncMode, readOnly]);

  if (!connected) return null;
  if (state.status === "loading") {
    return (
      <Card title="История в базе">
        <LoadingBlock title="Загружаю историю" height={420} />
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card title="История в базе">
        <EmptyNote title="История не загрузилась" tone="danger">
          {state.error}
        </EmptyNote>
      </Card>
    );
  }

  const withOrders = state.series.filter((p) => p.orders != null);
  const metricPoints = withOrders.flatMap((p) => {
    const v = metricValue(p, metric);
    return v == null ? [] : [{ date: p.date, value: v }];
  });
  const metricLabel = METRICS.find((m) => m.id === metric)?.label ?? "";
  const totalOrders = withOrders.reduce((s, p) => s + (p.orders ?? 0), 0);
  const totalSum = withOrders.reduce((s, p) => s + (p.orderSum ?? 0), 0);

  return (
    <Card fill title="История в базе" hint={withOrders.length > 0 ? `${dayLabel(withOrders[0]!.date)} — ${dayLabel(withOrders.at(-1)!.date)}, ${withOrders.length} дн.` : undefined}>
      {withOrders.length === 0 ? (
        <EmptyNote title="Дни ещё не сохранены">{state.notes[0] ?? "Откройте вкладку ещё раз через пару минут: за раз сохраняется до трёх дней."}</EmptyNote>
      ) : (
        <>
          <div className="mb-5 overflow-x-auto">
            <HubSegmented value={metric} options={METRICS} onChange={setMetric} layoutId="history-metric" pill />
          </div>
          {metricPoints.length === 0 ? (
            <EmptyNote title="По этому показателю данных нет">За сохранённые дни не хватает чисел для расчёта: выберите другой показатель.</EmptyNote>
          ) : (
            <CompareChart points={metricPoints} height={440} color={chartColors.violet} label={metricLabel} fmt={(n) => fmt(n, metric)} yFormat={metric === "cartConv" || metric === "orderConv" ? (n) => `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : undefined} />
          )}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: "Дней в базе", value: formatInt(withOrders.length), color: chartColors.violet },
              { label: "Заказов", value: formatInt(totalOrders), color: chartColors.teal },
              { label: "На сумму", value: formatRub(totalSum), color: chartColors.blue },
            ].map((t) => (
              <div key={t.label} className="rounded-[18px] px-4 py-3.5" style={{ background: `linear-gradient(165deg, ${t.color}1C 0%, #FFFFFF 70%)`, border: `1px solid ${t.color}44` }}>
                <p className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>{t.label}</p>
                <p className="mt-1 text-[22px] font-medium leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: hub.text }}>{t.value}</p>
              </div>
            ))}
          </div>
        </>
      )}
      {state.notes.length > 0 && withOrders.length > 0 ? (
        <p className="mt-2 text-[12px]" style={{ ...hubSans, color: hub.danger }}>
          {state.notes[0]}
        </p>
      ) : null}
      <SourceNote>Заказы и просмотры за законченный день берутся из воронки WB. Остаток на склад сохраняется только на день, когда вкладку открыли: задним числом WB его не отдаёт.</SourceNote>
    </Card>
  );
}
