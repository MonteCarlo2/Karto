/**
 * Русское склонение для штук / переходов / корзин / заказов.
 * Эталон: 1, 2, 5, 11, 21, 22, 25, 111.
 */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatOpens(n: number): string {
  return `${n.toLocaleString("ru-RU")} ${ruPlural(n, "переход", "перехода", "переходов")}`;
}

export function formatCarts(n: number): string {
  return `${n.toLocaleString("ru-RU")} ${ruPlural(n, "корзина", "корзины", "корзин")}`;
}

/** «добавление в корзину» в диагнозе корзина→заказ. */
export function formatCartAdds(n: number): string {
  return `${n.toLocaleString("ru-RU")} ${ruPlural(n, "добавление", "добавления", "добавлений")}`;
}

export function formatOrders(n: number): string {
  return `${n.toLocaleString("ru-RU")} ${ruPlural(n, "заказ", "заказа", "заказов")}`;
}
