/**
 * Совместимость: единые кредиты живут в `@/lib/credits-pricing`.
 * Старые импорты VIDEO_TOKEN_PACKAGES ожидают поле `tokens`.
 */
export {
  computeFreeVideoCreditCost as computeFreeVideoTokenCost,
  computeProductVideoCreditCost as computeProductVideoTokenCost,
  estimateGrokImagine720CreditCost as estimateGrokImagine720TokenCost,
  estimateSeedance1080CreditCost as estimateSeedance1080TokenCost,
  formatCreditShort as formatTokenShort,
  getVideoPolicyStandardRows,
  getVideoPolicyProRows,
  getVideoPolicySyncPerSec,
  type FreeVideoCostInput,
  type ProductVideoCostInput,
  type VideoModeKey,
} from "@/lib/credits-pricing";

import { CREDIT_PACKAGES } from "@/lib/credits-pricing";

/** @deprecated Используйте CREDIT_PACKAGES. Поле tokens = credits. */
export const VIDEO_TOKEN_PACKAGES = CREDIT_PACKAGES.map((p) => ({
  id: p.id,
  name: p.name,
  priceRub: p.priceRub,
  tokens: p.credits,
})) as ReadonlyArray<{
  id: string;
  name: string;
  priceRub: number;
  tokens: number;
}>;
