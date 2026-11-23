/**
 * Кэши данных, которые живут, пока открыта вкладка браузера (чтобы разделы открывались мгновенно).
 * При смене пользователя их нужно очистить: иначе человек, зашедший под другим аккаунтом, мог бы на секунду увидеть чужие данные.
 */
const caches: Array<Map<unknown, unknown>> = [];

export function registerHubCache<K, V>(cache: Map<K, V>): Map<K, V> {
  caches.push(cache as Map<unknown, unknown>);
  return cache;
}

export function clearHubCaches(): void {
  for (const cache of caches) cache.clear();
}
