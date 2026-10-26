import type { SellerFunnelSnapshot } from "@/lib/seller-hub/types";

export type StoreBuyout = {
  /** Выкупы ÷ (выкупы + отмены), % с одним знаком. */
  percent: number;
  buyouts: number;
  cancels: number;
  /** Завершённые заказы = выкупленные + отменённые. Заказы в пути в расчёт не входят. */
  completed: number;
  dateFrom: string;
  dateTo: string;
};

/**
 * Процент выкупа по завершённым заказам за окно воронки WB: деньги приходят только после завершения заказа,
 * поэтому заказы «в пути» не считаются ни выкупленными, ни невыкупленными.
 * null — воронка не прочитана целиком или завершённых заказов нет (не ноль и не выдуманное число).
 */
export function storeBuyoutFromFunnel(funnel: SellerFunnelSnapshot | null | undefined): StoreBuyout | null {
  if (!funnel || funnel.status === "error" || funnel.status === "forbidden" || funnel.status === "not_loaded") {
    return null;
  }
  if (funnel.truncated) return null;
  let buyouts = 0;
  let cancels = 0;
  for (const row of Object.values(funnel.byNm ?? {})) {
    const selected = row.selected;
    if (selected.buyoutCount == null || selected.cancelCount == null) return null;
    buyouts += selected.buyoutCount;
    cancels += selected.cancelCount;
  }
  const completed = buyouts + cancels;
  if (!(completed > 0)) return null;
  return {
    percent: Math.round((buyouts / completed) * 1000) / 10,
    buyouts,
    cancels,
    completed,
    dateFrom: funnel.dateFrom,
    dateTo: funnel.dateTo,
  };
}
