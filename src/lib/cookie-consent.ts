export const COOKIE_CONSENT_STORAGE_KEY = "karto_cookie_consent_v1";
export const COOKIE_CONSENT_EVENT = "karto-cookie-consent-updated";
const COOKIE_CONSENT_COOKIE_NAME = "karto_cookie_consent";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export type CookieConsent = {
  necessary: true;
  analytics: boolean;
  updatedAt: string;
};

export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|; )${COOKIE_CONSENT_COOKIE_NAME}=([^;]*)`)
    );
    if (cookieMatch) {
      const raw = decodeURIComponent(cookieMatch[1]);
      const parsed = JSON.parse(raw) as Partial<CookieConsent>;
      if (
        parsed.necessary === true &&
        typeof parsed.analytics === "boolean" &&
        typeof parsed.updatedAt === "string"
      ) {
        return {
          necessary: true,
          analytics: parsed.analytics,
          updatedAt: parsed.updatedAt,
        };
      }
    }

    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (parsed.necessary !== true) return null;
    if (typeof parsed.analytics !== "boolean") return null;
    if (typeof parsed.updatedAt !== "string") return null;
    return {
      necessary: true,
      analytics: parsed.analytics,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(analytics: boolean): CookieConsent | null {
  if (typeof window === "undefined") return null;
  const payload: CookieConsent = {
    necessary: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
  try {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(
      JSON.stringify(payload)
    )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_EVENT, { detail: payload }));
    return payload;
  } catch {
    return null;
  }
}

