// Чистая функция без браузерных зависимостей: её используют и интерфейс, и серверный маршрут снимка.

/** Источники, которые не входят в снимок кабинета. */
const NOT_IN_SNAPSHOT = new Set(["news", "history"]);

/** Ключ версии данных: если не изменился, браузер не перерисовывает всё заново. */
export function serverSnapshotVersion(loadedAt: Record<string, string | null>): string {
  return Object.keys(loadedAt)
    // Новости и история пишут в базу события и ряды, а в снимок кабинета ничего не добавляют: его перечитывать из-за них незачем.
    .filter((source) => !NOT_IN_SNAPSHOT.has(source))
    .sort()
    .map((source) => `${source}=${loadedAt[source] ?? ""}`)
    .join("|");
}
