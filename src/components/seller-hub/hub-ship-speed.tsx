"use client";

import type { ShipSpeed } from "@/lib/seller-hub/ship-speed";
import { WEEKDAY_SHORT } from "@/lib/seller-hub/weekday-profile";
import { formatInt, hub, hubSans } from "./hub-ui";
import { LoadingBlock } from "./hub-analytics-ui";
import { HubPanel, HubPanelHeader } from "./hub-fulfillment-ui";

const hours = (h: number) => `${h.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");


/** Скорость отгрузки: от появления заказа до передачи поставки в доставку, по реальным датам WB. */
const ZONES = [
  { to: 6, color: "#5BBF8A", label: "до 6 ч" },
  { to: 24, color: "#E8C45A", label: "6–24 ч" },
  { to: 48, color: "#EE9A55", label: "1–2 суток" },
  { to: Infinity, color: "#D9605A", label: "дольше 2 суток" },
] as const;
const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em" } as const;
const BUCKET_COLORS = ["#5BBF8A", "#9CCB6A", "#E8C45A", "#EE9A55", "#D9605A"];
const severity = (h: number) => (h < 6 ? "#2E9E6B" : h < 24 ? "#B8902A" : h < 48 ? "#C46A22" : "#C0443E");

export function HubShipSpeed({ speed, loading, error, suppliesTotal, coverage }: { speed: ShipSpeed | null; loading: boolean; error?: string; suppliesTotal: number; coverage?: { read: number; total: number } | null }) {
  if (suppliesTotal === 0) return null;
  if (loading || (error && !speed) || !speed) {
    return (
      <HubPanel>
        {loading ? (
          <div className="p-5">
            <LoadingBlock title="Считаю скорость отгрузки по последним поставкам" height={220} />
          </div>
        ) : (
          <p className="px-6 py-12 text-center text-[15.5px]" style={{ ...hubSans, color: error ? hub.danger : hub.textMuted }}>
            {error ? `${error}. WB ограничивает частоту запросов: попробуйте открыть вкладку позже.` : "В закрытых поставках не нашлось заказов с датой: посчитать скорость не из чего."}
          </p>
        )}
      </HubPanel>
    );
  }

  const scaleMax = Math.max(48, Math.ceil((speed.p90Hours * 1.12) / 12) * 12);
  const pos = (h: number) => `${Math.min(100, (Math.max(0, h) / scaleMax) * 100)}%`;
  const markers = [
    { key: "med", label: "Типично", value: speed.medianHours, above: true },
    { key: "avg", label: "В среднем", value: speed.avgHours, above: false },
    { key: "p90", label: "Медленные 10%", value: speed.p90Hours, above: true },
  ];
  const totalBuckets = Math.max(1, speed.buckets.reduce((a, b) => a + b.count, 0));
  const maxAvg = Math.max(1, ...speed.perSupply.slice(0, 8).map((s) => s.maxHours));

  return (
    <div className="space-y-3">
      <div data-evidence="speed-gauge" className="rounded-[18px]">
      <HubPanel>
        <HubPanelHeader title="Скорость отгрузки" hint={`От появления заказа до передачи поставки в доставку, по ${formatInt(speed.orders)} заказам из ${speed.supplies} последних поставок`} />
        <div className="px-6 pb-7 pt-4 sm:px-8">
          <div className="relative mx-2 pb-[78px] pt-[70px]">
            <div className="relative h-[14px] w-full overflow-hidden rounded-full" style={{ display: "flex", gap: 2 }}>
              {ZONES.map((z, i) => {
                const from = i === 0 ? 0 : ZONES[i - 1]!.to;
                const to = Math.min(z.to, scaleMax);
                const w = Math.max(0, ((to - from) / scaleMax) * 100);
                return w > 0 ? <div key={z.label} style={{ width: `${w}%`, backgroundColor: z.color, opacity: 0.85 }} title={z.label} /> : null;
              })}
            </div>
            <div className="absolute inset-x-0 top-[96px] flex justify-between px-0.5 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
              {[0, scaleMax / 4, scaleMax / 2, (scaleMax * 3) / 4, scaleMax].map((h) => (
                <span key={h}>{Math.round(h)} ч</span>
              ))}
            </div>
            {markers.map((m) => (
              <div key={m.key} className="absolute -translate-x-1/2" style={{ left: pos(m.value), top: m.above ? 0 : 118 }}>
                <div className="flex flex-col items-center" style={{ flexDirection: m.above ? "column" : "column-reverse" }}>
                  <div className="whitespace-nowrap text-center">
                    <p className="text-[24px] font-medium leading-none" style={{ ...mono, color: severity(m.value) }}>
                      {hours(m.value)}
                    </p>
                    <p className="mt-1 text-[13.5px] font-medium" style={{ ...hubSans, color: hub.textMuted }}>
                      {m.label}
                    </p>
                  </div>
                  <span className="my-1 block w-[2px]" style={{ height: m.above ? 14 : 14, backgroundColor: "rgba(1, 20, 8, 0.35)" }} />
                </div>
              </div>
            ))}
            {markers.map((m) => (
              <span key={`${m.key}-dot`} className="absolute top-[70px] -translate-x-1/2 -translate-y-[-1px] rounded-full border-2 bg-white" style={{ left: pos(m.value), width: 16, height: 16, borderColor: "#1D2A22", marginTop: -1 }} />
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t pt-4" style={{ borderColor: "rgba(1, 20, 8, 0.08)" }}>
            <p className="text-[15.5px]" style={{ ...hubSans, color: hub.text }}>
              <span className="font-semibold" style={{ color: severity(speed.over24Share >= 0.3 ? 30 : 12) }}>
                {Math.round(speed.over24Share * 100)}%
              </span>{" "}
              заказов ждут дольше суток
            </p>
            {speed.trend ? (
              <p className="text-[15.5px]" style={{ ...hubSans, color: hub.text }}>
                За последние 7 дней типично {hours(speed.trend.recentMedian)}, неделей раньше было {hours(speed.trend.previousMedian)}{" "}
                <span className="font-semibold" style={{ color: speed.trend.recentMedian > speed.trend.previousMedian ? "#C0443E" : "#2E9E6B" }}>
                  {speed.trend.recentMedian > speed.trend.previousMedian ? "↑ медленнее" : "↓ быстрее"}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </HubPanel>
      </div>

      <HubPanel>
        <HubPanelHeader title="Как распределились заказы" hint="Доля заказов по времени ожидания" />
        <div className="px-6 pb-6 pt-5 sm:px-8">
          <div className="flex h-[22px] w-full gap-[3px]">
            {speed.buckets.map((b, i) =>
              b.count > 0 ? (
                <div key={b.id} className="h-full rounded-[7px]" style={{ width: `${(b.count / totalBuckets) * 100}%`, backgroundColor: BUCKET_COLORS[Math.min(i, BUCKET_COLORS.length - 1)], minWidth: 10 }} title={`${b.label}: ${b.count}`} />
              ) : null,
            )}
          </div>
          <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-5">
            {speed.buckets.map((b, i) => (
              <li key={b.id}>
                <p className="flex items-center gap-2 text-[14px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: BUCKET_COLORS[Math.min(i, BUCKET_COLORS.length - 1)] }} aria-hidden />
                  {b.label}
                </p>
                <p className="mt-2 text-[28px] font-medium leading-none" style={{ ...mono, color: b.count === 0 ? hub.textSubtle : hub.text }}>
                  {formatInt(b.count)}
                </p>
                <p className="mt-1.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  {Math.round((b.count / totalBuckets) * 100)}% заказов
                </p>
              </li>
            ))}
          </ul>
        </div>
      </HubPanel>

      <div data-evidence="weekday-rhythm" className="rounded-[18px]">
      <HubPanel>
        <HubPanelHeader title="Ритм по дням недели" hint="Как долго ждали заказы, пришедшие в этот день, и сколько поставок вы в него отправили. Пунктир — отправок не было" />
        <div className="grid grid-cols-7 gap-2 p-4 sm:gap-3 sm:p-6">
          {speed.weekdays.map((d) => {
            const noShip = d.suppliesClosed === 0;
            const color = d.medianWait == null ? hub.textSubtle : severity(d.medianWait);
            return (
              <div key={d.index} className="flex flex-col items-center rounded-[16px] border px-1 py-4 text-center" style={{ borderStyle: noShip ? "dashed" : "solid", borderColor: noShip ? "rgba(1, 20, 8, 0.28)" : "rgba(1, 20, 8, 0.12)" }}>
                <p className="text-[14.5px] font-semibold" style={{ ...hubSans, color: hub.textMuted }}>
                  {WEEKDAY_SHORT[d.index]}
                </p>
                <p className="mt-3 whitespace-nowrap text-[clamp(17px,2.1vw,26px)] font-medium leading-none" style={{ ...mono, color }}>
                  {d.medianWait == null ? "—" : d.medianWait.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
                </p>
                <p className="mt-1 text-[12.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                  часов
                </p>
                <span className="my-3 block h-px w-8" style={{ backgroundColor: "rgba(1, 20, 8, 0.12)" }} />
                <p className="text-[13px] leading-tight" style={{ ...hubSans, color: noShip ? "#B4500A" : hub.textMuted, fontWeight: noShip ? 600 : 400 }}>
                  {noShip ? "не отправляли" : `отправок: ${d.suppliesClosed}`}
                </p>
                <p className="mt-0.5 text-[13px] leading-tight" style={{ ...hubSans, color: hub.textSubtle }}>
                  заказов: {d.ordersCreated}
                </p>
              </div>
            );
          })}
        </div>
      </HubPanel>
      </div>

      <HubPanel>
        <HubPanelHeader title="Последние поставки" hint="Сколько заказов было в поставке и как долго они ждали передачи в доставку" />
        <div className="hidden items-center gap-x-6 px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] lg:grid lg:grid-cols-[minmax(0,1.3fr)_96px_80px_minmax(0,1.6fr)]" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
          <span>Поставка</span>
          <span>Передана</span>
          <span className="text-right">Заказов</span>
          <span>Ожидание: в среднем и дольше всех</span>
        </div>
        <ul>
          {speed.perSupply.slice(0, 8).map((s) => (
            <li key={s.supplyId} className="grid items-center gap-x-6 gap-y-3 border-b px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1.3fr)_96px_80px_minmax(0,1.6fr)]" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
              <div className="min-w-0">
                <p className="text-[15.5px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                  {s.supplyName ?? "Поставка"}
                </p>
                <p className="font-mono text-[13px]" style={{ color: hub.textSubtle }}>
                  {s.supplyId}
                </p>
              </div>
              <p className="text-[15.5px]" style={{ ...hubSans, color: hub.text }}>
                {day(s.closedAt)}
              </p>
              <p className="text-[19px] font-medium lg:text-right" style={{ ...mono, color: hub.text }}>
                {formatInt(s.orders)} <span className="text-[13px] lg:hidden" style={{ ...hubSans, letterSpacing: 0, color: hub.textSubtle }}>заказов</span>
              </p>
              <div>
                <div className="relative h-[10px] rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)" }}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, (s.maxHours / maxAvg) * 100)}%`, backgroundColor: `${severity(s.maxHours)}55` }} />
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, (s.avgHours / maxAvg) * 100)}%`, backgroundColor: severity(s.avgHours) }} />
                </div>
                <p className="mt-2 flex flex-wrap gap-x-5 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                  <span>
                    в среднем <b className="font-semibold" style={{ ...mono, color: severity(s.avgHours) }}>{hours(s.avgHours)}</b>
                  </span>
                  <span>
                    дольше всех <b className="font-semibold" style={{ ...mono, color: severity(s.maxHours) }}>{hours(s.maxHours)}</b>
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </HubPanel>

      {coverage && coverage.read < coverage.total ? (
        <p className="text-[14px] leading-[1.5]" style={{ ...hubSans, color: hub.warn }}>
          WB отдал состав только {coverage.read} из {coverage.total} последних поставок, поэтому цифры посчитаны по части данных.
        </p>
      ) : null}
    </div>
  );
}
