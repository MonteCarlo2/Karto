/**
 * Проверки, через которые обязано пройти любое предложение агента про цену, прежде чем человек его увидит.
 * Чистые функции: решение принимает программа, а не нейросеть. Нейросеть может предложить цену, но не может обойти эти проверки.
 * Числа в WB всегда берутся из результата проверки (после ограничения шага), а не из ответа нейросети.
 */

export type PriceGuardConfig = {
  /** Запас над безубыточной ценой, доля (0.05 = на 5% выше). Пол цены нельзя поставить ниже безубыточности. */
  breakEvenCushion: number;
  /** Максимальное изменение цены со скидкой продавца за один раз, доля. */
  maxStep: number;
  /** Сколько часов после прошлого изменения цены этого товара ничего не менять. */
  cooldownHours: number;
  /** Минимальная цена со скидкой продавца, заданная человеком, ₽. Может только поднять пол, не опустить ниже безубыточности. */
  userMinPrice: number | null;
};

export const DEFAULT_PRICE_GUARD: PriceGuardConfig = { breakEvenCushion: 0.05, maxStep: 0.05, cooldownHours: 24, userMinPrice: null };

export type PriceChangeInput = {
  /** Цена продавца до скидки и скидка продавца, % — то, что сейчас в WB. */
  currentBase: number;
  currentDiscount: number;
  /** Что предлагается. */
  proposedBase: number;
  proposedDiscount: number;
  /** Цена со скидкой продавца, при которой прибыль на одну продажу равна нулю, ₽. null — посчитать нельзя. */
  breakEvenBuyerPrice: number | null;
  stock: number | null;
  /** Когда цену товара меняли в последний раз (ISO), включая наши действия и правки человека. */
  lastChangeAt: string | null;
  nowMs: number;
};

export type GuardIssue = { code: "no_break_even" | "below_floor" | "step_too_big" | "cooldown" | "no_stock" | "bad_numbers" | "no_change"; text: string; blocking: boolean };

export type PriceGuardResult = {
  /** true — предложение можно показывать человеку (возможно, после ограничения шага). */
  ok: boolean;
  issues: GuardIssue[];
  /** Итоговые числа для записи: уже ограничены шагом и полом. Только они уходят в WB. */
  final: { base: number; discount: number; buyerPrice: number } | null;
  /** Пол цены со скидкой продавца, ₽ (по нему видно, почему шаг ограничен). */
  floorBuyerPrice: number | null;
};

export const buyerPrice = (base: number, discountPercent: number): number => base * (1 - discountPercent / 100);

const round2 = (v: number) => Math.round(v * 100) / 100;

