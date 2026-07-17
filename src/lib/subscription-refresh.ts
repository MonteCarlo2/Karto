export const KARTO_SUBSCRIPTION_REFRESH_EVENT = "karto:subscription-refresh";

/** Попросить navbar/profile перечитать /api/subscription. */
export function requestSubscriptionRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KARTO_SUBSCRIPTION_REFRESH_EVENT));
}
