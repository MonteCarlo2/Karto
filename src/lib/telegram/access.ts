import { isSellerHubAllowed } from "@/lib/seller-hub/access";

/**
 * Помощник в Telegram (вопросы, быстрые команды, действия, голос, уведомления магазина) входит в Seller Hub и открыт только тем аккаунтам, которым открыт Seller Hub.
 * Остальным пользователям бот по-прежнему присылает карточки отзывов на подтверждение: это отдельная старая функция.
 */
export const assistantAllowed = (userId: string) => isSellerHubAllowed(userId);

export const ASSISTANT_CLOSED_HTML = "🤖 <b>Помощник скоро появится</b>\n\nПока этот бот присылает карточки отзывов на подтверждение: можно подтвердить, изменить или перегенерировать ответ.";
