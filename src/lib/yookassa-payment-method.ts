const YOOKASSA_API = "https://api.yookassa.ru/v3/payment_methods";

export type SavedCardDisplay = {
  last4: string;
  brand: string | null;
};

function yookassaAuth(): string | null {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
  if (!shopId || !secretKey) return null;
  return Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

/** Маска карты из объекта payment_method ответа ЮKassa. */
export function parseCardFromPaymentMethod(
  paymentMethod: unknown
): SavedCardDisplay | null {
  if (!paymentMethod || typeof paymentMethod !== "object") return null;
  const pm = paymentMethod as {
    type?: string;
    card?: {
      last4?: string;
      card_type?: string;
      first6?: string;
    };
  };
  if (pm.type && pm.type !== "bank_card") return null;
  const last4 = String(pm.card?.last4 ?? "").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) return null;
  const brand = pm.card?.card_type?.trim() || null;
  return { last4, brand };
}

export function formatCardBrandRu(brand: string | null | undefined): string {
  if (!brand) return "Банковская карта";
  const n = brand.toLowerCase();
  if (n.includes("visa")) return "Visa";
  if (n.includes("master")) return "Mastercard";
  if (n.includes("mir") || n.includes("мир")) return "Мир";
  if (n.includes("maestro")) return "Maestro";
  return brand;
}

/** «Visa ···· 4444» для интерфейса. */
export function formatSavedCardLabel(
  last4?: string | null,
  brand?: string | null
): string | null {
  const digits = String(last4 ?? "")
    .replace(/\D/g, "")
    .slice(-4);
  if (digits.length !== 4) return null;
  return `${formatCardBrandRu(brand)} ···· ${digits}`;
}

/** Подгрузка маски из API ЮKassa (если в БД ещё нет last4). */
export async function fetchYookassaPaymentMethodCard(
  paymentMethodId: string
): Promise<SavedCardDisplay | null> {
  const auth = yookassaAuth();
  if (!auth || !paymentMethodId.trim()) return null;
  try {
    const res = await fetch(`${YOOKASSA_API}/${encodeURIComponent(paymentMethodId)}`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return parseCardFromPaymentMethod(data);
  } catch {
    return null;
  }
}
