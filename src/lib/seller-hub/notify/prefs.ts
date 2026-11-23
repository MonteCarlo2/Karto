/**
 * Настройки уведомлений пользователя и правила доставки. Хранятся в seller_hub_user_settings (ключи notify.*), поэтому одинаковы на всех устройствах.
 * Чистые функции: без базы и сети, их проверяют тесты.
 */

export type EventLevel = "off" | "critical" | "important" | "all";
export type NotifyCategory = "event" | "task" | "agent" | "token";
export type NotifySeverity = "info" | "important" | "critical";

export type NotifyPrefs = {
  telegram: boolean;
  events: EventLevel;
  tasks: boolean;
  agent: boolean;
  token: boolean;
  quiet: boolean;
  quietFrom: number;
  quietTo: number;
};

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { telegram: true, events: "important", tasks: true, agent: true, token: true, quiet: false, quietFrom: 23, quietTo: 8 };

const MSK_OFFSET_H = 3;

/** Собирает настройки из пар «ключ, значение» таблицы настроек; неизвестное и неверное заменяется значением по умолчанию. */
export function parseNotifyPrefs(rows: Array<{ setting_key: string; value: unknown }>): NotifyPrefs {
  const get = new Map(rows.map((r) => [r.setting_key, r.value]));
  const bool = (key: string, fallback: boolean) => (typeof get.get(key) === "boolean" ? (get.get(key) as boolean) : fallback);
  const hour = (key: string, fallback: number) => {
    const v = get.get(key);
    return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback;
  };
  const level = get.get("notify.tg.events");
  const d = DEFAULT_NOTIFY_PREFS;
  return {
    telegram: bool("notify.tg", d.telegram),
    events: level === "off" || level === "critical" || level === "important" || level === "all" ? level : d.events,
    tasks: bool("notify.tg.tasks", d.tasks),
    agent: bool("notify.tg.agent", d.agent),
    token: bool("notify.tg.token", d.token),
    quiet: bool("notify.quiet", d.quiet),
    quietFrom: hour("notify.quietFrom", d.quietFrom),
    quietTo: hour("notify.quietTo", d.quietTo),
  };
}

/** Сейчас тихие часы по Москве? Интервал может переходить через полночь (23 → 8). Одинаковые «с» и «до» значат «без тихих часов». */
export function isQuietNow(prefs: NotifyPrefs, nowMs: number): boolean {
  if (!prefs.quiet || prefs.quietFrom === prefs.quietTo) return false;
  const hour = (new Date(nowMs).getUTCHours() + MSK_OFFSET_H) % 24;
  return prefs.quietFrom < prefs.quietTo ? hour >= prefs.quietFrom && hour < prefs.quietTo : hour >= prefs.quietFrom || hour < prefs.quietTo;
}

/** Подходит ли уведомление под настройки (без учёта тихих часов). */
export function wantsNotification(prefs: NotifyPrefs, item: { category: NotifyCategory; severity: NotifySeverity }): boolean {
  if (!prefs.telegram) return false;
  switch (item.category) {
    case "event":
      if (prefs.events === "off") return false;
      if (prefs.events === "critical") return item.severity === "critical";
      if (prefs.events === "important") return item.severity !== "info";
      return true;
    case "task":
      return prefs.tasks && item.severity === "critical";
    case "agent":
      return prefs.agent;
    case "token":
      return prefs.token;
  }
}

/** В тихие часы задерживаем всё, кроме срочного. */
export function heldByQuiet(prefs: NotifyPrefs, item: { severity: NotifySeverity }, nowMs: number): boolean {
  return isQuietNow(prefs, nowMs) && item.severity !== "critical";
}
