import categoriesJson from "../data/wb/categories.json";
import logisticsJson from "../data/wb/logistics.json";
import metaJson from "../data/wb/meta.json";
import { formatWbCategoryDisplayName } from "./category-display";
import type { WbCategoryItem, WbLocalizationBracket, WbTariffMeta, WbWarehouse } from "./types";

export { formatWbCategoryDisplayName };
type CategoriesFile = {
  effectiveFrom: string;
  sourceFile: string;
  count: number;
  items: WbCategoryItem[];
};

type LogisticsFile = {
  effectiveFrom: string;
  baseFirstLiterRub: number;
  baseAdditionalLiterRub: number;
  customerReturnRubDefault: number;
  localizationBrackets: WbLocalizationBracket[];
  warehouses: WbWarehouse[];
};

let categoryById: Map<string, WbCategoryItem> | null = null;let categoryParents: string[] | null = null;
let categoryGroupsByParent: Map<string, string[]> | null = null;
let categoryTypesByKey: Map<string, WbCategoryItem[]> | null = null;
let categoryParentCounts: Map<string, number> | null = null;
let categoryGroupCounts: Map<string, number> | null = null;

const categoriesFile = categoriesJson as unknown as CategoriesFile;
const logisticsFile = logisticsJson as unknown as LogisticsFile;
export const wbTariffMeta = metaJson as WbTariffMeta;

export const wbLogisticsBaseRates = {
  firstLiterRub: logisticsFile.baseFirstLiterRub,
  additionalLiterRub: logisticsFile.baseAdditionalLiterRub,
  customerReturnRubDefault: logisticsFile.customerReturnRubDefault,
};

let warehouseById: Map<string, WbWarehouse> | null = null;

function ensureWarehouses(): void {
  if (warehouseById) return;
  warehouseById = new Map(logisticsFile.warehouses.map((w) => [w.id, w]));
}

export function getWbWarehouse(id: string): WbWarehouse | undefined {
  ensureWarehouses();
  return warehouseById!.get(id);
}

export function listWbWarehousesFromTariffs(): WbWarehouse[] {
  ensureWarehouses();
  return logisticsFile.warehouses;
}

export function lookupWbLocalizationBracket(
  sharePercent: number | null | undefined
): WbLocalizationBracket | null {
  if (sharePercent == null || Number.isNaN(sharePercent)) return null;
  const share = Math.max(0, Math.min(100, sharePercent));
  return (
    logisticsFile.localizationBrackets.find(
      (row) => share >= row.minShare && share <= row.maxShare
    ) ?? null
  );
}
function parentGroupKey(parentName: string, categoryName: string): string {
  return `${parentName}\u0001${categoryName}`;
}

function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function categorySearchHaystack(item: WbCategoryItem): string {
  const noisyBreadcrumb =
    item.parentName.length > 90 ||
    item.categoryName.length > 90 ||
    /Маркетплейс|Витрина|DBS|DBW|EDBS|C&C/i.test(`${item.parentName} ${item.categoryName}`);
  const displayName = categorySearchName(item);
  const breadcrumb = noisyBreadcrumb ? "" : `${item.parentName} ${item.categoryName}`;
  return `${displayName} ${item.name} ${breadcrumb}`.toLowerCase();
}

function categorySearchName(item: WbCategoryItem): string {
  const fallbackToCategory =
    /^товар$/i.test(item.name.trim()) &&
    item.categoryName.length <= 90 &&
    !/Маркетплейс|Витрина|DBS|DBW|EDBS|C&C/i.test(item.categoryName);
  return formatWbCategoryDisplayName(fallbackToCategory ? item.categoryName : item.name).toLowerCase();
}

