"use client";

import { useMemo } from "react";
import { districtCancels } from "@/lib/seller-hub/district-cancels";
import type { SellerRegionOrdersRow } from "@/lib/seller-hub/types";
import { FCard as Card } from "./hub-fulfillment-ui";
import { formatInt, hub, hubSans } from "./hub-ui";

const pct = (v: number) => `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

/** Где покупатели отменяют заказы чаще: доля отмен по округам против среднего по магазину. Плитки: красные там, где отмен заметно больше. */
export function HubDistrictCancels({ rows }: { rows: SellerRegionOrdersRow[] }) {
  const { shopShare, districts } = useMemo(() => districtCancels(rows), [rows]);
  if (shopShare == null || districts.length === 0) return null;
  const hot = districts.filter((d) => d.high);
  return (
    <Card
      title="Где чаще отменяют заказы"
      hint={`В среднем по магазину отменяют ${pct(shopShare)} заказов. ${hot.length > 0 ? `Заметно выше в округах: ${hot.map((d) => d.district).join(", ")}.` : "Явных перекосов по округам нет."}`}
    >
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {districts.slice(0, 8).map((d) => {
          return (
            <li key={d.district} className="rounded-[18px] px-4 py-3.5" style={{ backgroundColor: d.high ? "rgba(200, 69, 63, 0.07)" : "transparent", border: `1px solid ${d.high ? "rgba(200, 69, 63, 0.4)" : "rgba(1, 20, 8, 0.12)"}` }}>
              <p className="text-[15px] font-medium leading-tight [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                {d.district}
              </p>
              <p className="mt-4 text-[32px] font-semibold leading-none" style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.05em", color: d.high ? "#B42323" : hub.text }}>
                {pct(d.cancelShare)}
              </p>
              <p className="mt-3 text-[14px]" style={{ ...hubSans, color: hub.textMuted }}>
                {formatInt(d.cancelled)} из {formatInt(d.orders)} заказов
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
