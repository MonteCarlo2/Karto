/**
 * Один и тот же redirect_uri в /api/auth/yandex и в /api/auth/yandex/callback (обмен code→token).
 * При необходимости задайте YANDEX_REDIRECT_URI (полный URL), если в кабинете Яндекс OAuth указан другой callback.
 */
export function getYandexRedirectUri(baseUrl: string): string {
  const explicit = (
    process.env.YANDEX_REDIRECT_URI ||
    process.env.NEXT_PUBLIC_YANDEX_REDIRECT_URI ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;
  return `${baseUrl.replace(/\/$/, "")}/api/auth/yandex/callback`;
}
