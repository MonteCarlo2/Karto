import categoriesJson from "../data/ozon/categories.json";
import logisticsJson from "../data/ozon/logistics.json";
import metaJson from "../data/ozon/meta.json";
import type {
  OzonCategoryItem,
  OzonDefaultLogisticsRate,
  OzonLogisticsRate,
  OzonTariffMeta,
  OzonVolumeBand,
} from "./types";

type CategoriesFile = {
  effectiveFrom: string;
  items: OzonCategoryItem[];
};

type LogisticsFile = {
  volumeBands: OzonVolumeBand[];
  matrix: OzonLogisticsRate[];
  defaults: OzonDefaultLogisticsRate[];
};

let categoryById: Map<string, OzonCategoryItem> | null = null;
let logisticsMap: Map<string, number> | null = null;
let defaultLogisticsMap: Map<string, number> | null = null;

const categoriesFile = categoriesJson as unknown as CategoriesFile;
const logisticsFile = logisticsJson as unknown as LogisticsFile;
export const ozonTariffMeta = metaJson as OzonTariffMeta;

function logisticsKey(ship: string, delivery: string, bandId: number, over300: boolean): string {
  return `${ship}\u0001${delivery}\u0001${bandId}\u0001${over300 ? 1 : 0}`;
}

function defaultKey(bandId: number, over300: boolean): string {
  return `${bandId}\u0001${over300 ? 1 : 0}`;
}

export function getOzonCategoryById(id: string): OzonCategoryItem | undefined {
  if (!categoryById) {
    categoryById = new Map(categoriesFile.items.map((item) => [item.id, item]));
  }
  return categoryById.get(id);
}

function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function categorySearchHaystack(item: OzonCategoryItem): string {
  return `${item.parentName} ${item.categoryName} ${item.name}`.toLowerCase();
}

function scoreOzonCategory(item: OzonCategoryItem, tokens: string[]): number {
  if (tokens.length === 0) return 0;

  const haystack = categorySearchHaystack(item);
  for (const token of tokens) {
    if (!haystack.includes(token)) return -1;
  }

  const name = item.name.toLowerCase();
  const category = item.categoryName.toLowerCase();
  const parent = item.parentName.toLowerCase();
  const joined = tokens.join(" ");

  let score = 0;

  if (name === joined) score += 10_000;
  else if (name.startsWith(joined)) score += 5_000;
  else if (name.includes(joined)) score += 2_500;

  const allInName = tokens.every((token) => name.includes(token));
  if (allInName) score += 1_500;

  if (allInName && tokens.length > 1) {
    let from = 0;
    let ordered = true;
    for (const token of tokens) {
      const idx = name.indexOf(token, from);
      if (idx < 0) {
        ordered = false;
        break;
      }
      from = idx + token.length;
    }
    if (ordered) score += 800;
  }

  for (const token of tokens) {
    if (name.startsWith(token)) score += 400;
    else if (name.includes(token)) score += 200;
    if (category.includes(token)) score += 80;
    if (parent.includes(token)) score += 30;
  }

  score -= name.length * 0.5;
  return score;
}

export function searchOzonCategories(query: string, limit = 30): OzonCategoryItem[] {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return [];

  const scored: { item: OzonCategoryItem; score: number }[] = [];
  for (const item of categoriesFile.items) {
    const score = scoreOzonCategory(item, tokens);
    if (score >= 0) scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, "ru"));
  return scored.slice(0, limit).map((row) => row.item);
}

export type OzonCategoryBrowseEntry = {
  label: string;
  count: number;
};

let categoryParents: string[] | null = null;
let categoryGroupsByParent: Map<string, string[]> | null = null;
let categoryTypesByKey: Map<string, OzonCategoryItem[]> | null = null;
let categoryParentCounts: Map<string, number> | null = null;
let categoryGroupCounts: Map<string, number> | null = null;

function parentGroupKey(parentName: string, categoryName: string): string {
  return `${parentName}\u0001${categoryName}`;
}

function ensureCategoryBrowseIndex(): void {
  if (categoryParents) return;

  const groupsMap = new Map<string, Set<string>>();
  const typesMap = new Map<string, OzonCategoryItem[]>();
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

export function listOzonCategoryParents(): OzonCategoryBrowseEntry[] {
  ensureCategoryBrowseIndex();
  return categoryParents!.map((label) => ({
    label,
    count: categoryParentCounts!.get(label) ?? 0,
  }));
}

export function listOzonCategoryGroups(parentName: string): OzonCategoryBrowseEntry[] {
  ensureCategoryBrowseIndex();
  const groups = categoryGroupsByParent!.get(parentName) ?? [];
  return groups.map((label) => ({
    label,
    count: categoryGroupCounts!.get(parentGroupKey(parentName, label)) ?? 0,
  }));
}

export function listOzonCategoryTypes(parentName: string, categoryName: string): OzonCategoryItem[] {
  ensureCategoryBrowseIndex();
  return categoryTypesByKey!.get(parentGroupKey(parentName, categoryName)) ?? [];
}

export function getOzonCategoryLabel(id: string): string {
  return getOzonCategoryById(id)?.label ?? getOzonCategoryById(id)?.name ?? "Категория";
}

export function getOzonVolumeBands(): OzonVolumeBand[] {
  return logisticsFile.volumeBands;
}

function ensureLogisticsMaps(): void {
  if (logisticsMap && defaultLogisticsMap) return;
  logisticsMap = new Map();
  for (const row of logisticsFile.matrix) {
    logisticsMap.set(logisticsKey(row.ship, row.delivery, row.bandId, false), row.under300);
    logisticsMap.set(logisticsKey(row.ship, row.delivery, row.bandId, true), row.over300);
  }
  defaultLogisticsMap = new Map();
  for (const row of logisticsFile.defaults) {
    defaultLogisticsMap.set(defaultKey(row.bandId, false), row.under300);
    defaultLogisticsMap.set(defaultKey(row.bandId, true), row.over300);
  }
}

export function resolveOzonVolumeBandId(billableLiters: number): number {
  const liters = Math.max(0, billableLiters);
  for (const band of logisticsFile.volumeBands) {
    if (liters >= band.minLiters && liters <= band.maxLiters) {
      return band.id;
    }
  }
  const last = logisticsFile.volumeBands[logisticsFile.volumeBands.length - 1];
  return last?.id ?? 0;
}

export function lookupOzonLogisticsRate(
  shipCluster: string,
  deliveryCluster: string,
  bandId: number,
  priceRub: number
): { rate: number; usedDefault: boolean } {
  ensureLogisticsMaps();
  const over300 = priceRub > 300;
  const key = logisticsKey(shipCluster, deliveryCluster, bandId, over300);
  const direct = logisticsMap!.get(key);
  if (direct != null) return { rate: direct, usedDefault: false };

  const fallbackKey = defaultKey(bandId, over300);
  const fallback = defaultLogisticsMap!.get(fallbackKey);
  if (fallback != null) return { rate: fallback, usedDefault: true };

  return { rate: 0, usedDefault: true };
}

export function commissionTierIndex(priceRub: number): 0 | 1 | 2 {
  if (priceRub <= 100) return 0;
  if (priceRub <= 300) return 1;
  return 2;
}

export function getOzonCommissionPercent(
  category: OzonCategoryItem | undefined,
  model: "fbo" | "fbs",
  priceRub: number
): number {
  if (!category) return model === "fbo" ? 15 : 18;
  const tier = commissionTierIndex(priceRub);
  const tiers = model === "fbo" ? category.commissionFbo : category.commissionFbs;
  return tiers[tier] ?? tiers[2] ?? 0;
}
