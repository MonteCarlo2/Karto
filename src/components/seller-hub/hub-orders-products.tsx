"use client";

import { useMemo, useState } from "react";
import { snapshotTimeMs } from "@/lib/seller-hub/complete-days";
import { buildOrdersByProduct } from "@/lib/seller-hub/orders-by-product";
import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";
import { downloadCsv } from "./download-file";
import { formatInt, formatRub, hub, HubButton, HubInput, hubSans } from "./hub-ui";
import { HubPanel, HubPanelHeader, Thumb } from "./hub-fulfillment-ui";
import { FBS_ORDERS_WINDOW_DAYS } from "@/lib/seller-hub/orders-window";

const SHOWN = 20;
/** Даже при «Показать все» рисуем не больше этого: при тысячах товаров остальное находится поиском или в CSV. */
const MAX_ROWS = 300;
const mono = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.04em" } as const;

/** Заказы FBS по товарам: что заказывают, что отменяют, что ждёт отгрузки и на сколько дней хватит своего склада. */
export function HubOrdersProducts({ snapshot }: { snapshot?: SellerCatalogSnapshot }) {
  const [search, setSearch] = useState("");
  const [all, setAll] = useState(false);
  const nowMs = snapshotTimeMs(snapshot);
  const rows = useMemo(
    () => (nowMs > 0 ? buildOrdersByProduct(snapshot?.orders?.orders ?? [], snapshot?.items ?? [], nowMs) : []),
    [snapshot?.orders, snapshot?.items, nowMs],
  );
  const photos = useMemo(() => new Map((snapshot?.items ?? []).map((i) => [i.externalId, i.imageUrl ?? undefined])), [snapshot?.items]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.title} ${r.article} ${r.nmId}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  const shown = (all || search ? visible : visible.slice(0, SHOWN)).slice(0, MAX_ROWS);
  const maxOrders = Math.max(1, ...rows.map((r) => r.orders));

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
        hint={`Заказы FBS за последние ${FBS_ORDERS_WINDOW_DAYS} дн. Запас считается по остатку вашего склада и заказам без отмен`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар" className="w-52" />
            <HubButton size="sm" variant="secondary" onClick={exportCsv}>
              Скачать CSV
            </HubButton>
          </div>
        }
      />
      <div className="hidden items-center gap-x-8 px-6 py-3 text-[12px] font-semibold uppercase tracking-[0.07em] xl:grid xl:grid-cols-[minmax(0,1fr)_84px_132px_72px_72px_72px_72px_120px]" style={{ ...hubSans, color: hub.textSubtle, backgroundColor: "rgba(1, 20, 8, 0.045)" }}>
        <span>Товар</span>
        <span className="text-right">Заказов</span>
        <span className="text-right">Выручка</span>
        <span className="text-right">Отмен</span>
        <span className="text-right">Ждут</span>
        <span className="text-right">В пути</span>
        <span className="text-right">Выкуп</span>
        <span className="text-right">Склад</span>
      </div>
      <ul>
        {shown.map((r) => {
          const low = r.coverDays != null && r.coverDays < 3;
          const cell = "flex flex-col gap-1 xl:block xl:text-right";
          const lab = "text-[13px] xl:hidden";
          return (
            <li key={r.nmId} className="border-b px-5 py-5 transition-colors hover:bg-black/[0.02] sm:px-6" style={{ borderColor: "rgba(1, 20, 8, 0.07)" }}>
              <div className="grid items-center gap-x-8 gap-y-3 xl:grid-cols-[minmax(0,1fr)_84px_132px_72px_72px_72px_72px_120px]">
                <div className="flex min-w-0 items-center gap-4">
                  <Thumb src={photos.get(String(r.nmId))} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[16px] font-semibold leading-[1.3] [overflow-wrap:anywhere]" style={{ ...hubSans, color: hub.text }}>
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-[13.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
                      {r.article ? `${r.article} · ` : ""}
                      {r.nmId}
                    </p>
                    <div className="mt-2 h-[5px] max-w-[260px] rounded-full" style={{ backgroundColor: "rgba(1, 20, 8, 0.07)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(3, (r.orders / maxOrders) * 100)}%`, backgroundColor: "#3B4248" }} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4 xl:contents">
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Заказов</span>
                  <span className="text-[24px] font-semibold" style={{ color: hub.text }}>{formatInt(r.orders)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Выручка</span>
                  <span className="whitespace-nowrap text-[18px] font-medium" style={{ color: hub.text }}>{formatRub(r.revenue)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Отмен</span>
                  <span className="text-[17px] font-medium" style={{ color: r.canceled > 0 ? "#B42323" : hub.textSubtle }}>{formatInt(r.canceled)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Ждут</span>
                  <span className="text-[17px] font-medium" style={{ color: r.waiting > 0 ? "#B4500A" : hub.textSubtle }}>{formatInt(r.waiting)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>В пути</span>
                  <span className="text-[17px] font-medium" style={{ color: r.inDelivery > 0 ? hub.text : hub.textSubtle }}>{formatInt(r.inDelivery)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Выкуп</span>
                  <span className="text-[17px] font-medium" style={{ color: r.sold > 0 ? hub.text : hub.textSubtle }}>{formatInt(r.sold)}</span>
                </p>
                <p className={cell} style={mono}>
                  <span className={lab} style={{ ...hubSans, color: hub.textSubtle }}>Склад</span>
                  <span>
                    <span className="block text-[17px] font-medium" style={{ color: low ? "#B42323" : hub.text }}>{r.stockFbs == null ? "—" : formatInt(r.stockFbs)}</span>
                    {r.coverDays != null ? (
                      <span className="block whitespace-nowrap text-[12.5px]" style={{ ...hubSans, letterSpacing: 0, color: low ? "#B42323" : hub.textSubtle }}>
                        на {r.coverDays.toLocaleString("ru-RU")} дн.
                      </span>
                    ) : null}
                  </span>
                </p>
                </div>
              </div>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-5 py-10 text-center text-[15.5px]" style={{ ...hubSans, color: hub.textMuted }}>
            Заказов по таким условиям нет.
          </li>
        ) : null}
      </ul>
      {visible.length > MAX_ROWS && (all || search) ? (
        <p className="px-5 pt-3 text-[13.5px] sm:px-6" style={{ ...hubSans, color: hub.textMuted }}>
          Показаны первые {MAX_ROWS} из {visible.length}. Остальные ищите по названию или артикулу, полный список в CSV.
        </p>
      ) : null}
      {visible.length > SHOWN && !search ? (
        <div className="px-5 py-3 sm:px-6">
          <HubButton size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? "Свернуть" : `Показать все (${visible.length})`}
          </HubButton>
        </div>
      ) : null}
    </HubPanel>
  );
}
