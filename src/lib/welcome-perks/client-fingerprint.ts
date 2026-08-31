"use client";

let cachedDeviceId: string | null = null;
let loadPromise: Promise<string | null> | null = null;

/**
 * Стабильный visitorId браузера для лимита welcome-пакетов.
 * При ошибке возвращает null — сервер трактует как fail-open (бонусы выдаются).
 */
export async function getRegistrationDeviceId(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (cachedDeviceId) return cachedDeviceId;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
      const agent = await FingerprintJS.load();
      const result = await agent.get();
      cachedDeviceId = result.visitorId;
      return cachedDeviceId;
    } catch (error) {
      console.warn("[welcome-perks] fingerprint unavailable:", error);
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function setRegistrationDeviceCookie(): Promise<void> {
  if (typeof document === "undefined") return;
  const deviceId = await getRegistrationDeviceId();
  if (!deviceId) return;
  const maxAge = 600;
  document.cookie = `karto_reg_device=${encodeURIComponent(deviceId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}
