"use client";

import { useMemo } from "react";
import { districtCancels, MIN_DISTRICT_ORDERS } from "@/lib/seller-hub/district-cancels";
import type { SellerRegionOrdersRow } from "@/lib/seller-hub/types";
import { formatInt, hub, hubSans } from "./hub-ui";

const pct = (v: number) => `${(v * 100).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;

/** Где покупатели отменяют заказы чаще: доля отмен по округам против среднего по магазину. */
export function HubDistrictCancels({ rows }: { rows: SellerRegionOrdersRow[] }) {
  const { shopShare, districts } = useMemo(() => districtCancels(rows), [rows]);
  if (shopShare == null || districts.length === 0) return null;
  const hot = districts.filter((d) => d.high);
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      <p className="text-[14px] font-semibold" style={{ ...hubSans, color: hub.text }}>
        Где чаще отменяют заказы
      </p>
      <p className="mb-3 mt-0.5 text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
        В среднем по магазину отменяют {pct(shopShare)} заказов.{" "}
        {hot.length > 0
          ? `Заметно выше в округах: ${hot.map((d) => `${d.district} (${pct(d.cancelShare)})`).join(", ")}. WB не называет причину отмены: чаще всего это долгая доставка в округ или долгое ожидание отгрузки.`
          : "Явных перекосов по округам нет."}
      </p>
      <ul className="space-y-1.5">
        {districts.slice(0, 8).map((d) => (
          <li key={d.district} className="grid grid-cols-[150px_1fr_130px] items-center gap-3">
            <span className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
              {d.district}
            </span>
            <div className="h-2.5 rounded-full" style={{ backgroundColor: hub.canvas }}>
              <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, Math.min(100, d.cancelShare * 100))}%`, backgroundColor: d.high ? hub.danger : hub.blue }} />
            </div>
            <span className="text-right text-[12.5px] tabular-nums" style={{ ...hubSans, color: d.high ? hub.danger : hub.textMuted }}>
              {pct(d.cancelShare)} · {formatInt(d.cancelled)} из {formatInt(d.orders)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
        Округа, где меньше {MIN_DISTRICT_ORDERS} заказов за период, не оцениваются: доля там случайна.
      </p>
    </div>
  );
}
