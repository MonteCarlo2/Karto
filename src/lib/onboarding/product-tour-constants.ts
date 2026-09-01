/** Показать product tour один раз после регистрации. */
export const PRODUCT_TOUR_PENDING_STORAGE_KEY = "karto_product_tour_pending";
export const PRODUCT_TOUR_PENDING_COOKIE = "karto_product_tour_pending";
export const PRODUCT_TOUR_PENDING_COOKIE_MAX_AGE_SEC = 600;

export const PRODUCT_TOUR_COMPLETED_STORAGE_KEY = "karto_product_tour_completed";
export const PRODUCT_TOUR_COMPLETED_USER_META_KEY = "karto_product_tour_completed";

/** Тур идёт (между страницами). */
export const PRODUCT_TOUR_RUNNING_STORAGE_KEY = "karto_product_tour_running";
/** Текущий шаг 0…n при resume. */
export const PRODUCT_TOUR_STEP_STORAGE_KEY = "karto_product_tour_step";

/** Navbar открывает «Мастерская» на шаге тура. */
export const KARTO_TOUR_OPEN_STUDIO_EVENT = "karto-tour-open-studio";
export const KARTO_TOUR_CLOSE_STUDIO_EVENT = "karto-tour-close-studio";
