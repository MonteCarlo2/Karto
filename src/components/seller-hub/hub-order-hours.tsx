"use client";

import { useMemo } from "react";
import { MIN_SPEED_ORDERS, orderHoursProfile } from "@/lib/seller-hub/fulfillment-center";
import type { SellerOrderRow, SellerSupplyRow } from "@/lib/seller-hub/types";
import { HubPanel, HubPanelHeader } from "./hub-fulfillment-ui";
import { formatInt, hub, hubSans } from "./hub-ui";

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

/**
 * Когда приходят заказы и когда вы обычно закрываете поставки. Это расчёт, на котором стоит совет про вторую отправку:
 * заказы после обычного часа отправки ждут следующего дня.
 */
export function HubOrderHours({ orders, supplies, nowMs }: { orders: SellerOrderRow[]; supplies: SellerSupplyRow[]; nowMs: number }) {
  const profile = useMemo(() => orderHoursProfile(orders, supplies, nowMs), [orders, supplies, nowMs]);
  if (!profile || profile.total < MIN_SPEED_ORDERS) return null;
  const { hours, usualHour, late, total, closedSupplies } = profile;
  const max = Math.max(1, ...hours);
  const share = Math.round((late / total) * 100);
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return (
    <div data-evidence="order-hours" className="rounded-[18px]">
      <HubPanel>
        <HubPanelHeader
          title="Когда приходят заказы и когда вы отправляете"
          hint={`Заказы за последние 7 дней по часам (Москва) и обычный час закрытия поставок по ${closedSupplies} последним поставкам. Заказ, пришедший после этого часа, ждёт следующего дня`}
        />
        <div className="px-5 py-6 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[34px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>{pad(usualHour)}</p>
              <p className="mt-3 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>обычный час закрытия поставки</p>
            </div>
            <div>
              <p className="text-[34px] font-semibold leading-none" style={{ ...MONO, color: hub.text }}>{formatInt(total - late)}</p>
              <p className="mt-3 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>заказов успевают в отправку в тот же день</p>
            </div>
            <div>
              <p className="text-[34px] font-semibold leading-none" style={{ ...MONO, color: share >= 30 ? "#C46A22" : hub.text }}>
                {formatInt(late)}
                <span className="ml-2 text-[16px] font-medium" style={{ ...hubSans, letterSpacing: 0, color: hub.textMuted }}>{share}%</span>
              </p>
              <p className="mt-3 text-[14.5px]" style={{ ...hubSans, color: hub.textMuted }}>заказов приходят позже и ждут следующего дня</p>
            </div>
          </div>
          <div className="mt-7 overflow-x-auto">
            <div className="grid min-w-[560px] grid-cols-24 gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }} role="img" aria-label="Заказы по часам суток">
              {hours.map((count, h) => {
                const after = h > usualHour;
                return (
                  <div key={h} className="flex flex-col items-center gap-1.5" title={`${pad(h)}: ${count} заказов`}>
                    <div className="flex h-[84px] w-full items-end">
                      <div
                        className="w-full rounded-[5px]"
                        style={{ height: `${count === 0 ? 3 : Math.max(8, (count / max) * 100)}%`, backgroundColor: count === 0 ? "rgba(1, 20, 8, 0.1)" : after ? "#E0964F" : "#2A3A30" }}
                      />
                    </div>
                    <span className="text-[11.5px] leading-none" style={{ ...MONO, color: h === usualHour ? hub.text : hub.textSubtle, fontWeight: h === usualHour ? 700 : 400 }}>
                      {h % 3 === 0 || h === usualHour ? String(h).padStart(2, "0") : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: "#2A3A30" }} />до {pad(usualHour)}: успевают в отправку</span>
            <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: "#E0964F" }} />после: ждут следующего дня</span>
          </p>
        </div>
      </HubPanel>
    </div>
  );
}
