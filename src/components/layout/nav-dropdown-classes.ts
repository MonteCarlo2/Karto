/**
 * Стили только для содержимого выпадающих меню (не триггеров):
 * «Мастерская», профиль в шапке и в студии.
 */
export const NAV_DROPDOWN_PANEL =
  "overflow-hidden rounded-2xl border border-[#070907]/10 bg-[#fffefb]/[0.97] p-1.5 shadow-[0_24px_64px_-34px_rgba(7,9,7,0.42)] ring-1 ring-black/[0.035] backdrop-blur-md";

export const NAV_MENU_ROW_STUDIO =
  "group flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-[#2E5A43]/[0.07] focus-visible:bg-[#2E5A43]/[0.07] focus-visible:ring-2 focus-visible:ring-[#2E5A43]/22 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffefb]";

export const NAV_MENU_ICON_WRAP =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f6fce9] via-[#ecf7db] to-[#dff3c4] text-[#16452f] shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] ring-1 ring-[#2E5A43]/13";

/** Иконка «Выйти»: постоянное красное обрамление (без hover). */
export const NAV_MENU_ICON_WRAP_LOGOUT =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fffafa] text-[#b91c1c] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] ring-2 ring-red-500/60 ring-offset-0 border border-red-600/40";

export const NAV_MENU_DIVIDER = "mx-2 my-0.5 h-px bg-gradient-to-r from-transparent via-[#070907]/10 to-transparent";

export const NAV_MENU_TITLE =
  "text-[15px] font-semibold leading-[1.18] tracking-[-0.02em] text-[#0f1412] group-hover:text-[#0d281c]";
export const NAV_MENU_SUBTITLE = "mt-0.5 text-[11px] leading-snug text-neutral-500";

export const NAV_MENU_ROW_PROFILE =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-[#2E5A43]/[0.07] focus-visible:bg-[#2E5A43]/[0.07] focus-visible:ring-2 focus-visible:ring-[#2E5A43]/22 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffefb]";

export const NAV_MENU_ROW_LOGOUT =
  "group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-[#fef2f2]/90 focus-visible:bg-[#fef2f2]/90 focus-visible:ring-2 focus-visible:ring-red-200/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffefb]";

export const NAV_PROFILE_LABEL =
  "text-[15px] font-semibold leading-tight tracking-[-0.02em] text-[#0f1412]";

export const NAV_LOGOUT_LABEL =
  "text-[15px] font-semibold leading-tight tracking-[-0.02em] text-neutral-700 transition-colors group-hover:text-[#991b1b]";
