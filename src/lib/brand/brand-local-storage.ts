/** Ключи синхронизированы с `src/app/brand/page.tsx` */

export const LEGACY_BRAND_STORAGE_KEY = "karto-brand-draft";

export function brandStorageKey(userId: string | null): string {
  return userId ? `${LEGACY_BRAND_STORAGE_KEY}:${userId}` : LEGACY_BRAND_STORAGE_KEY;
}

/** После сброса онбординга в БД — убираем черновик из localStorage, чтобы не «оживал» старый бренд */
export function clearBrandLocalStorage(userId: string | null): void {
  if (typeof window === "undefined") return;
  const scoped = brandStorageKey(userId);
  window.localStorage.removeItem(scoped);
  window.localStorage.removeItem(`${scoped}:meta`);
  window.localStorage.removeItem(LEGACY_BRAND_STORAGE_KEY);
  window.localStorage.removeItem(`${LEGACY_BRAND_STORAGE_KEY}:meta`);
}
