import type { UnitEconCategory } from "./types";

/**
 * Заготовка импорта Excel → категории.
 * Ожидаемые колонки (можно уточнить после получения файлов от пользователя):
 * marketplace | category_id | parent_name | name | commission_percent
 */
export type UnitEconExcelRow = {
  marketplace: "ozon" | "wildberries";
  externalId?: string;
  parentName?: string;
  name: string;
  commissionPercent: number;
};

export function parseUnitEconExcelRows(rawRows: Record<string, unknown>[]): UnitEconCategory[] {
  const out: UnitEconCategory[] = [];

  for (const [index, row] of rawRows.entries()) {
    const marketplaceRaw = String(row.marketplace ?? row.mp ?? "").toLowerCase();
    const marketplace =
      marketplaceRaw.includes("wb") || marketplaceRaw.includes("wild")
        ? "wildberries"
        : marketplaceRaw.includes("ozon")
          ? "ozon"
          : null;
    const name = String(row.name ?? row.category ?? row.category_name ?? "").trim();
    const commission = Number(row.commission_percent ?? row.commission ?? row.commissionPercent);
    if (!marketplace || !name || !Number.isFinite(commission)) continue;

    out.push({
      id: String(row.external_id ?? row.category_id ?? `${marketplace}-${index}`),
      marketplace,
      name,
      parentName: String(row.parent_name ?? row.parent ?? "").trim() || undefined,
      commissionPercent: commission,
    });
  }

  return out;
}
