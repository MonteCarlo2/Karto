import {
  downloadImageRobust,
  getPublicUrl,
} from "@/lib/services/image-processing";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Уже локальный URL — не трогаем. */
function isLocalDisplayUrl(url: string): boolean {
  const t = url.trim();
  return (
    t.startsWith("/api/serve-file") ||
    t.startsWith("/temp/") ||
    t.startsWith("/output/") ||
    (t.startsWith("/") && !t.startsWith("//"))
  );
}

/**
 * Скачиваем PNG с CDN WaveSpeed на диск и отдаём /api/serve-file —
 * так карточки стабильно показываются в UI (без зависшего proxy-display).
 */
export async function ensureFlowCardDisplayUrl(remoteUrl: string): Promise<string> {
  const trimmed = remoteUrl.trim();
  if (!trimmed || isLocalDisplayUrl(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const filepath = await downloadImageRobust(trimmed, 90_000);
      return getPublicUrl(filepath);
    } catch (e) {
      console.warn(
        `[flow-card] download ${i + 1}/${attempts} failed:`,
        e instanceof Error ? e.message : e
      );
      if (i < attempts - 1) await sleep(800 * (i + 1));
    }
  }

  console.warn("[flow-card] fallback to CDN URL (proxy may be slow)");
  return trimmed;
}
