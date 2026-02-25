/**
 * Подтверждение (capture) платежа ЮKassa в статусе waiting_for_capture.
 * После успешного capture платёж переходит в succeeded.
 * POST https://api.yookassa.ru/v3/payments/{payment_id}/capture
 */
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

export type CaptureResult =
  | { ok: true; status: "succeeded"; payment: { id: string; status: string; metadata?: Record<string, unknown> } }
  | { ok: false; status?: string; error: string };

export async function capturePayment(
  paymentId: string,
  amountValue: string,
  currency: string = "RUB",
  idempotenceKey?: string
): Promise<CaptureResult> {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    return { ok: false, error: "YOOKASSA not configured" };
  }

  const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Basic ${auth}`,
  };
  if (idempotenceKey) headers["Idempotence-Key"] = idempotenceKey;

  const res = await fetch(`${YOOKASSA_API}/${paymentId}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: { value: amountValue, currency },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    id?: string;
    metadata?: Record<string, unknown>;
    description?: string;
    code?: string;
  };

  if (!res.ok) {
    const msg = data?.description ?? data?.code ?? `HTTP ${res.status}`;
    return { ok: false, status: data?.status, error: String(msg) };
  }

  if (data?.status === "succeeded") {
    return { ok: true, status: "succeeded", payment: { id: data.id ?? paymentId, status: data.status, metadata: data.metadata } };
  }

  return { ok: false, status: data?.status, error: `Unexpected status: ${data?.status}` };
}
