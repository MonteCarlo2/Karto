import { EVENT_RULES } from "./config";
import {
  EVENT_GROUP,
  type ProductBaseline,
  type SellerEventKind,
  type SellerEventSeverity,
  type SellerEventsState,
  type SellerProductEvent,
  type StoreBaseline,
} from "./types";
import { baselineOfSignals, diffStoreSignals, promoReminders, type StoreSignals } from "./store-events";

export type ProductReading = {
  nmId: string;
  itemId: string;
  title: string;
  vendorCode: string;
  price: number | null;
  discount: number | null;
  promoPrice: number | null;
  stock: number | null;
  salesQty: number | null;
  priorSalesQty: number | null;
  contentScore: number | null;
  photoCount: number | null;
  coverDays: number | null;
  descriptionHash?: string | null;
  descriptionLength?: number | null;
  characteristicsCount?: number | null;
  hasVideo?: boolean | null;
};

export type StoreReading = {
  syncAt: string;
  unansweredFeedbacks: number | null;
  unansweredQuestions: number | null;
  /** Факты по кабинету целиком (реклама, акции, заказы FBS, поставки, финансы, штрафы, негативные отзывы, доступы). */
  signals?: StoreSignals | null;
};

/** Короткий отпечаток текста: нужен для идентификатора события и сравнения, сам текст не хранится. */
export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function emptyStore(): StoreBaseline {
  return {
    captured: false,
    lastSyncAt: null,
    unansweredFeedbacks: null,
    unansweredQuestions: null,
    signals: null,
  };
}

export function emptyEventsState(): SellerEventsState {
  return { version: 1, products: {}, store: emptyStore(), events: [] };
}