export function checkPriceChange(input: PriceChangeInput, config: PriceGuardConfig = DEFAULT_PRICE_GUARD): PriceGuardResult {
  const issues: GuardIssue[] = [];
  const fail = (issue: GuardIssue): PriceGuardResult => ({ ok: false, issues: [...issues, issue], final: null, floorBuyerPrice: null });

  const numbers = [input.currentBase, input.currentDiscount, input.proposedBase, input.proposedDiscount];
  if (numbers.some((n) => !Number.isFinite(n)) || input.currentBase <= 0 || input.proposedBase <= 0) {
    return fail({ code: "bad_numbers", text: "Цена или скидка заданы неверно", blocking: true });
  }
  if (input.proposedDiscount < 0 || input.proposedDiscount >= 95 || input.currentDiscount < 0 || input.currentDiscount >= 95) {
    return fail({ code: "bad_numbers", text: "Скидка должна быть от 0 до 94%", blocking: true });
  }

  // Без безубыточной цены нельзя доказать, что цена не уйдёт в убыток: понижать нельзя, повышать можно.
  const current = buyerPrice(input.currentBase, input.currentDiscount);
  const proposed = buyerPrice(input.proposedBase, input.proposedDiscount);
  if (Math.abs(proposed - current) < 0.5) return fail({ code: "no_change", text: "Цена со скидкой продавца не меняется", blocking: true });
  const lowering = proposed < current;

  let floor: number | null = null;
  if (input.breakEvenBuyerPrice != null && input.breakEvenBuyerPrice > 0) {
    floor = input.breakEvenBuyerPrice * (1 + config.breakEvenCushion);
    if (config.userMinPrice != null && config.userMinPrice > floor) floor = config.userMinPrice;
  } else if (lowering) {
    return fail({ code: "no_break_even", text: "Не хватает данных о себестоимости и расходах, чтобы доказать, что цена не уйдёт в убыток", blocking: true });
  }

  if (input.lastChangeAt) {
    const last = Date.parse(input.lastChangeAt);
    if (Number.isFinite(last) && input.nowMs - last < config.cooldownHours * 3_600_000) {
      issues.push({ code: "cooldown", text: `Цену этого товара меняли меньше ${config.cooldownHours} ч назад: ждём результата прошлого изменения`, blocking: true });
      return { ok: false, issues, final: null, floorBuyerPrice: floor };
    }
  }

  if (lowering && (input.stock ?? 0) <= 0) {
    issues.push({ code: "no_stock", text: "Остатка нет: снижать цену смысла нет", blocking: true });
    return { ok: false, issues, final: null, floorBuyerPrice: floor };
  }

  // Ограничиваем шаг, затем пол. Направление и скидка продавца сохраняются, меняется только базовая цена.
  let target = proposed;
  const maxMove = current * config.maxStep;
  if (Math.abs(target - current) > maxMove) {
    target = lowering ? current - maxMove : current + maxMove;
    issues.push({ code: "step_too_big", text: `Шаг ограничен ${Math.round(config.maxStep * 100)}% за один раз`, blocking: false });
  }
  if (lowering && floor != null && target < floor) {
    if (floor >= current) {
      issues.push({ code: "below_floor", text: "Цена уже на полу (безубыточность с запасом): снижать нельзя", blocking: true });
      return { ok: false, issues, final: null, floorBuyerPrice: floor };
    }
    target = floor;
    issues.push({ code: "below_floor", text: "Цена ограничена полом: безубыточность с запасом", blocking: false });
  }

  const discount = input.proposedDiscount;
  const base = Math.ceil(target / (1 - discount / 100));
  const finalBuyer = round2(buyerPrice(base, discount));
  // После округления базовой цены вверх цена со скидкой продавца не должна выйти за пол вниз и не должна перескочить текущую.
  if (lowering && floor != null && finalBuyer < floor - 0.01) {
    return fail({ code: "below_floor", text: "После округления цена оказалась ниже пола", blocking: true });
  }
  if (Math.abs(finalBuyer - current) < 0.5) return fail({ code: "no_change", text: "После ограничений цена не меняется", blocking: true });
  return { ok: true, issues, final: { base, discount, buyerPrice: finalBuyer }, floorBuyerPrice: floor };
}

/**
 * Проверка «на фактах»: каждое утверждение предложения (например, «конверсия в корзину 2,1%») должно совпасть с данными кабинета.
 * Расхождение больше допуска означает, что нейросеть выдумала или перепутала число, и предложение отбрасывается.
 */
export type EvidenceClaim = { key: string; value: number };

export function checkEvidence(claims: EvidenceClaim[], facts: Record<string, number | null | undefined>, tolerance = 0.02): { ok: boolean; wrong: Array<{ key: string; claimed: number; actual: number | null }> } {
  const wrong: Array<{ key: string; claimed: number; actual: number | null }> = [];
  for (const claim of claims) {
    const actual = facts[claim.key];
    if (actual == null || !Number.isFinite(actual)) {
      wrong.push({ key: claim.key, claimed: claim.value, actual: null });
      continue;
    }
    const scale = Math.max(Math.abs(actual), 1);
    if (Math.abs(actual - claim.value) / scale > tolerance) wrong.push({ key: claim.key, claimed: claim.value, actual });
  }
  return { ok: wrong.length === 0, wrong };
}
