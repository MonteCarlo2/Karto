/** In-memory прогресс батча визуала — для опроса клиентом без Supabase. */

export type VisualBatchQuota = {
  generationUsed: number;
  generationRemaining: number;
  generationLimit: number;
};

export type VisualBatchProgress = {
  slots: (string | null)[];
  inProgress: boolean;
  updatedAt: number;
  quota?: VisualBatchQuota;
};

const TTL_MS = 30 * 60 * 1000;
const bySession = new Map<string, VisualBatchProgress>();

function padSlots(slots: (string | null)[]): (string | null)[] {
  const padded = [...slots];
  while (padded.length < 4) padded.push(null);
  return padded.slice(0, 4);
}

function pruneStale(): void {
  const now = Date.now();
  for (const [id, p] of bySession) {
    if (now - p.updatedAt > TTL_MS) bySession.delete(id);
  }
}

export function setVisualBatchProgress(
  sessionId: string,
  slots: (string | null)[],
  inProgress: boolean,
  quota?: VisualBatchQuota
): void {
  pruneStale();
  const prev = bySession.get(sessionId);
  bySession.set(sessionId, {
    slots: padSlots(slots),
    inProgress,
    updatedAt: Date.now(),
    quota: quota ?? prev?.quota,
  });
}

export function getVisualBatchProgress(sessionId: string): VisualBatchProgress | null {
  pruneStale();
  return bySession.get(sessionId) ?? null;
}

export function clearVisualBatchProgress(sessionId: string): void {
  bySession.delete(sessionId);
}
