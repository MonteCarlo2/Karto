import { AD_BID_MAX_RUB } from "./ads-bid";

/**
 * Ставка на отдельный поисковый кластер (запрос) внутри кампании: проверка запроса до обращения к WB.
 * WB принимает ставку кластера целыми рублями за 1000 показов и только для кампаний с ручной ставкой и оплатой за показы.
 */

export type ClusterBidRequest = {
  advertId: number;
  nmId: number;
  query: string;
  /** Целые рубли за 1000 показов. */
  bidRub: number;
};

export type ClusterBidParse = { ok: true; request: ClusterBidRequest } | { ok: false; error: string };

const MAX_QUERY = 200;

function base(body: unknown): { advertId: number; nmId: number; query: string; rest: Record<string, unknown> } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Нужен JSON" };
  const rest = body as Record<string, unknown>;
  const { advertId, nmId, query } = rest;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) return { error: "Укажите кампанию" };
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) return { error: "Укажите артикул" };
  if (typeof query !== "string" || !query.trim() || query.trim().length > MAX_QUERY) return { error: "Укажите поисковый запрос (кластер)" };
  return { advertId, nmId, query: query.trim(), rest };
}

/** Установить ставку кластера: ставка целая, в пределах потолка и подтверждена тем же числом. */
export function parseClusterBidSet(body: unknown): ClusterBidParse {
  const b = base(body);
  if ("error" in b) return { ok: false, error: b.error };
  const { bidRub, confirmRub } = b.rest;
  if (typeof bidRub !== "number" || !Number.isInteger(bidRub) || bidRub <= 0) {
    return { ok: false, error: "Ставка кластера — целое число рублей за 1000 показов" };
  }
  if (bidRub > AD_BID_MAX_RUB) return { ok: false, error: `Ставка не может быть больше ${AD_BID_MAX_RUB.toLocaleString("ru-RU")} ₽` };
  if (confirmRub !== bidRub) return { ok: false, error: "Ставка не подтверждена" };
  return { ok: true, request: { advertId: b.advertId, nmId: b.nmId, query: b.query, bidRub } };
}

export type ClusterResetRequest = { advertId: number; nmId: number; query: string };

/** Сбросить ставку кластера (кластер вернётся к ставке кампании): нужно подтверждение запроса. */
export function parseClusterBidReset(body: unknown): { ok: true; request: ClusterResetRequest } | { ok: false; error: string } {
  const b = base(body);
  if ("error" in b) return { ok: false, error: b.error };
  if (b.rest.confirmQuery !== b.query) return { ok: false, error: "Запрос не подтверждён" };
  return { ok: true, request: { advertId: b.advertId, nmId: b.nmId, query: b.query } };
}

export type ClusterBidKey = `${number}:${number}:${string}`;
export const clusterBidKey = (advertId: number | string, nmId: number | string, query: string) =>
  `${Number(advertId)}:${Number(nmId)}:${query.trim().toLowerCase()}` as ClusterBidKey;
