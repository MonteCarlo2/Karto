"use client";

import { useMemo, useState } from "react";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { buildOrdersByProduct } from "@/lib/seller-hub/orders-by-product";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, HubPanel, HubPanelHeader, hubSans } from "./hub-ui";

const TH = "border-b px-4 py-3 text-[11.5px] font-bold uppercase tracking-[0.06em] sm:px-5";

/** Заказы FBS по товарам: что заказывают, что отменяют, что ждёт отгрузки и на сколько дней хватит своего склада. */
export function HubOrdersProducts({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const [search, setSearch] = useState("");
  const nowMs = snapshotTimeMs(snapshot);
  const rows = useMemo(
    () => (nowMs > 0 ? buildOrdersByProduct(snapshot?.orders?.orders ?? [], snapshot?.items ?? [], nowMs) : []),
    [snapshot?.orders, snapshot?.items, nowMs],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.title} ${r.article} ${r.nmId}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  function exportCsv() {
    downloadCsv(
      `karto-zakazy-po-tovaram-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Артикул WB", "Артикул продавца", "Товар", "Заказов", "Отмен", "Ждут отгрузки", "В доставке", "Выкуплено", "Выручка без отмен, ₽", "Заказов в день", "Остаток на складе", "Хватит дней"],
      visible.map((r) => [r.nmId, r.article, r.title, r.orders, r.canceled, r.waiting, r.inDelivery, r.sold, Math.round(r.revenue), r.dailyDemand, r.stockFbs ?? "", r.coverDays ?? ""]),
    );
  }

  return (
    <HubPanel>
      <HubPanelHeader
        title="Заказы по товарам"
        hint="За период выгрузки FBS-заказов (до 7 дней). Запас считается по остатку вашего склада и заказам без отмен."
        action={
          <HubButton size="sm" variant="secondary" onClick={exportCsv}>
            Скачать CSV
          </HubButton>
        }
      />
      <div className="border-b px-5 py-3 sm:px-6" style={{ borderColor: hub.borderSoft }}>
        <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию, артикулу, nmID" className="sm:w-80" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead style={{ backgroundColor: hub.surfaceMuted }}>
            <tr>
              {["Товар", "Заказов", "Отмен", "Ждут", "В пути", "Выкуп", "Выручка", "В день", "Склад", "Хватит"].map((label) => (
                <th key={label} className={TH} style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 200).map((r) => {
              const low = r.coverDays != null && r.coverDays < 3;
              return (
                <tr key={r.nmId} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="max-w-[300px] px-4 py-2.5 sm:px-5">
                    <p className="truncate text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                      {r.title}
                    </p>
                    <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {r.article ? `${r.article} · ` : ""}
                      {r.nmId}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-semibold tabular-nums sm:px-5">{formatInt(r.orders)}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5" style={{ color: r.canceled > 0 ? hub.danger : hub.textMuted }}>
                    {formatInt(r.canceled)}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5" style={{ color: r.waiting > 0 ? hub.warn : hub.textMuted }}>
                    {formatInt(r.waiting)}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5">{formatInt(r.inDelivery)}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5">{formatInt(r.sold)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] tabular-nums sm:px-5">{formatRub(r.revenue)}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5">{r.dailyDemand.toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-2.5 text-[13px] tabular-nums sm:px-5">{r.stockFbs == null ? "—" : formatInt(r.stockFbs)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold tabular-nums sm:px-5" style={{ color: low ? hub.danger : hub.text }}>
                    {r.coverDays == null ? "—" : `${r.coverDays.toLocaleString("ru-RU")} дн.`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </HubPanel>
  );
}
