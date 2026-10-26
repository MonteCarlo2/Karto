/**
 * Зоны показов кампании (поиск, рекомендации): проверка запроса до обращения к WB.
 * WB меняет зоны только в кампаниях с ручной ставкой и оплатой за показы (CPM).
 */

export type AdPlacementsRequest = { advertId: number; search: boolean; recommendations: boolean };

export function parseAdPlacementsRequest(body: unknown): { ok: true; request: AdPlacementsRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, search, recommendations, confirm } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) return { ok: false, error: "Укажите кампанию" };
  if (typeof search !== "boolean" || typeof recommendations !== "boolean") return { ok: false, error: "Укажите, включены ли поиск и рекомендации" };
  if (!search && !recommendations) {
    return { ok: false, error: "Нельзя отключить обе зоны: показов не будет. Для остановки рекламы используйте паузу." };
  }
  if (confirm !== `${search}:${recommendations}`) return { ok: false, error: "Изменение не подтверждено" };
  return { ok: true, request: { advertId, search, recommendations } };
}

export const placementsLabel = (p: { search: boolean; recommendations: boolean }): string =>
  p.search && p.recommendations ? "поиск и рекомендации" : p.search ? "только поиск" : "только рекомендации";