import type { SellerCatalogSnapshot } from "@/lib/seller-hub/types";

/**
 * Можно ли публиковать новый базовый снимок вместо прежнего.
 * Неполный снимок опаснее старого: пропавшие товары движок воспримет как удалённые и создаст ложные задачи и события.
 * Поэтому подозрительный результат не публикуется, прежний остаётся, а причина записывается в журнал.
 */

/** Новых товаров меньше этой доли от прежнего числа считается сбоем чтения, а не удалением. */
const MIN_SHARE_OF_PREVIOUS = 0.5;
/** Для маленьких каталогов правило доли не применяется: удалить 3 из 5 товаров вполне реально. */
const MIN_PREVIOUS_FOR_SHARE_RULE = 10;
/** Столько неудач подряд из-за пропавшей категории токена, и мы признаём, что доступ отозван намеренно. */
const ACCEPT_SCOPE_LOSS_AFTER_FAILURES = 3;

export type BaseAssessment = { publish: true } | { publish: false; reason: string };

const SCOPE_LABEL: Record<string, string> = {
  content: "Контент",
  prices: "Цены и скидки",
  stocks: "Остатки",
  analytics: "Аналитика",
  promotion: "Продвижение",
  marketplace: "Маркетплейс",
  supplies: "Поставки",
  advert: "Реклама",
};

export function assessBaseSnapshot(
  previous: SellerCatalogSnapshot | null,
  next: SellerCatalogSnapshot,
  failuresInARow: number,
): BaseAssessment {
  if (next.items.length === 0) return { publish: false, reason: "Каталог пришёл пустым" };
  if (next.scopes?.content === false) return { publish: false, reason: "Категория «Контент» не отработала" };
  if (next.truncated === true) return { publish: false, reason: "Каталог прочитан не целиком (упёрлись в предел страниц)" };
  if (!previous) return { publish: true };

  if (previous.items.length >= MIN_PREVIOUS_FOR_SHARE_RULE && next.items.length < previous.items.length * MIN_SHARE_OF_PREVIOUS) {
    return { publish: false, reason: `Товаров стало ${next.items.length} вместо ${previous.items.length}: похоже на сбой чтения` };
  }

  if (failuresInARow < ACCEPT_SCOPE_LOSS_AFTER_FAILURES) {
    const lost = Object.entries(previous.scopes ?? {})
      .filter(([key, was]) => was === true && (next.scopes as Record<string, boolean | undefined> | undefined)?.[key] === false)
      .map(([key]) => SCOPE_LABEL[key] ?? key);
    if (lost.length > 0) return { publish: false, reason: `Не прочитались данные, которые были раньше: ${lost.join(", ")}` };
  }
  return { publish: true };
}
