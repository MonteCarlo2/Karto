/**
 * Слоты приёмки поставок FBO на склады WB (коэффициенты приёмки из Supplies API).
 * Коэффициент: 0 — приёмка бесплатная, 1 — платная по базовому тарифу, -1 — приёмка закрыта. По правилу WB поставку можно отправить,
 * только если коэффициент 0 или 1 и allowUnload = true; склады с большим коэффициентом (платная приёмка с наценкой) для отправки закрыты.
 * Показываем только то, что вернул WB, ничего не прогнозируем.
 */

export type AcceptanceRow = {
  date: string;
  coefficient: number;
  warehouseId: number;
  warehouseName: string;
  /** Можно ли сейчас отгрузить на этот день (allowUnload). */
  allowUnload: boolean;
  /** 2 — короба, 5 — монопаллеты, 6 — суперсейф. */
  boxTypeId: number | null;
  isSortingCenter: boolean;
};

export const BOX_TYPE_LABEL: Record<number, string> = { 2: "Короба", 5: "Монопаллеты", 6: "Суперсейф" };

export type WarehouseSlots = {
  warehouseId: number;
  warehouseName: string;
  boxTypeId: number | null;
  isSortingCenter: boolean;
  /** Ближайший день с бесплатной приёмкой. */
  nextFree: string | null;
  /** Самая дешёвая платная приёмка (коэффициент выше 0) среди доступных дней. */
  cheapestPaid: { date: string; coefficient: number } | null;
  /** Сколько дней из выданных доступны для отгрузки. */
  openDays: number;
  days: Array<{ date: string; coefficient: number }>;
};

const isOpen = (row: AcceptanceRow) => row.allowUnload && (row.coefficient === 0 || row.coefficient === 1);

export function buildWarehouseSlots(rows: AcceptanceRow[], boxTypeId: number | null): WarehouseSlots[] {
  const map = new Map<string, WarehouseSlots>();
  for (const row of rows) {
    if (boxTypeId != null && row.boxTypeId !== boxTypeId) continue;
    const key = `${row.warehouseId}:${row.boxTypeId ?? ""}`;
    const slot =
      map.get(key) ??
      { warehouseId: row.warehouseId, warehouseName: row.warehouseName, boxTypeId: row.boxTypeId, isSortingCenter: row.isSortingCenter, nextFree: null, cheapestPaid: null, openDays: 0, days: [] };
    if (isOpen(row)) {
      slot.openDays += 1;
      slot.days.push({ date: row.date, coefficient: row.coefficient });
      if (row.coefficient === 0 && (slot.nextFree == null || row.date < slot.nextFree)) slot.nextFree = row.date;
      if (row.coefficient > 0 && (slot.cheapestPaid == null || row.coefficient < slot.cheapestPaid.coefficient || (row.coefficient === slot.cheapestPaid.coefficient && row.date < slot.cheapestPaid.date))) {
        slot.cheapestPaid = { date: row.date, coefficient: row.coefficient };
      }
    }
    map.set(key, slot);
  }
  return [...map.values()]
    .map((s) => ({ ...s, days: s.days.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => {
      if (a.nextFree && b.nextFree) return a.nextFree.localeCompare(b.nextFree) || a.warehouseName.localeCompare(b.warehouseName, "ru");
      if (a.nextFree) return -1;
      if (b.nextFree) return 1;
      if (a.cheapestPaid && b.cheapestPaid) return a.cheapestPaid.coefficient - b.cheapestPaid.coefficient;
      if (a.cheapestPaid) return -1;
      if (b.cheapestPaid) return 1;
      return a.warehouseName.localeCompare(b.warehouseName, "ru");
    });
}