function scoreWbCategory(item: WbCategoryItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const haystack = categorySearchHaystack(item);
  for (const token of tokens) {
    if (!haystack.includes(token)) return -1;
  }

  const name = categorySearchName(item);
  const category = item.categoryName.toLowerCase();
  const parent = item.parentName.toLowerCase();
  const joined = tokens.join(" ");

  if (tokens.length >= 2 && !tokens.every((token) => name.includes(token))) {
    return -1;
  }

  let score = 0;
  if (name === joined) score += 10_000;
  else if (name.startsWith(joined)) score += 5_000;
  else if (name.includes(joined)) score += 2_500;

  const allInName = tokens.every((token) => name.includes(token));
  if (allInName) score += 1_500;

  for (const token of tokens) {
    if (name.startsWith(token)) score += 400;
    else if (name.includes(token)) score += 200;
    if (category.includes(token)) score += 80;
    if (parent.includes(token)) score += 30;
  }

  score -= name.length * 0.5;
  return score;
}

function ensureCategoryBrowseIndex(): void {
  if (categoryParents) return;

  const groupsMap = new Map<string, Set<string>>();
  const typesMap = new Map<string, WbCategoryItem[]>();
  const parentCounts = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  const parents = new Set<string>();

  for (const item of categoriesFile.items) {
    parents.add(item.parentName);
    parentCounts.set(item.parentName, (parentCounts.get(item.parentName) ?? 0) + 1);

    if (!groupsMap.has(item.parentName)) groupsMap.set(item.parentName, new Set());
    groupsMap.get(item.parentName)!.add(item.categoryName);

    const key = parentGroupKey(item.parentName, item.categoryName);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    if (!typesMap.has(key)) typesMap.set(key, []);
    typesMap.get(key)!.push(item);
  }

  categoryParents = [...parents].sort((a, b) => a.localeCompare(b, "ru"));
  categoryGroupsByParent = new Map(
    [...groupsMap.entries()].map(([parent, groups]) => [
      parent,
      [...groups].sort((a, b) => a.localeCompare(b, "ru")),
    ])
  );
  for (const list of typesMap.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }
  categoryTypesByKey = typesMap;
  categoryParentCounts = parentCounts;
  categoryGroupCounts = groupCounts;
}

export function getWbCategoryById(id: string): WbCategoryItem | undefined {
  if (!categoryById) {
    categoryById = new Map(categoriesFile.items.map((item) => [item.id, item]));
  }
  return categoryById.get(id);
}

export function searchWbCategories(query: string, limit = 30): WbCategoryItem[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  const scored: { item: WbCategoryItem; score: number }[] = [];
  for (const item of categoriesFile.items) {
    const score = scoreWbCategory(item, tokens);
    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "ru"));
  return scored.slice(0, limit).map((row) => row.item);
}

export type WbCategoryBrowseEntry = {
  label: string;
  count: number;
};

export function listWbCategoryParents(): WbCategoryBrowseEntry[] {
  ensureCategoryBrowseIndex();
  return categoryParents!.map((label) => ({
    label,
    count: categoryParentCounts!.get(label) ?? 0,
  }));
}

export function listWbCategoryGroups(parentName: string): WbCategoryBrowseEntry[] {
  ensureCategoryBrowseIndex();
  const groups = categoryGroupsByParent!.get(parentName) ?? [];
  return groups.map((label) => ({
    label,
    count: categoryGroupCounts!.get(parentGroupKey(parentName, label)) ?? 0,
  }));
}

export function listWbCategoryTypes(parentName: string, categoryName: string): WbCategoryItem[] {
  ensureCategoryBrowseIndex();
  return categoryTypesByKey!.get(parentGroupKey(parentName, categoryName)) ?? [];
}

export function getWbCategoryLabel(id: string): string {
  const item = getWbCategoryById(id);
  return item ? formatWbCategoryDisplayName(item.name) : "Категория";
}

export function getWbCommissionPercent(
  category: WbCategoryItem | undefined,
  model: "fbw" | "fbs"
): number {
  const item = category ?? getWbCategoryById(wbTariffMeta.defaultCategoryId);
  if (!item) return model === "fbw" ? 29.5 : 33;
  return model === "fbw" ? item.commissionFbw : item.commissionFbs;
}
