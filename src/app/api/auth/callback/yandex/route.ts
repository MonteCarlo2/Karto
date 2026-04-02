/**
 * Алиас callback: если в приложении Яндекс OAuth указан URL вида /api/auth/callback/yandex
 * (порядок сегментов отличается от /api/auth/yandex/callback), этот маршрут обрабатывает редирект так же.
 */
export { GET } from "../../yandex/callback/route";
