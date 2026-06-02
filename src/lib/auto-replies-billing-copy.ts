import { AUTO_REPLY_PACKAGES, formatAutoReplyVolume } from "@/lib/auto-replies-pricing";
import { formatSavedCardLabel } from "@/lib/yookassa-payment-method";

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatBillingDateLong(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return DATE_FMT.format(new Date(ms));
}

export function formatAutoReplyPackLine(tariffIndex: number): string {
  const idx = Math.min(AUTO_REPLY_PACKAGES.length - 1, Math.max(0, tariffIndex));
  const pack = AUTO_REPLY_PACKAGES[idx];
  return `${formatAutoReplyVolume(pack.replies)} · ${pack.priceRub.toLocaleString("ru-RU")} ₽ / 30 дней`;
}

export function savedCardLabelFromFields(
  last4?: string | null,
  brand?: string | null
): string | null {
  return formatSavedCardLabel(last4, brand);
}
