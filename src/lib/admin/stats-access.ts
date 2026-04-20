/**
 * Доступ к /api/admin/user-stats и /admin/stats.
 * Задайте на сервере ADMIN_STATS_EMAILS (через запятую) или один ADMIN_STATS_EMAIL.
 * Опционально ADMIN_STATS_SECRET — заголовок x-admin-stats-secret для скриптов без сессии.
 */

export function getAdminStatsEmailAllowlist(): string[] {
  const raw =
    process.env.ADMIN_STATS_EMAILS?.trim() ||
    process.env.ADMIN_STATS_EMAIL?.trim() ||
    "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminStatsEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = getAdminStatsEmailAllowlist();
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

/** Секрет из env (без пробелов по краям). Пусто — на сервере не задан. */
export function getAdminStatsSecretExpected(): string | null {
  const s = process.env.ADMIN_STATS_SECRET?.trim();
  return s ? s : null;
}

export function isAdminStatsSecretProvided(secretHeader: string | null): boolean {
  const expected = getAdminStatsSecretExpected();
  if (!expected) return false;
  const received = secretHeader?.trim() ?? "";
  return received.length > 0 && received === expected;
}

export function isAdminStatsConfigured(): boolean {
  return getAdminStatsEmailAllowlist().length > 0 || Boolean(getAdminStatsSecretExpected());
}
