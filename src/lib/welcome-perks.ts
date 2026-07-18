import { AUTO_REPLY_WELCOME_CREDITS } from "@/lib/auto-replies-welcome";
import { FREE_WELCOME_CREDITS } from "@/lib/credits-pricing";
import { DEMO_FLOW_VOLUME } from "@/lib/demo-flow";

/** Краткий список стартовых бонусов нового аккаунта (единый источник для лендинга). */
export function welcomePerksShortRu(): string {
  const credits = FREE_WELCOME_CREDITS.toLocaleString("ru-RU");
  const demo = DEMO_FLOW_VOLUME === 1 ? "1 демо-поток" : `${DEMO_FLOW_VOLUME} демо-потока`;
  const replies =
    AUTO_REPLY_WELCOME_CREDITS === 1
      ? "1 бесплатный автоответ"
      : `${AUTO_REPLY_WELCOME_CREDITS} бесплатных автоответов`;
  return `${credits} кредитов в Креативе, ${demo} и ${replies}`;
}

export function welcomePerksHeroNoteRu(): string {
  return `После регистрации — ${welcomePerksShortRu()}. Без карты.`;
}

export function welcomePerksPricingNoteRu(): string {
  return `Новым аккаунтам — ${welcomePerksShortRu()} сразу после регистрации.`;
}
