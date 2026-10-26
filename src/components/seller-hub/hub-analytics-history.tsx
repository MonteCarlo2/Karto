"use client";

import { useEffect, useState } from "react";
import { loadSellerHubAnalyticsHistory } from "@/lib/seller-hub/client-api";
import { metricValue, type HistoryMetric, type HistoryPoint } from "@/lib/seller-hub/metric-history";
import { useSellerHubSyncMode } from "./sync-mode-context";
import { formatInt, formatRub, hub, HubSegmented, hubSans } from "./hub-ui";
import { Card, dayLabel, SourceNote } from "./hub-analytics-ui";

const MAX_PASSES = 6;

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
  const [state, setState] = useState<State>({ status: "loading" });
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
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Сохраняю дни из WB в базу. Первая загрузка может занять до двух минут: у WB лимит на запросы воронки.
        </p>
      </Card>
    );
  }
  if (state.status === "error") {
    return (
      <Card title="История в базе">
        <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {state.error}
        </p>
      </Card>
    );
  }

  const withOrders = state.series.filter((p) => p.orders != null);
  const max = Math.max(0.0001, ...withOrders.map((p) => metricValue(p, metric) ?? 0));
  const lastStock = [...state.series].reverse().find((p) => p.stock != null);
  const totalOrders = withOrders.reduce((s, p) => s + (p.orders ?? 0), 0);
  const totalSum = withOrders.reduce((s, p) => s + (p.orderSum ?? 0), 0);

  return (
    <Card title="История в базе" hint={withOrders.length > 0 ? `${dayLabel(withOrders[0]!.date)} — ${dayLabel(withOrders.at(-1)!.date)}, ${withOrders.length} дн.` : undefined}>
      {withOrders.length === 0 ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Дни ещё не сохранены. {state.notes[0] ?? "Откройте вкладку ещё раз через пару минут: за раз сохраняется до трёх дней."}
        </p>
      ) : (
        <>
          <div className="mb-3 overflow-x-auto">
            <HubSegmented value={metric} options={METRICS} onChange={setMetric} layoutId="history-metric" />
          </div>
          <div className="flex h-24 items-end gap-[2px]">
            {withOrders.map((p) => {
              const v = metricValue(p, metric);
              return (
                <div key={p.date} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${dayLabel(p.date)}: ${v == null ? "нет данных" : fmt(v, metric)}`}>
                  {v == null ? null : <div className="w-full rounded-t-[2px]" style={{ height: `${Math.max(2, (v / max) * 100)}%`, backgroundColor: hub.blue }} />}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
            За сохранённые дни: {formatInt(totalOrders)} заказов на {formatRub(totalSum)}.
            {lastStock?.stock != null ? ` Остаток на ${dayLabel(lastStock.date)}: ${formatInt(lastStock.stock)} шт.` : ""}
            {state.missing > 0 ? ` Ещё не сохранено дней за последние 90: ${state.missing}, они докачиваются, пока вкладка открыта, и при следующих визитах.` : " Последние 90 дней сохранены полностью."}
          </p>
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
