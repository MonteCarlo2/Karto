/** Пакеты автоответов: 1 ответ = 1 списание. Период — 30 дней с даты оплаты. */

export const AUTO_REPLY_PERIOD_DAYS = 30;



export const AUTO_REPLY_PACKAGES = [

  { replies: 50, priceRub: 249 },

  { replies: 100, priceRub: 429 },

  { replies: 250, priceRub: 990 },

  { replies: 500, priceRub: 1_750 },

  { replies: 1_500, priceRub: 4_350 },

  { replies: 5_000, priceRub: 9_500 },

  { replies: 12_000, priceRub: 14_400 },

] as const;



export const AUTO_REPLY_OPTION_LABELS = AUTO_REPLY_PACKAGES.map((p) =>

  p.replies.toLocaleString("ru-RU")

) as readonly string[];



export const AUTO_REPLY_PRICES = AUTO_REPLY_PACKAGES.map((p) => p.priceRub);



export function autoReplyPricePerUnit(replies: number, priceRub: number): string {

  const unit = priceRub / replies;

  return unit.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

}



export function formatAutoReplyVolume(replies: number): string {

  const formatted = replies.toLocaleString("ru-RU");

  if (replies >= 1_000) {

    return `${formatted} ответов`;

  }

  return `${replies} ${replies === 1 ? "ответ" : replies < 5 ? "ответа" : "ответов"}`;

}


