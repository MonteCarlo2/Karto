/** Состав товаров рекламной кампании: убрать один товар. Показы остальных товаров кампании не меняются. */

export type AdRemoveNmRequest = {
  advertId: number;
  nmId: number;
};

export type AdRemoveNmParse = { ok: true; request: AdRemoveNmRequest } | { ok: false; error: string };

export function parseAdRemoveNmRequest(body: unknown): AdRemoveNmParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, nmId, confirmNmId } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) {
    return { ok: false, error: "Укажите кампанию" };
  }
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) {
    return { ok: false, error: "Укажите артикул" };
  }
  if (confirmNmId !== nmId) return { ok: false, error: "Артикул не подтверждён" };
  return { ok: true, request: { advertId, nmId } };
}

/** Тело запроса к WB (PATCH /adv/v0/auction/nms): только удаление одного артикула. */
export function adRemoveNmWbBody(request: AdRemoveNmRequest): {
  nms: Array<{ advert_id: number; nms: { delete: number[] } }>;
} {
  return { nms: [{ advert_id: request.advertId, nms: { delete: [request.nmId] } }] };
}

export type AdAddNmRequest = {
  advertId: number;
  nmId: number;
};

/** Максимум товаров в одной кампании по правилам WB. */
export const AD_MAX_NMS_PER_CAMPAIGN = 50;

/** Добавить один товар в кампанию: нужен подтверждённый артикул. */
export function parseAdAddNmRequest(body: unknown): { ok: true; request: AdAddNmRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { advertId, nmId, confirmNmId } = body as Record<string, unknown>;
  if (typeof advertId !== "number" || !Number.isInteger(advertId) || advertId <= 0) return { ok: false, error: "Укажите кампанию" };
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) return { ok: false, error: "Укажите артикул" };
  if (confirmNmId !== nmId) return { ok: false, error: "Артикул не подтверждён" };
  return { ok: true, request: { advertId, nmId } };
}

/** Тело запроса к WB (PATCH /adv/v0/auction/nms): только добавление одного артикула. */
export function adAddNmWbBody(request: AdAddNmRequest): { nms: Array<{ advert_id: number; nms: { add: number[] } }> } {
  return { nms: [{ advert_id: request.advertId, nms: { add: [request.nmId] } }] };
}