/**
 * Краткий кэш собранного серверного снимка кабинета в памяти процесса.
 * Сборка снимка читает из базы все источники и себестоимость; пока воркер не прочитал ничего нового, результат тот же,
 * поэтому повторные запросы (несколько вкладок, опрос раз в минуту) отдаём без обращений к базе.
 *
 * Ключ версии: время последнего успешного чтения каждого источника. Себестоимость хранится у нас и в версию не входит,
 * поэтому её изменение сбрасывает кэш явно (clearSnapshotCache), а страховка по времени не даёт кэшу жить дольше минуты.
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 50;

type Entry<T> = { version: string; at: number; value: T };

const cache = new Map<string, Entry<unknown>>();

const keyOf = (userId: string, marketplaceId: string) => `${userId}:${marketplaceId}`;

export function readSnapshotCache<T>(userId: string, marketplaceId: string, version: string, now = Date.now()): T | null {
  const entry = cache.get(keyOf(userId, marketplaceId)) as Entry<T> | undefined;
  if (!entry || entry.version !== version || now - entry.at > TTL_MS) return null;
  return entry.value;
}

export function writeSnapshotCache<T>(userId: string, marketplaceId: string, version: string, value: T, now = Date.now()): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(keyOf(userId, marketplaceId), { version, at: now, value });
}

export function clearSnapshotCache(userId: string, marketplaceId = "wildberries"): void {
  cache.delete(keyOf(userId, marketplaceId));
}
