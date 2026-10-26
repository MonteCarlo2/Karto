/** Статусы истории загрузки из спецификации цен WB: 3 готово без ошибок, 4 отмена, 5 часть с ошибками, 6 ошибки во всех. */
export type PriceUploadHistoryOutcome = "processed" | "rejected" | "partial";

export type PriceWriteOutcome = "confirmed" | "processed" | "rejected" | "partial" | "unknown" | "failed";

export type PriceWriteView = {
  outcome: PriceWriteOutcome;
  tone: "ok" | "warn" | "error";
  text: string;
  /** Менять снимок можно только когда прочитанная цена совпала с отправленной. */
  applyLocal: boolean;
  uploadId?: number;
  verified: boolean;
};

export function priceWriteClosesTask(): false {
  return false;
}

export function claimPriceSubmit(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releasePriceSubmit(lock: { current: boolean }): void {
  lock.current = false;
}

export function interpretPriceUploadStatus(input: {
  status: number;
  successCount: number;
  errors: string[];
}): { ok: boolean; outcome: PriceUploadHistoryOutcome; error?: string } | null {
  if (input.status === 3) return { ok: true, outcome: "processed" };
  if (input.status === 4) {
    return { ok: false, outcome: "rejected", error: "Wildberries отменил загрузку цен или скидок" };
  }
  if (input.status === 5) {
    const hint = input.errors.length > 0 ? input.errors.slice(0, 3).join("; ") : "Проверьте цену и скидку в кабинете WB";
    return {
      ok: false,
      outcome: "partial",
      error: `WB обработал загрузку с ошибками у части товаров: ${hint}`,
    };
  }
  if (input.status === 6) {
    const hint = input.errors.length > 0 ? input.errors.slice(0, 3).join("; ") : "Проверьте цену и скидку в кабинете WB";
    return {
      ok: false,
      outcome: "rejected",
      error: `WB не применил цену или скидку: ${hint}`,
    };
  }
  return null;
}

/** Цена и скидка, которые пользователь видел на экране, когда менял значение. */
export type ExpectedPrice = { price: number | null; discount: number | null };

export type StalePrice = {
  nmId: number;
  expected: ExpectedPrice;
  current: { price: number | null; discount: number | null };
};

/**
 * Проверка перед записью: совпадает ли цена в WB с той, что пользователь видел.
 * Если её кто-то поменял в кабинете WB (или другой вкладкой), запись поверх затёрла бы чужую правку молча.
 * Товары, которых WB не вернул, пропускаются: сверить не с чем, решение остаётся за вызывающим.
 */
export function findStalePrices(
  updates: Array<{ nmId: number; expected?: ExpectedPrice }>,
  read: Map<number, { price: number | null; discountPercent: number | null }>,
): StalePrice[] {
  const stale: StalePrice[] = [];
  for (const update of updates) {
    const expected = update.expected;
    const actual = read.get(update.nmId);
    if (!expected || !actual) continue;
    const price = actual.price == null ? null : Math.round(actual.price);
    const discount = actual.discountPercent == null ? 0 : Math.round(actual.discountPercent);
    const priceChanged = expected.price != null && price != null && Math.round(expected.price) !== price;
    const discountChanged = expected.discount != null && Math.round(expected.discount) !== discount;
    if (priceChanged || discountChanged) stale.push({ nmId: update.nmId, expected, current: { price, discount } });
  }
  return stale;
}

export function stalePriceMessage(stale: StalePrice[]): string {
  const part = (s: StalePrice) => {
    const fmt = (p: number | null, d: number | null) => `${p == null ? "цена неизвестна" : `${p.toLocaleString("ru-RU")} ₽`}${d == null ? "" : `, скидка ${d}%`}`;
    return `артикул ${s.nmId}: у вас на экране ${fmt(s.expected.price, s.expected.discount)}, сейчас в Wildberries ${fmt(s.current.price, s.current.discount)}`;
  };
  const shown = stale.slice(0, 3).map(part).join("; ");
  const more = stale.length > 3 ? ` и ещё ${stale.length - 3}` : "";
  return `Цену в Wildberries уже изменили (${shown}${more}). Мы ничего не записали, чтобы не затереть изменение. Обновите данные и повторите.`;
}

export function requestedPriceMatchesRead(
  requested: { price?: number; discount?: number },
  actual: { price: number | null; discountPercent: number | null } | undefined,
): boolean {
  if (!actual) return false;
  const askedPrice = requested.price != null && requested.price > 0;
  const askedDiscount = requested.discount != null && requested.discount >= 0;
  if (!askedPrice && !askedDiscount) return false;
  if (askedPrice && (actual.price == null || Math.round(actual.price) !== Math.round(requested.price!))) return false;
  if (askedDiscount) {
    const actualDiscount = actual.discountPercent == null ? 0 : Math.round(actual.discountPercent);
    if (actualDiscount !== Math.round(requested.discount!)) return false;
  }
  return true;
}

export function settlePriceUpload(input: {
  uploadOk: boolean;
  uploadError?: string;
  uploadId?: number;
  waitOutcome?: PriceUploadHistoryOutcome | "unknown";
  waitError?: string;
  read?: "match" | "mismatch" | "unread";
}): PriceWriteView {
  const uploadId = input.uploadId;
  if (!input.uploadOk) {
    return priceWriteView({
      outcome: "failed",
      uploadId,
      error: input.uploadError ?? "Не удалось отправить цену",
    });
  }
  if (uploadId == null || input.waitOutcome == null || input.waitOutcome === "unknown") {
    return priceWriteView({ outcome: "unknown", uploadId, error: input.waitError });
  }
  if (input.waitOutcome === "rejected" || input.waitOutcome === "partial") {
    return priceWriteView({
      outcome: input.waitOutcome,
      uploadId,
      error: input.waitError,
    });
  }
  if (input.read === "match") return priceWriteView({ outcome: "confirmed", uploadId, read: "match" });
  return priceWriteView({
    outcome: "processed",
    uploadId,
    read: input.read === "mismatch" ? "mismatch" : "unread",
  });
}

export function priceWriteView(input: {
  outcome: PriceWriteOutcome;
  uploadId?: number;
  error?: string;
  read?: "match" | "mismatch" | "unread";
}): PriceWriteView {
  const id = input.uploadId != null ? ` ${input.uploadId}` : "";
  if (input.outcome === "confirmed") {
    return {
      outcome: "confirmed",
      tone: "ok",
      applyLocal: true,
      verified: true,
      uploadId: input.uploadId,
      text: `WB обработал загрузку${id}, и прочитанная цена совпала с отправленной.`,
    };
  }
  if (input.outcome === "processed") {
    const why =
      input.read === "mismatch"
        ? "Прочитанная цена с отправленной не совпала"
        : "Текущую цену товара после загрузки прочитать не удалось";
    return {
      outcome: "processed",
      tone: "warn",
      applyLocal: false,
      verified: false,
      uploadId: input.uploadId,
      text: `WB обработал загрузку${id} без ошибок в товарах. ${why}, поэтому в снимке цену не меняю.`,
    };
  }
  if (input.outcome === "partial") {
    return {
      outcome: "partial",
      tone: "warn",
      applyLocal: false,
      verified: false,
      uploadId: input.uploadId,
      text: input.error ?? `WB обработал загрузку${id} только частично. В снимке цену не меняю.`,
    };
  }
  if (input.outcome === "unknown") {
    return {
      outcome: "unknown",
      tone: "warn",
      applyLocal: false,
      verified: false,
      uploadId: input.uploadId,
      text: input.uploadId != null
        ? `Загрузка${id} отправлена, но результат обработки пока неизвестен. Сам повторно её не отправляю.`
        : "WB не вернул номер загрузки. Применилась ли цена, неизвестно. Сам повторно её не отправляю.",
    };
  }
  if (input.outcome === "rejected") {
    return {
      outcome: "rejected",
      tone: "error",
      applyLocal: false,
      verified: false,
      uploadId: input.uploadId,
      text: input.error ?? "WB отклонил изменение цены или скидки.",
    };
  }
  return {
    outcome: "failed",
    tone: "error",
    applyLocal: false,
    verified: false,
    uploadId: input.uploadId,
    text: input.error ?? "Не удалось отправить цену. По ответу WB она не менялась.",
  };
}

export function priceJournalEntry(input: {
  rows: Array<{ nmId: number; beforePrice?: number | null; beforeDiscount?: number | null; price?: number; discount?: number }>;
  view: PriceWriteView;
}): { title: string; detail: string; actor: "user" } {
  const sample = input.rows
    .slice(0, 3)
    .map((row) => {
      const before = [row.beforePrice != null ? String(row.beforePrice) : "—", row.beforeDiscount != null ? `${row.beforeDiscount}%` : "—"].join("/");
      const next = [row.price != null ? String(row.price) : "—", row.discount != null ? `${row.discount}%` : "—"].join("/");
      return `nm ${row.nmId}: ${before} → ${next}`;
    })
    .join("; ");
  const more = input.rows.length > 3 ? ` и ещё ${input.rows.length - 3}` : "";
  const upload = input.view.uploadId != null ? `upload ${input.view.uploadId}` : "upload нет";
  return {
    title: "Цена и скидка",
    detail: `${sample}${more}. ${upload}. ${input.view.outcome}. ${input.view.text}`,
    actor: "user",
  };
}
