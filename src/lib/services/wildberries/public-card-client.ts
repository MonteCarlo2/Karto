/**
 * Публичная карточка товара WB (покупательская выдача).
 *
 * Зачем это нужно: в Seller API нет способа узнать, участвует ли конкретный товар в
 * автоакции. `calendar/promotions/nomenclatures` для автоакций отвечает 422, а
 * счётчики в `calendar/promotions/details` — агрегат по всей акции и обновляются
 * слишком медленно, чтобы по ним что-то проверять.
 *
 * Публичная карточка отдаёт по каждому nmID поле `promotions` — список ID акций, в
 * которых товар участвует прямо сейчас. ID там из того же диапазона, что и ID акций
 * календаря, поэтому это единственный доступный признак участия по одному товару.
 */

const CARD_HOSTS = ["https://card.wb.ru", "https://u-card.wb.ru"] as const;
const CARD_QUERY = "appType=1&curr=rub&dest=-1257786&lang=ru";
const CARD_TIMEOUT_MS = 8_000;
const MAX_NM_PER_REQUEST = 100;

type PublicCardProduct = {
  id?: number;
  promotions?: number[];
  sizes?: Array<{ price?: { basic?: number; product?: number } }>;
};

export type PublicCardInfo = {
  nmId: number;
  /** ID акций, в которых товар участвует сейчас. */
  promotionIds: Set<number>;
  /** Цена до скидки WB, ₽ (в ответе — в копейках). */
  basicPrice?: number;
  /** Цена, которую видит покупатель, ₽. */
  productPrice?: number;
};

function toRubles(value: unknown): number | undefined {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return num / 100;
}

async function fetchCardChunk(nmIds: number[]): Promise<PublicCardProduct[] | null> {
  const nmParam = nmIds.join(";");
  // bust CDN: иначе после смены цены карточка минутами отдаёт старый promotions[].
  const bust = `_=${Date.now()}`;

  for (const host of CARD_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CARD_TIMEOUT_MS);
    try {
      const res = await fetch(
        `${host}/cards/v4/detail?${CARD_QUERY}&nm=${nmParam}&${bust}`,
        {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            accept: "application/json",
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
        }
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { products?: PublicCardProduct[] };
      if (Array.isArray(body?.products)) return body.products;
    } catch {
      // Пробуем следующий хост: один из них периодически отдаёт 404.
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}

/** Данные публичной карточки по каждому nmID. Товары без ответа в карту не попадают. */
export async function fetchPublicCardInfo(
  nmIds: number[]
): Promise<Map<number, PublicCardInfo>> {
  const unique = [...new Set(nmIds.filter((id) => Number.isFinite(id) && id > 0))];
  const byNmId = new Map<number, PublicCardInfo>();

  for (let i = 0; i < unique.length; i += MAX_NM_PER_REQUEST) {
    const chunk = unique.slice(i, i + MAX_NM_PER_REQUEST);
    const products = await fetchCardChunk(chunk);
    if (!products) continue;

    for (const product of products) {
      const nmId = Number(product.id);
      if (!Number.isFinite(nmId)) continue;
      const price = product.sizes?.[0]?.price;
      byNmId.set(nmId, {
        nmId,
        promotionIds: new Set(
          (Array.isArray(product.promotions) ? product.promotions : [])
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id))
        ),
        basicPrice: toRubles(price?.basic),
        productPrice: toRubles(price?.product),
      });
    }
  }

  return byNmId;
}

/**
 * Участвует ли товар в акции прямо сейчас.
 * `null` — публичная карточка недоступна, то есть ответа «нет» мы не получили.
 */
export async function isProductInPromotion(
  nmId: number,
  promotionId: number
): Promise<boolean | null> {
  const info = (await fetchPublicCardInfo([nmId])).get(nmId);
  if (!info) return null;
  return info.promotionIds.has(promotionId);
}
