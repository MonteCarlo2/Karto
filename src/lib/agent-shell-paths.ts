/**
 * Страницы внутри «Агента» (рабочего кабинета): у них своя левая панель,
 * поэтому глобальные шапка и подвал сайта на них не показываем.
 * Логотип в панели ведёт на сайт.
 */
export function isAgentShellPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/studio/seller-hub") ||
    pathname.startsWith("/studio/workshop") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/")
  );
}
