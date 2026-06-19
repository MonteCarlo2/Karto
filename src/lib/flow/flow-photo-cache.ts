/** Фото товара в Потоке: base64 не кладём в Supabase, храним локально по session_id. */

const PHOTO_PREFIX = "karto_flow_photo:";

export function saveFlowSessionPhoto(sessionId: string, dataUrl: string | null | undefined): void {
  if (typeof window === "undefined" || !sessionId) return;
  const url = dataUrl?.trim();
  if (!url?.startsWith("data:")) return;
  try {
    localStorage.setItem(PHOTO_PREFIX + sessionId, url);
  } catch {
    /* quota */
  }
}

export function loadFlowSessionPhoto(sessionId: string | null | undefined): string | null {
  if (typeof window === "undefined" || !sessionId) return null;
  try {
    return localStorage.getItem(PHOTO_PREFIX + sessionId);
  } catch {
    return null;
  }
}

export function readUnderstandingPageState(): {
  productName?: string;
  photoDataUrl?: string;
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("understandingPageState");
    if (!raw) return {};
    return JSON.parse(raw) as { productName?: string; photoDataUrl?: string };
  } catch {
    return {};
  }
}

/** Фото: сначала кэш сессии (актуальное с «Понимания»), потом БД, потом legacy state. */
export function resolveFlowPhoto(
  sessionId: string | null | undefined,
  dbPhotoUrl: string | null | undefined
): string | null {
  const fromSession = loadFlowSessionPhoto(sessionId);
  if (fromSession) return fromSession;

  const fromDb = dbPhotoUrl?.trim();
  if (fromDb?.startsWith("data:")) return fromDb;
  if (fromDb) return fromDb;

  const state = readUnderstandingPageState();
  return state.photoDataUrl?.trim() || null;
}

export function resolveFlowProductName(
  dbName: string | null | undefined,
  fallbackFromState = true
): string {
  const fromDb = dbName?.trim();
  if (fromDb) return fromDb;
  if (!fallbackFromState) return "";
  return readUnderstandingPageState().productName?.trim() || "";
}