function rub(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function pieces(value: number): string {
  return `${Math.round(value).toLocaleString("ru-RU")} шт.`;
}

function eventId(kind: SellerEventKind, nmId: string | null, fingerprint: string): string {
  return `${kind}:${nmId ?? "store"}:${fingerprint}`;
}

function makeEvent(
  kind: SellerEventKind,
  severity: SellerEventSeverity,
  title: string,
  detail: string,
  createdAt: string,
  fingerprint: string,
  product?: { title: string; vendorCode: string; nmId: string; itemId: string } | null,
): SellerProductEvent {
  return {
    id: eventId(kind, product?.nmId ?? null, fingerprint),
    createdAt,
    kind,
    group: EVENT_GROUP[kind],
    severity,
    title,
    detail,
    productTitle: product?.title ?? null,
    vendorCode: product?.vendorCode ?? null,
    nmId: product?.nmId ?? null,
    itemId: product?.itemId ?? null,
  };
}

/** Та же проверка, что у событий продаж: доля и минимум штук. */
export function salesWindowShift(
  qty: number,
  prior: number,
  rules: { salesChangeMinUnits: number; salesChangeRatio: number },
): "up" | "down" | null {
  const delta = qty - prior;
  if (Math.abs(delta) < rules.salesChangeMinUnits) return null;
  if (prior <= 0) return qty >= rules.salesChangeMinUnits ? "up" : null;
  const ratio = delta / prior;
  if (ratio <= -rules.salesChangeRatio) return "down";
  if (ratio >= rules.salesChangeRatio) return "up";
  return null;
}

function salesShift(qty: number, prior: number): "up" | "down" | null {
  return salesWindowShift(qty, prior, EVENT_RULES);
}

function remember(list: SellerProductEvent[], seen: Set<string>, event: SellerProductEvent) {
  if (seen.has(event.id)) return;
  seen.add(event.id);
  list.push(event);
}

function baselineFrom(reading: ProductReading, absent: boolean): ProductBaseline {
  const window =
    reading.salesQty != null && reading.priorSalesQty != null
      ? `${reading.salesQty}:${reading.priorSalesQty}`
      : null;
  return {
    itemId: reading.itemId,
    title: reading.title,
    vendorCode: reading.vendorCode,
    price: reading.price,
    discount: reading.discount,
    promoPrice: reading.promoPrice,
    stock: reading.stock,
    salesQty: reading.salesQty,
    salesWindow: window,
    contentScore: reading.contentScore,
    photoCount: reading.photoCount,
    coverDays: reading.coverDays,
    descriptionHash: reading.descriptionHash ?? null,
    descriptionLength: reading.descriptionLength ?? null,
    characteristicsCount: reading.characteristicsCount ?? null,
    hasVideo: reading.hasVideo ?? null,
    absent,
  };
}

function pushSalesWindow(
  next: SellerProductEvent[],
  seen: Set<string>,
  product: { title: string; vendorCode: string; nmId: string; itemId: string },
  createdAt: string,
  previousWindow: string | null,
  reading: ProductReading,
) {
  if (reading.salesQty == null || reading.priorSalesQty == null) return;
  const signature = `${reading.salesQty}:${reading.priorSalesQty}`;
  if (previousWindow === signature) return;
  const shift = salesShift(reading.salesQty, reading.priorSalesQty);
  if (shift === "down") {
    remember(
      next,
      seen,
      makeEvent(
        "sales_down",
        "important",
        "Продажи снизились",
        `28 дней: ${pieces(reading.salesQty)}\nПредыдущий период: ${pieces(reading.priorSalesQty)}`,
        createdAt,
        signature,
        product,
      ),
    );
  } else if (shift === "up") {
    remember(
      next,
      seen,
      makeEvent(
        "sales_up",
        "info",
        "Продажи выросли",
        `28 дней: ${pieces(reading.salesQty)}\nПредыдущий период: ${pieces(reading.priorSalesQty)}`,
        createdAt,
        signature,
        product,
      ),
    );
  }
}

function compareProduct(
  previous: ProductBaseline,
  reading: ProductReading,
  createdAt: string,
  seen: Set<string>,
): SellerProductEvent[] {
  const next: SellerProductEvent[] = [];
  const product = {
    title: reading.title,
    vendorCode: reading.vendorCode,
    nmId: reading.nmId,
    itemId: reading.itemId,
  };

  if (
    previous.stock != null &&
    previous.stock > 0 &&
    reading.stock === 0
  ) {
    remember(
      next,
      seen,
      makeEvent("stock_out", "critical", "Остаток закончился", "Остаток: 0 шт.", createdAt, "out", product),
    );
  }
  else if (
    previous.coverDays != null &&
    reading.coverDays != null &&
    previous.coverDays >= EVENT_RULES.lowStockDays &&
    reading.coverDays < EVENT_RULES.lowStockDays &&
    (reading.stock ?? 0) > 0
  ) {
    // Прогноз, а не состояние: срок пересёк порог. Дата считается по текущему запасу и темпу продаж за 28 дней.
    const when = new Date(Date.parse(createdAt) + reading.coverDays * 86_400_000).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
    remember(
      next,
      seen,
      makeEvent(
        "forecast_stockout",
        "important",
        `Прогноз: товар закончится около ${when}`,
        `Остаток ${reading.stock} шт., хватит примерно на ${reading.coverDays} дн. при темпе продаж за последние 28 дней.\nЭто оценка по прошлым продажам: если спрос вырастет, товар закончится раньше.`,
        createdAt,
        `${previous.coverDays}>${reading.coverDays}`,
        product,
      ),
    );
  }
  // «Запас стал коротким» как состояние здесь не создаём: его ведёт раздел «Задачи».

  // «Появились продажи +1 шт.» не создаём: это шум при каждой продаже, продажи смотрите в «Аналитике».

  pushSalesWindow(next, seen, product, createdAt, previous.salesWindow, reading);

  if (previous.price != null && reading.price != null && previous.price !== reading.price) {
    remember(
      next,
      seen,
      makeEvent(
        "price_changed",
        "info",
        "Изменилась цена",
        `${rub(previous.price)} → ${rub(reading.price)}`,
        createdAt,
        `${previous.price}->${reading.price}`,
        product,
      ),
    );
  }

  if (previous.discount != null && reading.discount != null && previous.discount !== reading.discount) {
    remember(
      next,
      seen,
      makeEvent(
        "discount_changed",
        "info",
        "Изменилась скидка",
        `${previous.discount}% → ${reading.discount}%`,
        createdAt,
        `${previous.discount}->${reading.discount}`,
        product,
      ),
    );
  }

  if (
    previous.promoPrice != null &&
    reading.promoPrice != null &&
    previous.promoPrice !== reading.promoPrice
  ) {
    remember(
      next,
      seen,
      makeEvent(
        "promo_price_changed",
        "info",
        "Изменилась цена со скидкой",
        `${rub(previous.promoPrice)} → ${rub(reading.promoPrice)}`,
        createdAt,
        `${previous.promoPrice}->${reading.promoPrice}`,
        product,
      ),
    );
  }

  // Настоящие правки карточки. «Изменился контент» по нашей оценке не создаём: оценка меняется при изменении формулы, а не карточки.
  if (previous.title && reading.title && previous.title !== reading.title) {
    const clip = (text: string) => (text.length > 140 ? `${text.slice(0, 139)}…` : text);
    remember(
      next,
      seen,
      makeEvent("card_title_changed", "info", "Изменилось название", `Было: ${clip(previous.title)}\nСтало: ${clip(reading.title)}`, createdAt, `${hashText(previous.title)}>${hashText(reading.title)}`, product),
    );
  }

  if (previous.descriptionHash != null && reading.descriptionHash != null && previous.descriptionHash !== reading.descriptionHash) {
    remember(
      next,
      seen,
      makeEvent(
        "card_description_changed",
        "info",
        "Изменилось описание",
        previous.descriptionLength != null && reading.descriptionLength != null ? `Было ${previous.descriptionLength} симв., стало ${reading.descriptionLength}` : "Текст описания изменён",
        createdAt,
        `${previous.descriptionHash}>${reading.descriptionHash}`,
        product,
      ),
    );
  }

  if (previous.characteristicsCount != null && reading.characteristicsCount != null && previous.characteristicsCount !== reading.characteristicsCount) {
    remember(
      next,
      seen,
      makeEvent("card_characteristics_changed", "info", "Изменились характеристики", `Было ${previous.characteristicsCount}, стало ${reading.characteristicsCount}`, createdAt, `${previous.characteristicsCount}>${reading.characteristicsCount}`, product),
    );
  }

  if (previous.hasVideo != null && reading.hasVideo != null && previous.hasVideo !== reading.hasVideo) {
    remember(
      next,
      seen,
      makeEvent("card_video_changed", "info", reading.hasVideo ? "В карточку добавлено видео" : "Из карточки убрано видео", "", createdAt, reading.hasVideo ? "added" : "removed", product),
    );
  }

  if (
    previous.photoCount != null &&
    reading.photoCount != null &&
    previous.photoCount !== reading.photoCount
  ) {
    remember(
      next,
      seen,
      makeEvent(
        "photos_changed",
        "info",
        "Изменилось число фото",
        `Было ${previous.photoCount}, стало ${reading.photoCount}`,
        createdAt,
        `${previous.photoCount}->${reading.photoCount}`,
        product,
      ),
    );
  }

  return next;
}

export function diffSellerEvents(input: {
  now: string;
  previous: SellerEventsState;
  products: ProductReading[];
  store: StoreReading;
}): SellerEventsState {
  const seen = new Set(input.previous.events.map((event) => event.id));
  const fresh: SellerProductEvent[] = [];
  const products: Record<string, ProductBaseline> = { ...input.previous.products };
  const captured = input.previous.store.captured;
  const currentIds = new Set(input.products.map((product) => product.nmId));
  const canRemove = captured && input.products.length > 0;

  for (const reading of input.products) {
    const previous = products[reading.nmId];
    if (!previous) {
      if (captured) {
        remember(
          fresh,
          seen,
          makeEvent(
            "product_added",
            "info",
            "Новый товар",
            "Появился в каталоге",
            input.now,
            "added",
            reading,
          ),
        );
      }
      pushSalesWindow(fresh, seen, reading, input.now, null, reading);
      products[reading.nmId] = baselineFrom(reading, false);
      continue;
    }

    if (previous.absent) {
      if (captured) {
        remember(
          fresh,
          seen,
          makeEvent(
            "product_added",
            "info",
            "Новый товар",
            "Снова в каталоге",
            input.now,
            `back-${input.store.syncAt || input.now}`,
            reading,
          ),
        );
      }
      fresh.push(...compareProduct(previous, reading, input.now, seen));
      products[reading.nmId] = baselineFrom(reading, false);
      continue;
    }

    fresh.push(...compareProduct(previous, reading, input.now, seen));
    products[reading.nmId] = baselineFrom(reading, false);
  }

  if (canRemove) {
    for (const [nmId, previous] of Object.entries(products)) {
      if (previous.absent || currentIds.has(nmId)) continue;
      remember(
        fresh,
        seen,
        makeEvent(
          "product_removed",
          "info",
          "Товар пропал из каталога",
          "Больше нет в текущем каталоге",
          input.now,
          `gone-${input.store.syncAt || input.now}`,
          {
            title: previous.title,
            vendorCode: previous.vendorCode,
            nmId,
            itemId: previous.itemId,
          },
        ),
      );
      products[nmId] = { ...previous, absent: true };
    }
  }

  const store = input.previous.store;

  // Факты по кабинету. Первый снимок (captured = false) только запоминается, сервер в этом случае отбрасывает события целиком.
  const nextSignals = input.store.signals ?? null;
  if (captured && nextSignals) {
    const titles = new Map(input.products.map((product) => [product.nmId, product.title]));
    for (const event of diffStoreSignals({
      now: input.now,
      previous: store.signals ?? null,
      next: nextSignals,
      titleOf: (nmId) => (titles.has(nmId) ? { title: titles.get(nmId)! } : null),
    })) {
      remember(fresh, seen, event);
    }
    // Предупреждения об акциях из календаря WB (по датам, а не по изменениям между снимками).
    const todayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Moscow" }).format(new Date(input.now));
    for (const event of promoReminders(nextSignals.promos, todayKey, input.now)) remember(fresh, seen, event);
  }
  // «Отзывы и вопросы без ответа» и «каталог обновлён» больше не события: первое состояние (раздел «Задачи»), второе шум.

  const events = [...fresh, ...input.previous.events].slice(0, EVENT_RULES.maxEvents);

  return {
    version: 1,
    products,
    store: {
      captured: true,
      lastSyncAt: input.store.syncAt || store.lastSyncAt,
      unansweredFeedbacks: input.store.unansweredFeedbacks ?? store.unansweredFeedbacks,
      unansweredQuestions: input.store.unansweredQuestions ?? store.unansweredQuestions,
      signals: nextSignals ? baselineOfSignals(nextSignals, store.signals ?? null) : (store.signals ?? null),
    },
    events,
  };
}
