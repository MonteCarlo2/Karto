/** Скользящее окно и лимит eligible welcome-пакетов на один device_hash. */
export const WELCOME_PERKS_DEVICE_LIMIT = 2;
export const WELCOME_PERKS_WINDOW_DAYS = 30;
export const WELCOME_PERKS_WINDOW_MS =
  WELCOME_PERKS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Cookie для OAuth (Yandex): fingerprint до редиректа на провайдера. */
export const WELCOME_REGISTRATION_DEVICE_COOKIE = "karto_reg_device";
export const WELCOME_REGISTRATION_DEVICE_COOKIE_MAX_AGE_SEC = 600;
