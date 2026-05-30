export type WbBasketRoute = {
  host: string;
  min: number;
  max: number;
};

const CACHE_MS = 60 * 60_000;

let cachedRoutes: WbBasketRoute[] | null = null;
let cachedAt = 0;

/** Диапазоны vol → basket (fallback, если upstreams недоступен). */
const LEGACY_VOL_RANGES = [
  143, 287, 431, 719, 1007, 1061, 1115, 1169, 1313, 1601, 1655, 1919, 2045, 2189, 2405,
  2621, 2837, 3053, 3269, 3485, 3701, 3917, 4133, 4349, 4565, 4877, 5189, 5501, 5813, 6125,
  6437, 6749, 7061, 7373, 7685, 7997, 8309, 8741, 9173, 9605, 10373, 11141, 11909, 12677,
  13445, 14213,
];

function legacyBasketHost(vol: number): string {
  for (let i = 0; i < LEGACY_VOL_RANGES.length; i += 1) {
    if (vol <= LEGACY_VOL_RANGES[i]) {
      return `https://basket-${String(i + 1).padStart(2, "0")}.wbbasket.ru`;
    }
  }
  return "https://basket-47.wbbasket.ru";
}

export async function fetchWbBasketRoutes(): Promise<WbBasketRoute[]> {
  if (cachedRoutes && Date.now() - cachedAt < CACHE_MS) {
    return cachedRoutes;
  }

  try {
    const res = await fetch("https://cdn.wbbasket.ru/api/v3/upstreams", {
      headers: { Accept: "application/json", "User-Agent": "KARTO/1.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`upstreams ${res.status}`);

    const json = (await res.json()) as {
      origin?: {
        mediabasket_route_map?: {
          hosts?: { host?: string; vol_range_from?: number; vol_range_to?: number }[];
        }[];
      };
    };

    const routes: WbBasketRoute[] = [];
    for (const block of json.origin?.mediabasket_route_map ?? []) {
      for (const entry of block.hosts ?? []) {
        const host = entry.host?.trim();
        if (!host) continue;
        routes.push({
          host: host.startsWith("http") ? host : `https://${host}`,
          min: entry.vol_range_from ?? 0,
          max: entry.vol_range_to ?? 0,
        });
      }
    }

    if (routes.length > 0) {
      cachedRoutes = routes;
      cachedAt = Date.now();
      return routes;
    }
  } catch {
    // fallback ниже
  }

  return [];
}

export function resolveWbBasketHost(vol: number, routes: WbBasketRoute[]): string {
  const hit = routes.find((r) => vol >= r.min && vol <= r.max);
  if (hit) return hit.host;
  return legacyBasketHost(vol);
}

export function buildWbProductImageCandidates(nmId: number, routes: WbBasketRoute[]): string[] {
  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);
  const baseHost = resolveWbBasketHost(vol, routes);
  const paths = ["big/1.webp", "big/1.jpg", "c516x688/1.webp", "tm/1.webp"];
  const urls = paths.map((p) => `${baseHost}/vol${vol}/part${part}/${nmId}/images/${p}`);

  const legacyHost = legacyBasketHost(vol);
  if (legacyHost !== baseHost) {
    for (const p of paths) {
      urls.push(`${legacyHost}/vol${vol}/part${part}/${nmId}/images/${p}`);
    }
  }

  const hostNum = baseHost.match(/basket-(\d+)/)?.[1];
  if (hostNum) {
    const alt = `https://basket-${hostNum}.wb.ru`;
    for (const p of paths) {
      urls.push(`${alt}/vol${vol}/part${part}/${nmId}/images/${p}`);
    }
  }

  return [...new Set(urls)];
}

export async function resolveWbProductImageUrl(nmId: number): Promise<string | undefined> {
  const routes = await fetchWbBasketRoutes();
  const candidates = buildWbProductImageCandidates(nmId, routes);

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD", headers: { Accept: "image/*" } });
      if (res.ok) return url;
    } catch {
      continue;
    }
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "GET", headers: { Accept: "image/*" } });
      if (res.ok) return url;
    } catch {
      continue;
    }
  }

  return candidates[0];
}
