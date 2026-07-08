import { getOzonCategoryById } from "./ozon/tariffs";
import { OZON_DEFAULT_CATEGORY_ID } from "./ozon-meta";
import { getWbCategoryById } from "./wb/tariffs";
import { WB_DEFAULT_CATEGORY_ID } from "./wb-meta";
import type { UnitEconMarketplace } from "./types";

/** Категория должна принадлежать выбранному маркетплейсу — иначе подставляем дефолт WB/Ozon. */
export function resolveCategoryId(
  marketplace: UnitEconMarketplace,
  categoryId: string
): string {
  const id = categoryId.trim();
  if (marketplace === "ozon") {
    return getOzonCategoryById(id) ? id : OZON_DEFAULT_CATEGORY_ID;
  }
  return getWbCategoryById(id) ? id : WB_DEFAULT_CATEGORY_ID;
}
