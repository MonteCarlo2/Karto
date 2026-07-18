import { AUTO_REPLY_WELCOME_CREDITS } from "@/lib/auto-replies-welcome";
import { FREE_WELCOME_CREDITS } from "@/lib/credits-pricing";

/** Краткий список стартовых бонусов нового аккаунта (единый источник для лендинга). */
export function welcomePerksShortRu(): string {
  const credits = FREE_WELCOME_CREDITS.toLocaleString("ru-RU");
  return `${credits} кредитов в Креативе, 1 демо-поток и ${AUTO_REPLY_WELCOME_CREDITS} бесплатных автоответов`;
}

export function welcomePerksHeroNoteRu(): string {
  return `После регистрации — ${welcomePerksShortRu()}. Без карты.`;
}

export function welcomePerksPricingNoteRu(): string {
  return `Новым аккаунтам — ${welcomePerksShortRu()} сразу после регистрации.`;
}
