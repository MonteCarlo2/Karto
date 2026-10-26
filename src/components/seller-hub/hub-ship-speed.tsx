"use client";

import type { ShipSpeed } from "@/lib/seller-hub/ship-speed";
import { WEEKDAY_SHORT } from "@/lib/seller-hub/weekday-profile";
import { formatInt, hub, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const hours = (h: number) => `${h.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} ч`;
const day = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle }}>
        {label}
      </p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ ...hubSans, color: hub.text }}>
        {value}
      </p>
      <p className="text-[12px]" style={{ ...hubSans, color: hub.textMuted }}>
        {sub}
      </p>
    </div>
  );
}

/** Скорость отгрузки: от появления заказа до передачи поставки в доставку, по реальным датам WB. */
export function HubShipSpeed({ speed, loading, error, suppliesTotal, coverage }: { speed: ShipSpeed | null; loading: boolean; error?: string; suppliesTotal: number; coverage?: { read: number; total: number } | null }) {
  if (suppliesTotal === 0) return null;
  const maxBucket = Math.max(1, ...(speed?.buckets ?? []).map((b) => b.count));
  return (
    <HubPanel>
      <HubPanelHeader
        title="Скорость отгрузки"
        hint="Сколько проходит от появления заказа до передачи поставки в доставку. Считается по датам WB: дата заказа и дата закрытия поставки."
      />
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {loading ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            Читаю состав последних поставок…
          </p>
        ) : error && !speed ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
            {error}. WB ограничивает частоту запросов: попробуйте открыть вкладку позже.
          </p>
        ) : !speed ? (
          <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
            В закрытых поставках не нашлось заказов с датой: посчитать скорость не из чего.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Kpi label="Типично" value={hours(speed.medianHours)} sub="половина заказов уходит быстрее" />
              <Kpi label="В среднем" value={hours(speed.avgHours)} sub={`по ${formatInt(speed.orders)} заказам`} />
              <Kpi label="Медленные 10%" value={hours(speed.p90Hours)} sub="столько ждут самые долгие" />
              <Kpi label="Дольше суток" value={`${Math.round(speed.over24Share * 100)}%`} sub="доля заказов" />
            </div>
            {speed.trend ? (
              <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
                Типичное время за последние 7 дней {hours(speed.trend.recentMedian)}, неделей раньше было {hours(speed.trend.previousMedian)}.
              </p>
            ) : null}
            <ul className="space-y-1.5">
              {speed.buckets.map((b) => (
                <li key={b.id} className="grid grid-cols-[110px_1fr_70px] items-center gap-3">
                  <span className="text-[12.5px]" style={{ ...hubSans, color: hub.textMuted }}>
                    {b.label}
                  </span>
                  <div className="h-2.5 rounded-full" style={{ backgroundColor: hub.canvas }}>
                    <div className="h-2.5 rounded-full" style={{ width: `${b.count === 0 ? 0 : Math.max(2, (b.count / maxBucket) * 100)}%`, backgroundColor: b.id === "over" || b.id === "h48" ? hub.warn : hub.blue }} />
                  </div>
                  <span className="text-right text-[12.5px] tabular-nums" style={{ ...hubSans, color: hub.text }}>
                    {formatInt(b.count)}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <p className="text-[13px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                Ритм по дням недели
              </p>
              <p className="mb-2 mt-0.5 text-[12px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
                В какие дни вы закрывали поставки и сколько типично ждали заказы, пришедшие в этот день (по Москве). Дни без отправок подсвечены.
              </p>
              <div className="grid grid-cols-7 gap-1.5">
                {speed.weekdays.map((d) => {
                  const noShip = d.suppliesClosed === 0;
                  return (
                    <div key={d.index} className="rounded-lg border px-2 py-2 text-center" style={{ borderColor: noShip ? hub.warn : hub.borderSoft, backgroundColor: noShip ? hub.warnSoft : "transparent" }}>
                      <p className="text-[12px] font-semibold" style={{ ...hubSans, color: hub.text }}>
                        {WEEKDAY_SHORT[d.index]}
                      </p>
                      <p className="mt-1 text-[11px]" style={{ ...hubSans, color: hub.textMuted }}>
                        отправок: {d.suppliesClosed}
                      </p>
                      <p className="text-[11px]" style={{ ...hubSans, color: hub.textMuted }}>
                        заказов: {d.ordersCreated}
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold tabular-nums" style={{ ...hubSans, color: d.medianWait != null && d.medianWait >= 24 ? hub.danger : hub.text }}>
                        {d.medianWait == null ? "—" : hours(d.medianWait)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-left">
                <thead style={{ backgroundColor: hub.surfaceMuted }}>
                  <tr>
                    {["Поставка", "Передана", "Заказов", "В среднем", "Дольше всех"].map((label) => (
                      <th key={label} className="border-b px-3 py-2 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {speed.perSupply.slice(0, 8).map((s) => (
                    <tr key={s.supplyId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                      <td className="px-3 py-2 font-mono text-[12.5px]">{s.supplyName ? `${s.supplyName} · ${s.supplyId}` : s.supplyId}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[13px]">{day(s.closedAt)}</td>
                      <td className="px-3 py-2 text-[13px] tabular-nums">{formatInt(s.orders)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums">{hours(s.avgHours)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-[13px] tabular-nums">{hours(s.maxHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11.5px] leading-4" style={{ ...hubSans, color: hub.textSubtle }}>
              {coverage && coverage.read < coverage.total ? `WB отдал состав только ${coverage.read} из ${coverage.total} последних поставок (возможно, лимит запросов), поэтому цифры посчитаны по части данных. ` : ""}
              Взяты последние {speed.supplies} закрытых поставок FBS. WB не публикует «правильных» сроков в этих данных, поэтому оценки «хорошо/плохо» здесь нет: ориентируйтесь на свой порог и динамику.
            </p>
          </>
        )}
      </div>
    </HubPanel>
  );
}
