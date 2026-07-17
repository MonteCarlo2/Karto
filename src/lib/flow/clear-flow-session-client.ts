/** Ключи localStorage, привязанные к активной сессии Потока. */
const FLOW_SESSION_KEYS = [
  "karto_session_id",
  "karto_session_is_demo",
  "understandingPageState",
] as const;

/** Сбросить клиентское состояние сессии Потока (после «Завершить поток» или нового запуска). */
export function clearFlowSessionClient(): void {
  if (typeof window === "undefined") return;
  for (const key of FLOW_SESSION_KEYS) {
    localStorage.removeItem(key);
  }
}
