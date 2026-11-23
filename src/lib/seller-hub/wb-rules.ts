/**
 * Правила Wildberries, которые сервис обязан знать: от них зависят допустимые суммы и шаги. Все числа в одном месте, чтобы сайт, агент и Telegram
 * не расходились. Wildberries периодически пересматривает пороги: при изменении правим только здесь.
 */

/** Минимальное пополнение рекламного бюджета кампании, ₽. Значение подтверждено владельцем; в официальной справке WB число не найдено, сверять при изменении правил. */
export const WB_ADS_MIN_DEPOSIT_RUB = 1000;

/** Ступени пополнения, которые предлагаем кнопками: все не меньше минимума. */
export const WB_ADS_DEPOSIT_STEPS = [1000, 2000, 5000] as const;

export const fmtRubShort = (n: number) => `${n.toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;

/** Текст отказа для суммы пополнения ниже минимума. null: сумма допустима. */
export function depositMinMessage(sumRub: number): string | null {
  return sumRub < WB_ADS_MIN_DEPOSIT_RUB ? `Минимальное пополнение рекламной кампании — ${fmtRubShort(WB_ADS_MIN_DEPOSIT_RUB)}. Выберите сумму не меньше.` : null;
}
