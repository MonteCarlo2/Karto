import { clearBrandLocalStorage } from "@/lib/brand/brand-local-storage";

const AUTO_REPLY_PREFIXES = [
  "karto-auto-replies-secrets-v1:",
  "karto-auto-replies-workspace-prefs-v1:",
  "karto-auto-replies-settings-v1",
  "karto-auto-replies-history-v1",
  "karto-auto-replies-compose-draft:",
  "karto-inbox:v2:",
  "karto-inbox:",
  "karto-regen-count:",
  "karto-auto-replies-nav-v1",
] as const;

/** Удаляет локальные данные приложения для пользователя после удаления аккаунта. */
export function clearUserLocalAppData(userId: string | null | undefined): void {
  if (typeof window === "undefined") return;

  clearBrandLocalStorage(userId ?? null);

  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (userId && key.includes(userId)) {
      keysToRemove.push(key);
      continue;
    }
    if (AUTO_REPLY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));

  window.sessionStorage.removeItem("karto-auto-replies-workspace-prefs-v1");
  window.sessionStorage.removeItem("karto-auto-replies-nav-v1");
  window.sessionStorage.removeItem("karto_session_id");
}
