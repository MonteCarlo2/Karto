/** Кратковременное хранение фото товара по session_id (base64 не кладём в Supabase). */

const TTL_MS = 2 * 60 * 60 * 1000;
const photos = new Map<string, { dataUrl: string; storedAt: number }>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, entry] of photos) {
    if (now - entry.storedAt > TTL_MS) photos.delete(id);
  }
}

export function setFlowSessionPhoto(sessionId: string, dataUrl: string): void {
  const trimmed = dataUrl?.trim();
  if (!sessionId || !trimmed?.startsWith("data:")) return;
  pruneExpired();
  photos.set(sessionId, { dataUrl: trimmed, storedAt: Date.now() });
}

export function getFlowSessionPhoto(sessionId: string): string | null {
  if (!sessionId) return null;
  const entry = photos.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > TTL_MS) {
    photos.delete(sessionId);
    return null;
  }
  return entry.dataUrl;
}

export function clearFlowSessionPhoto(sessionId: string): void {
  photos.delete(sessionId);
}
