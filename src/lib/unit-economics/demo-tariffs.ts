import type { UnitEconCategory } from "./types";

/**
 * Демо-справочник категорий до загрузки Excel.
 * Заменяется импортом из Supabase / XLSX без смены UI.
 */
export const DEMO_UNIT_ECON_CATEGORIES: UnitEconCategory[] = [
  {
    id: "ozon-marker",
    marketplace: "ozon",
    name: "Маркер строительный",
    parentName: "Строительные инструменты",
    commissionPercent: 12,
  },
  {
    id: "ozon-bucket",
    marketplace: "ozon",
    name: "Ведро хозяйственное",
    parentName: "Хозяйственные товары",
    commissionPercent: 15,
  },
  {
    id: "ozon-cosmetics",
    marketplace: "ozon",
    name: "Крем для лица",
    parentName: "Косметика",
    commissionPercent: 18,
  },
  {
    id: "ozon-electronics",
    marketplace: "ozon",
    name: "Наушники беспроводные",
    parentName: "Электроника",
    commissionPercent: 10,
  },
  {
    id: "ozon-clothing",
    marketplace: "ozon",
    name: "Футболка",
    parentName: "Одежда",
    commissionPercent: 20,
  },
  {
    id: "ozon-home-textile",
    marketplace: "ozon",
    name: "Полотенце банное",
    parentName: "Текстиль",
    commissionPercent: 16,
  },
  {
    id: "wb-bucket",
    marketplace: "wildberries",
    name: "Ведра хозяйственные",
    parentName: "Хозяйственные товары",
    commissionPercent: 15,
  },
  {
    id: "wb-marker",
    marketplace: "wildberries",
    name: "Маркер строительный",
    parentName: "Строительные инструменты",
    commissionPercent: 13,
  },
  {
    id: "wb-cosmetics",
    marketplace: "wildberries",
    name: "Крем для лица",
    parentName: "Косметика",
    commissionPercent: 19,
  },
  {
    id: "wb-electronics",
    marketplace: "wildberries",
    name: "Наушники беспроводные",
    parentName: "Электроника",
    commissionPercent: 11,
  },
  {
    id: "wb-clothing",
    marketplace: "wildberries",
    name: "Футболка",
    parentName: "Одежда",
    commissionPercent: 21,
  },
  {
    id: "wb-kids",
    marketplace: "wildberries",
    name: "Игрушка детская",
    parentName: "Детские товары",
    commissionPercent: 17,
  },
];

export function getCategoriesForMarketplace(
  marketplace: UnitEconCategory["marketplace"]
): UnitEconCategory[] {
  return DEMO_UNIT_ECON_CATEGORIES.filter((c) => c.marketplace === marketplace);
}

export function getCategoryById(id: string): UnitEconCategory | undefined {
  return DEMO_UNIT_ECON_CATEGORIES.find((c) => c.id === id);
}
