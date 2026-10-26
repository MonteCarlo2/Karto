"use client";

import { useEffect, useMemo, useState } from "react";
import { BOX_TYPE_LABEL, buildWarehouseSlots, type AcceptanceRow } from "@/lib/seller-hub/acceptance-slots";
import { loadSellerHubAcceptance } from "@/lib/seller-hub/client-api";
import { downloadCsv } from "./download-file";
import { hub, HubButton, HubInput, HubSegmented, hubSans } from "./hub-ui";

type BoxFilter = "2" | "5" | "6" | "all";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

function coefColor(c: number): string {
  if (c === 0) return hub.green;
  if (c <= 2) return hub.blue;
  return hub.warn;
}

/**
 * Слоты приёмки FBO: когда и по какому коэффициенту WB принимает поставки на склады.
 * Только чтение. Нужна категория «Поставки» в токене; для работы только по FBS эта вкладка не нужна.
 */
export function HubAcceptance({ connected, ownWarehouses }: { connected?: boolean; ownWarehouses: Set<string> }) {
  const [rows, setRows] = useState<AcceptanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [box, setBox] = useState<BoxFilter>("2");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void loadSellerHubAcceptance({ refresh: tick > 0 }).then((res) => {
      if (cancelled) return;
      if (res.ok && res.acceptance) {
        setRows(res.acceptance.rows);
        setLoadedAt(res.acceptance.loadedAt);
        setError(null);
      } else {
        setError(res.error ?? "Не удалось получить слоты приёмки");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, tick]);

  const slots = useMemo(() => {
    const list = buildWarehouseSlots(rows ?? [], box === "all" ? null : Number(box));
    const q = search.trim().toLowerCase();
    return list.filter((s) => (!onlyFree || s.nextFree != null) && (!onlyMine || ownWarehouses.has(s.warehouseName)) && (!q || s.warehouseName.toLowerCase().includes(q)));
  }, [rows, box, onlyFree, onlyMine, search, ownWarehouses]);

  if (!connected) {
    return (
      <p className="rounded-2xl px-5 py-6 text-[13px]" style={{ ...hubSans, color: hub.textMuted, backgroundColor: hub.surface }}>
        Подключите кабинет WB, чтобы увидеть слоты приёмки.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl p-4" style={{ backgroundColor: hub.surface }}>
      <p className="text-[12.5px] leading-5" style={{ ...hubSans, color: hub.textMuted }}>
        Коэффициент приёмки: 0 — бесплатно, 1 — платно по базовому тарифу. Дни с большим коэффициентом или закрытой приёмкой отправки не допускают, их не показываем. Данные WB на ближайшие 14 дней. Нужны, если вы отправляете товар на склады WB (FBO). Нужна категория «Тарифы» или «Поставки» в токене.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <HubSegmented<BoxFilter>
          layoutId="acceptance-box"
          value={box}
          onChange={setBox}
          options={[
            { id: "2", label: BOX_TYPE_LABEL[2]! },
            { id: "5", label: BOX_TYPE_LABEL[5]! },
            { id: "6", label: BOX_TYPE_LABEL[6]! },
            { id: "all", label: "Все" },
          ]}
        />
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />
          Только с бесплатным днём
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px]" style={{ ...hubSans, color: hub.text }}>
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Где лежит мой товар
        </label>
        <HubInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти склад" className="w-44" />
        <HubButton
          size="sm"
          variant="secondary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            setTick((t) => t + 1);
          }}
        >
          Обновить
        </HubButton>
        {slots.length > 0 ? (
          <HubButton
            size="sm"
            variant="ghost"
            onClick={() =>
              downloadCsv(
                `karto-sloty-priemki-${new Date().toISOString().slice(0, 10)}.csv`,
                ["Склад", "Тип поставки", "Бесплатно с", "Дешёвая платная дата", "Коэффициент", "Открытых дней"],
                slots.map((s) => [s.warehouseName, s.boxTypeId ? BOX_TYPE_LABEL[s.boxTypeId] ?? s.boxTypeId : "", s.nextFree, s.cheapestPaid?.date, s.cheapestPaid?.coefficient, s.openDays]),
              )
            }
          >
            Скачать CSV
          </HubButton>
        ) : null}
      </div>

      {error && !rows ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.danger }}>
          {error}
        </p>
      ) : !rows ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          Загружаю слоты…
        </p>
      ) : slots.length === 0 ? (
        <p className="text-[13px]" style={{ ...hubSans, color: hub.textMuted }}>
          По выбранным условиям складов нет.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead style={{ backgroundColor: hub.surfaceMuted }}>
              <tr>
                {["Склад", "Бесплатно с", "Самая дешёвая платная", "Открытых дней", "Ближайшие дни"].map((label) => (
                  <th key={label} className="border-b px-3 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]" style={{ ...hubSans, color: hub.textSubtle, borderColor: hub.borderSoft }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.slice(0, 80).map((s) => (
                <tr key={`${s.warehouseId}:${s.boxTypeId ?? ""}`} className="border-b" style={{ borderColor: hub.borderSoft }}>
                  <td className="px-3 py-2.5 text-[13px] font-medium" style={{ ...hubSans, color: hub.text }}>
                    {s.warehouseName}
                    {ownWarehouses.has(s.warehouseName) ? (
                      <span className="ml-2 rounded-full px-1.5 py-px text-[10.5px] font-semibold" style={{ backgroundColor: hub.blueSoft, color: hub.blue }}>
                        ваш товар здесь
                      </span>
                    ) : null}
                    {s.isSortingCenter ? (
                      <span className="ml-2 text-[11px]" style={{ color: hub.textSubtle }}>
                        сортировочный центр
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold tabular-nums" style={{ color: s.nextFree ? hub.green : hub.textSubtle }}>
                    {s.nextFree ? dayLabel(s.nextFree) : "нет"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums" style={{ ...hubSans, color: hub.text }}>
                    {s.cheapestPaid ? `×${s.cheapestPaid.coefficient.toLocaleString("ru-RU")} · ${dayLabel(s.cheapestPaid.date)}` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{s.openDays}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex gap-1">
                      {s.days.slice(0, 14).map((d) => (
                        <span key={d.date} title={`${dayLabel(d.date)}: коэффициент ${d.coefficient}`} className="h-3 w-3 rounded-sm" style={{ backgroundColor: coefColor(d.coefficient) }} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {loadedAt ? (
        <p className="text-[11.5px]" style={{ ...hubSans, color: hub.textSubtle }}>
          Данные WB от {new Date(loadedAt).toLocaleString("ru-RU")}. Зелёный — бесплатно, синий — платно (×1).
        </p>
      ) : null}
    </div>
  );
}
