import type { SellerEventGroup, SellerProductEvent } from "@/lib/seller-hub/event-engine/types";

/**
 * Пометки пользователя на уведомлениях: прочитано / непрочитано, закреплено, в архиве.
 * Хранятся компактной строкой в настройках пользователя (общие для всех устройств). Глобальная отметка «всё прочитано» — момент времени
 * (events.seenAt), а точечные пометки её уточняют: можно вернуть старое уведомление в непрочитанные или отметить новое прочитанным.
 */

export type EventMarks = { read: string[]; unread: string[]; pinned: string[]; archived: string[] };
export type MarkKind = keyof EventMarks;

/** Сколько id хранится в каждом списке: старые вытесняются, чтобы настройка не росла бесконечно. */
export const MAX_MARKED = 300;
const KINDS: MarkKind[] = ["read", "unread", "pinned", "archived"];

export const emptyMarks = (): EventMarks => ({ read: [], unread: [], pinned: [], archived: [] });

export function parseMarks(raw: string): EventMarks {
  if (!raw) return emptyMarks();
  try {
    const value = JSON.parse(raw) as Partial<Record<MarkKind, unknown>>;
    const out = emptyMarks();
    for (const kind of KINDS) {
      const list = value?.[kind];
      if (Array.isArray(list)) out[kind] = list.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 200).slice(-MAX_MARKED);
    }
    return out;
  } catch {
    return emptyMarks();
  }
}

export const serializeMarks = (marks: EventMarks): string => JSON.stringify(marks);

/** Проверка значения настройки на сервере: валидный JSON нужной формы и разумного размера. */
export function isValidMarksString(value: unknown): boolean {
  if (typeof value !== "string" || value.length > 120_000) return false;
  if (value === "") return true;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    return Object.entries(parsed as Record<string, unknown>).every(([k, v]) => (KINDS as string[]).includes(k) && Array.isArray(v) && v.length <= MAX_MARKED && v.every((id) => typeof id === "string" && id.length <= 200));
  } catch {
    return false;
  }
}

const without = (list: string[], id: string) => list.filter((x) => x !== id);
const add = (list: string[], id: string) => [...without(list, id), id].slice(-MAX_MARKED);

/** Прочитано: убирает из «непрочитанных» и добавляет в «прочитанные». Непрочитано — наоборот. */
export function setRead(marks: EventMarks, id: string, read: boolean): EventMarks {
  return read ? { ...marks, read: add(marks.read, id), unread: without(marks.unread, id) } : { ...marks, unread: add(marks.unread, id), read: without(marks.read, id) };
}
export const setPinned = (marks: EventMarks, id: string, on: boolean): EventMarks => ({ ...marks, pinned: on ? add(marks.pinned, id) : without(marks.pinned, id) });
export const setArchived = (marks: EventMarks, id: string, on: boolean): EventMarks => ({ ...marks, archived: on ? add(marks.archived, id) : without(marks.archived, id) });

/** «Всё прочитано»: сдвигаем метку времени, а точечные пометки «непрочитано» сбрасываем. */
export const clearUnread = (marks: EventMarks): EventMarks => ({ ...marks, read: [], unread: [] });

/** Убираем из пометок id событий, которых в ленте уже нет (старые записи вытеснены историей). */
export function pruneMarks(marks: EventMarks, liveIds: Set<string>): EventMarks {
  const keep = (list: string[]) => list.filter((id) => liveIds.has(id));
  return { read: keep(marks.read), unread: keep(marks.unread), pinned: keep(marks.pinned), archived: keep(marks.archived) };
}

export function isEventRead(event: SellerProductEvent, marks: EventMarks, seenMs: number): boolean {
  if (marks.unread.includes(event.id)) return false;
  if (marks.read.includes(event.id)) return true;
  return Date.parse(event.createdAt) <= seenMs;
}

export type StatusView = "all" | "unread" | "attention" | "pinned" | "archive";
export type Direction = "all" | SellerEventGroup;

/** Видимость события в выбранном представлении. В «Все», «Непрочитанные», «Обратить внимание» архивные не попадают. */
export function matchesView(event: SellerProductEvent, view: StatusView, marks: EventMarks, seenMs: number, attention: (e: SellerProductEvent) => boolean): boolean {
  const archived = marks.archived.includes(event.id);
  if (view === "archive") return archived;
  if (archived) return false;
  if (view === "pinned") return marks.pinned.includes(event.id);
  if (view === "unread") return !isEventRead(event, marks, seenMs);
  if (view === "attention") return attention(event);
  return true;
}

/** Направления, скрытые пользователем (строка из настройки через запятую → множество допустимых групп). */
export function parseMuted(raw: string, known: readonly SellerEventGroup[]): Set<SellerEventGroup> {
  return new Set(raw.split(",").filter((g): g is SellerEventGroup => (known as readonly string[]).includes(g)));
}
export const serializeMuted = (muted: Set<SellerEventGroup>): string => [...muted].join(",");
export const isValidMutedString = (value: unknown): boolean => typeof value === "string" && value.length <= 200 && /^[a-z,]*$/.test(value);
