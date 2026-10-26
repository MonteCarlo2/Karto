import type { SellerRegionOrdersRow, SellerWarehouseStockRow } from "@/lib/seller-hub/types";

/**
 * Логистика: спрос по регионам покупателей и остатки по складам WB.
 * Только данные WB (заказы по регионам и остатки по складам) и параметры продавца. Ничего не оценивается «на глаз».
 */

/** Название округа без слов «федеральный округ»: заказы называют «Центральный федеральный округ», склады — «Центральный». */
export function normalizeDistrict(name: string): string {
  return name
    .replace(/федеральный округ/gi, "")
    .replace(/(^|\s)фо(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Склады без региона и виртуальные склады WB не привязываем к округу покупателей. */
const NON_REGION = new Set(["", "склад wb"]);

export function isRealDistrict(name: string): boolean {
  return !NON_REGION.has(normalizeDistrict(name).toLowerCase());
}

export type DistrictDemand = {
  district: string;
  /** Заказы без отмен за период. */
  orders: number;
  /** Доля округа во всём спросе, 0…1. */
  share: number;
};

/** Спрос по округам покупателей (без отменённых заказов), по убыванию. */
export function demandByDistrict(rows: SellerRegionOrdersRow[], nmId?: string): { total: number; districts: DistrictDemand[] } {
  const acc = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (nmId != null && row.nmId !== nmId) continue;
    const net = Math.max(0, row.orders - row.cancelled);
    if (net === 0) continue;
    const district = normalizeDistrict(row.district) || "Не определён";
    acc.set(district, (acc.get(district) ?? 0) + net);
    total += net;
  }
  const districts = [...acc.entries()]
    .map(([district, orders]) => ({ district, orders, share: total > 0 ? orders / total : 0 }))
    .sort((a, b) => b.orders - a.orders);
  return { total, districts };
}

export type WarehouseSummary = {
  warehouseId: number;
  warehouseName: string;
  district: string;
  quantity: number;
  inWayToClient: number;
  inWayFromClient: number;
  /** Сколько артикулов лежит на складе. */
  products: number;
};

/** Остатки по складам WB, по убыванию количества. */
export function summarizeWarehouses(rows: SellerWarehouseStockRow[]): WarehouseSummary[] {
  const acc = new Map<number, WarehouseSummary & { nm: Set<string> }>();
  for (const row of rows) {
    const cur = acc.get(row.warehouseId) ?? {
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      district: normalizeDistrict(row.regionName),
      quantity: 0,
      inWayToClient: 0,
      inWayFromClient: 0,
      products: 0,
      nm: new Set<string>(),
    };
    cur.quantity += row.quantity;
    cur.inWayToClient += row.inWayToClient;
    cur.inWayFromClient += row.inWayFromClient;
    if (row.quantity > 0) cur.nm.add(row.nmId);
    cur.products = cur.nm.size;
    acc.set(row.warehouseId, cur);
  }
  return [...acc.values()]
    .map((row) => ({
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      district: row.district,
      quantity: row.quantity,
      inWayToClient: row.inWayToClient,
      inWayFromClient: row.inWayFromClient,
      products: row.products,
    }))
    .sort((a, b) => b.quantity - a.quantity);
}

export type ShipmentPlanRow = {
  nmId: string;
  district: string;
  /** Заказов в день по округу (без отмен). */
  dailyDemand: number;
  /** Остаток на складах округа, шт. */
  stock: number;
  /** На сколько дней хватит остатка в округе. null — спроса нет. */
  daysCover: number | null;
  /** Сколько отгрузить в округ, шт., кратно multiple. */
  need: number;
};

/**
 * План отгрузки по округам: нужный запас = спрос в день × дни покрытия − остаток в округе, округлённый вверх до кратности короба.
 * Спрос берём из заказов покупателей этого округа за periodDays; остаток — со складов WB этого округа.
 * Заказы из округов без склада WB остаются в плане: туда нечего «довезти», пока не появится остаток в округе.
 */
export function buildShipmentPlan(input: {
  orders: SellerRegionOrdersRow[];
  stock: SellerWarehouseStockRow[];
  periodDays: number;
  coverDays: number;
  /** Кратность короба, шт. Минимум 1. */
  multiple: number;
}): ShipmentPlanRow[] {
  const periodDays = Math.max(1, input.periodDays);
  const multiple = Math.max(1, Math.floor(input.multiple));
  const demand = new Map<string, number>();
  for (const row of input.orders) {
    const net = Math.max(0, row.orders - row.cancelled);
    if (net === 0) continue;
    const key = `${row.nmId}|${normalizeDistrict(row.district) || "Не определён"}`;
    demand.set(key, (demand.get(key) ?? 0) + net);
  }
  const stock = new Map<string, number>();
  for (const row of input.stock) {
    if (!isRealDistrict(row.regionName)) continue;
    const key = `${row.nmId}|${normalizeDistrict(row.regionName)}`;
    stock.set(key, (stock.get(key) ?? 0) + row.quantity);
  }
  const rows: ShipmentPlanRow[] = [];
  for (const [key, orders] of demand) {
    const [nmId, district] = key.split("|") as [string, string];
    const dailyDemand = orders / periodDays;
    const have = stock.get(key) ?? 0;
    const raw = dailyDemand * input.coverDays - have;
    const need = raw > 0 ? Math.ceil(raw / multiple) * multiple : 0;
    rows.push({
      nmId,
      district,
      dailyDemand: Math.round(dailyDemand * 100) / 100,
      stock: have,
      daysCover: dailyDemand > 0 ? Math.round((have / dailyDemand) * 10) / 10 : null,
      need,
    });
  }
  return rows.sort((a, b) => b.need - a.need || a.daysCover! - b.daysCover!);
}

export type CoverRow = {
  nmId: string;
  /** Заказов в день по всем округам (без отмен). */
  dailyDemand: number;
  wbStock: number;
  ownStock: number;
  /** Дней до нуля по общему остатку (склады WB + ваш склад). */
  daysCover: number;
  /** soon14 — меньше 14 дней, soon30 — меньше 30, ok — больше. */
  level: "soon14" | "soon30" | "ok";
};

/** Запас по всем товарам со спросом, от самого короткого. Показываем всегда, не только риски: пустого экрана быть не должно. */
export function buildCoverRows(input: {
  orders: SellerRegionOrdersRow[];
  periodDays: number;
  wbStock: SellerWarehouseStockRow[];
  ownStock: Map<string, number>;
}): CoverRow[] {
  const periodDays = Math.max(1, input.periodDays);
  const demand = new Map<string, number>();
  for (const row of input.orders) {
    const net = Math.max(0, row.orders - row.cancelled);
    if (net > 0) demand.set(row.nmId, (demand.get(row.nmId) ?? 0) + net);
  }
  const wb = new Map<string, number>();
  for (const row of input.wbStock) wb.set(row.nmId, (wb.get(row.nmId) ?? 0) + row.quantity);
  const rows: CoverRow[] = [];
  for (const [nmId, orders] of demand) {
    const dailyDemand = orders / periodDays;
    const wbStock = wb.get(nmId) ?? 0;
    const ownStock = input.ownStock.get(nmId) ?? 0;
    const daysCover = (wbStock + ownStock) / dailyDemand;
    rows.push({
      nmId,
      dailyDemand: Math.round(dailyDemand * 100) / 100,
      wbStock,
      ownStock,
      daysCover: Math.round(daysCover * 10) / 10,
      level: daysCover <= 14 ? "soon14" : daysCover <= 30 ? "soon30" : "ok",
    });
  }
  return rows.sort((a, b) => a.daysCover - b.daysCover);
}

export type OosRiskRow = {
  nmId: string;
  /** Заказов в день по всем округам (без отмен). */
  dailyDemand: number;
  /** Остаток на складах WB, шт. */
  wbStock: number;
  /** Остаток на вашем складе (FBS), шт. */
  ownStock: number;
  /** Дней до нуля по общему остатку. */
  daysCover: number;
  /** soon14 — закончится в течение 14 дней: пора отгружать; soon30 — в течение 30: пора производить или закупать. */
  level: "soon14" | "soon30";
};

/**
 * Риск остаться без товара: общий остаток (склады WB + ваш склад) ÷ средний спрос в день.
 * Пороги 14 и 30 дней: за 30 дней пора заказывать или производить, за 14 — отгружать. Товары без спроса не попадают в список.
 */
export function buildOosRisks(input: {
  orders: SellerRegionOrdersRow[];
  periodDays: number;
  wbStock: SellerWarehouseStockRow[];
  /** Остаток на вашем складе по артикулу. */
  ownStock: Map<string, number>;
}): OosRiskRow[] {
  const periodDays = Math.max(1, input.periodDays);
  const demand = new Map<string, number>();
  for (const row of input.orders) {
    const net = Math.max(0, row.orders - row.cancelled);
    if (net > 0) demand.set(row.nmId, (demand.get(row.nmId) ?? 0) + net);
  }
  const wb = new Map<string, number>();
  for (const row of input.wbStock) wb.set(row.nmId, (wb.get(row.nmId) ?? 0) + row.quantity);
  const rows: OosRiskRow[] = [];
  for (const [nmId, orders] of demand) {
    const dailyDemand = orders / periodDays;
    const wbStock = wb.get(nmId) ?? 0;
    const ownStock = input.ownStock.get(nmId) ?? 0;
    const daysCover = (wbStock + ownStock) / dailyDemand;
    if (daysCover > 30) continue;
    rows.push({
      nmId,
      dailyDemand: Math.round(dailyDemand * 100) / 100,
      wbStock,
      ownStock,
      daysCover: Math.round(daysCover * 10) / 10,
      level: daysCover <= 14 ? "soon14" : "soon30",
    });
  }
  return rows.sort((a, b) => a.daysCover - b.daysCover);
}
