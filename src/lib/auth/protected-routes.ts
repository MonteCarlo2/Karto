/** Страницы, доступные без входа (лендинг, юридическое, вход). */
const PUBLIC_PAGE_EXACT = new Set([
  "/",
  "/login",
  "/reset-password",
  "/pricing",
  "/privacy",
  "/terms",
  "/policy-and-terms",
  "/payments-policy",
  "/consent-personal-data",
  "/data-processing",
  "/ai-policy",
  "/app",
  "/health",
]);

const PUBLIC_PAGE_PREFIXES = ["/auth/", "/_next/", "/favicon", "/robots.txt", "/sitemap.xml"];

/**
 * Страницы студии доступны для просмотра без входа; регистрация — на кнопках действий в UI.
 * Здесь остаются только личные разделы (профиль, бренд, админка).
 */
export function requiresAuthPage(pathname: string): boolean {
  if (PUBLIC_PAGE_EXACT.has(pathname)) return false;
  if (PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  if (pathname === "/studio" || pathname.startsWith("/studio/")) return false;

  if (
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/brand" ||
    pathname.startsWith("/brand/") ||
    pathname === "/notifications" ||
    pathname.startsWith("/notifications/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    return true;
  }

  return false;
}

/** API без обязательной авторизации (вебхуки, health, регистрация, статика). */
const PUBLIC_API_PREFIXES = [
  "/api/auth/",
  "/api/health",
  "/api/payment/webhook",
  "/api/cron/",
  "/api/telegram/webhook",
  "/api/sitemap-xml",
  "/api/serve-file",
  "/api/media/proxy-display",
  "/api/contact-question",
  "/api/community-survey",
  "/api/network-check",
  "/api/bug-reports/submit",
];

export function requiresAuthApi(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  return !PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
}
