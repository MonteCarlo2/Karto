import { panel } from "./settings-ui";

/**
 * Палитра режима «Ответы» — вариант A: тёплый KARTO.
 * Только цвета бренда: беж, лесной зелёный, салат (точечно), чёрный.
 * Синий в этом варианте не используется.
 */
export const inboxTheme = {
  /** Общий фон ленты и детали — один тон с правой зоной страницы */
  canvas: panel.canvas,
  /** Чуть светлее canvas — поля ввода, подвал, кнопки */
  elevated: panel.inputBg,
  /** Салатовый акцент — читается на беже, не сливается с greenSoft */
  feedActiveBg: "rgba(185, 255, 75, 0.34)",
  feedActiveBar: panel.green,
  aiBlockBg: panel.saladSoft,
  aiBlockBorder: "rgba(46, 90, 67, 0.14)",
  aiBlockRing: "rgba(185, 255, 75, 0.28)",
  action: panel.green,
  actionHover: panel.greenDark,
  actionMuted: panel.greenDark,
  border: panel.borderLight,
  /** Вертикаль между лентой и деталью */
  rail: "rgba(201, 193, 182, 0.95)",
  /** Горизонталь между карточками в ленте */
  listDivider: "rgba(201, 193, 182, 0.72)",
} as const;

export const INBOX_THEME_LABEL = "A — тёплый KARTO (беж + зелёный)";
