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

export type EnsureFlowCardDisplayOptions = {
  /** Одна попытка (для фона). Таймаут всё равно достаточный для 2K PNG ~4MB. */
  fast?: boolean;
};

/**
 * Скачиваем PNG с CDN WaveSpeed на диск и отдаём /api/serve-file —
 * так карточки стабильно показываются (как в обычном Потоке).
 */
export async function ensureFlowCardDisplayUrl(
  remoteUrl: string,
  opts?: EnsureFlowCardDisplayOptions
): Promise<string> {
  const trimmed = remoteUrl.trim();
  if (!trimmed || isLocalDisplayUrl(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  const fast = opts?.fast === true;
  // 2K PNG с CloudFront часто 3–5MB и >12s — короткий таймаут = вечный abort
  const attempts = fast ? 1 : 2;
  const timeoutMs = fast ? 90_000 : 120_000;

  for (let i = 0; i < attempts; i++) {
    try {
      const filepath = await downloadImageRobust(trimmed, timeoutMs);
      return getPublicUrl(filepath);
    } catch (e) {
      console.warn(
        `[flow-card] download ${i + 1}/${attempts} failed:`,
        e instanceof Error ? e.message : e
      );
      if (i < attempts - 1) await sleep(600 * (i + 1));
    }
  }

  console.warn("[flow-card] fallback to CDN URL (proxy-display in UI)");
  return trimmed;
}

/** Кеш в фоне — не блокирует ответ API. */
export function cacheFlowCardDisplayUrlInBackground(remoteUrl: string): void {
  const trimmed = remoteUrl.trim();
  if (!trimmed || isLocalDisplayUrl(trimmed) || !/^https?:\/\//i.test(trimmed)) {
    return;
  }
  void ensureFlowCardDisplayUrl(trimmed, { fast: true }).catch(() => {
    /* ignore */
  });
}
