/** Ссылка на вход с возвратом на текущий экран студии после регистрации. */
export function buildStudioLoginHref(redirectPath: string): string {
  const path = redirectPath.trim() || "/studio";
  return `/login?redirect=${encodeURIComponent(path)}`;
}
