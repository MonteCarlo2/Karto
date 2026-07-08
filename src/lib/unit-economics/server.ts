import { calculateOzonUnitEconomics } from "./calculate-ozon";
import { calculateWbUnitEconomics } from "./calculate-wb";
import type { UnitEconCalculatorInput, UnitEconCalculation } from "./types";

export function calculateUnitEconomics(input: UnitEconCalculatorInput): UnitEconCalculation {
  if (input.marketplace === "ozon") return calculateOzonUnitEconomics(input);
  return calculateWbUnitEconomics(input);
}

export {
  DEFAULT_UNIT_ECON_INPUT,
  defaultCategoryId,
  defaultClusterIds,
  resolveCategoryId,
} from "./index";
export type { UnitEconCalculatorInput, UnitEconCalculation } from "./types";
