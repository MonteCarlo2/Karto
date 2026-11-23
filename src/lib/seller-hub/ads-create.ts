/** Создание тестовой рекламной кампании для одного товара. Деньги не списываются и показы не начинаются: кампания «готова к запуску». */

export type AdPaymentType = "cpm" | "cpc";

export type AdCreateRequest = {
  nmId: number;
  /** Название кампании в WB. */
  name: string;
  /** Оплата за показы (по умолчанию) или за клики. */
  paymentType?: AdPaymentType;
};

export type AdCreateParse = { ok: true; request: AdCreateRequest } | { ok: false; error: string };

const MAX_NAME = 100;

/** Название по умолчанию: понятно в кабинете WB, что кампанию создал KARTO, и для какого товара. */
export function defaultAdCampaignName(title: string, paymentType: AdPaymentType = "cpm"): string {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 50);
  return `${paymentType === "cpc" ? "KARTO клики" : "KARTO тест"}: ${clean || "товар"}`.slice(0, MAX_NAME);
}

export function parseAdCreateRequest(body: unknown): AdCreateParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Нужен JSON" };
  const { nmId, name, confirmNmId, paymentType } = body as Record<string, unknown>;
  if (typeof nmId !== "number" || !Number.isInteger(nmId) || nmId <= 0) {
    return { ok: false, error: "Укажите артикул" };
  }
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > MAX_NAME) {
    return { ok: false, error: `Название кампании — от 1 до ${MAX_NAME} знаков` };
  }
  if (confirmNmId !== nmId) return { ok: false, error: "Артикул не подтверждён" };
  if (paymentType !== undefined && paymentType !== "cpm" && paymentType !== "cpc") return { ok: false, error: "Тип оплаты: за показы или за клики" };
  return { ok: true, request: { nmId, name: name.trim(), ...(paymentType === "cpc" ? { paymentType: "cpc" as const } : {}) } };
}

/** Тело запроса к WB: одна кампания на один товар, ручная ставка, оплата за показы, размещение в поиске. */
export function adCreateWbBody(request: AdCreateRequest): {
  name: string;
  nms: number[];
  bid_type: "manual";
  payment_type: AdPaymentType;
  placement_types: ["search"];
} {
  return {
    name: request.name,
    nms: [request.nmId],
    bid_type: "manual",
    payment_type: request.paymentType ?? "cpm",
    placement_types: ["search"],
  };
}
