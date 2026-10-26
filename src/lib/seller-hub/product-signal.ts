import { accountUnitAverages, productUnitEconomics } from "./product-economics";
import { productUnitSaleEconomics } from "./product-unit-sale";
import type {
  SellerCatalogSnapshot,
  SellerFunnelNm,
  SellerFunnelSnapshot,
  SellerPaidStorageSnapshot,
  SellerPromotionRow,
  SellerRealizationNm,
  SellerRealizationSnapshot,
} from "./types";

export type MarginSource = "sku" | "account";

export type ProductTone = "ok" | "warn" | "danger" | "muted";

export type ProductMarginBreakdown = {
  p: number;
  k: number;
  l: number;
  d: number;
  rReturn: number;
  b: number;
  D: number;
  s: number | null;
  a: number;
  c: number;
  taxPerSale: number;
  storageExcluded: boolean;
  taxSpecified: boolean;
};

export type ProductMarginFact28 = {
  accrued: number;
  logistics: number;
  storage: number;
  acceptance: number;
  cost: number;
  tax: number;
  total: number;
};

export type ProductMargin = {
  percent: number;
  rub: number;
  source: MarginSource;
  breakdown?: ProductMarginBreakdown;
  fact28?: ProductMarginFact28 | null;
};

/** Почему % в колонке нет. */
export type ProductMarginGap = "no-cost" | "no-deliveries" | "no-sales";

export type ProductRead = {
  margin: ProductMargin | null;
  /** Почему нет %: без себестоимости / нет доставок 90д. */
  marginGap: ProductMarginGap | null;
  soldQty: number | null;
  /** Короткая подпись для сканирования строки. */
  label: string;
  /** Развёрнутое объяснение, его читают по наведению. */
  detail: string;
  tone: ProductTone;
  /** Клик открывает правку цены и закупки. В WB само не отправляется. */
  opensEdit: boolean;
  /** Цена, ниже которой после списаний WB закупка не покрывается. */
  floor: number | null;
  /** На сколько дней хватит остатка по темпу продаж из отчёта. */
  burnDays: number | null;
  /** Вторая половина 28 дней против первой, на текущую цену. */
  trend: "up" | "down" | "flat" | null;
  /** Спрос, склад, контент и рейтинг. Себестоимость в число не входит. */
  index: number | null;
  indexDetail: string;
  /** Заполненность карточки отдельно от единого индекса. */
  cardScore: number | null;
  /** Медиа 40, характеристики 35, описание 25. Те же числа, что в контент-скоре. */
  cardParts: { media: number; filters: number; copy: number } | null;
  /** Штуки сверх темпа 28 дней. */
  excessUnits: number | null;
  /** Закупка на эти штуки. */
  excessRub: number | null;
  /** «автоакция», «в акции» или «скоро акция». */
  promoMark: string | null;
  /** Продажи этих 28 дней против предыдущих 28. Нет поля — второе окно ещё не прочитано. */
  soldDelta: PeriodDelta | null;
  /** Средний рейтинг отзывов за 180 дней. */
  reviewRatingAvg: number | null;
  /** Число отзывов за 180 дней. */
  reviewCount180: number | null;
  /** Отзывы без ответа (из них негативных 1–3★). */
  unansweredReviews: number | null;
  unansweredNegativeReviews: number | null;
  /** Вопросы без ответа. */
  unansweredQuestions: number | null;
  readout: ReadoutSection[];
};

export type PeriodDelta = {
  text: string;
  tone: "ok" | "danger";
  direction: "up" | "down";
  /** Процент вплотную к стрелке. */
  mark: string;
  /** Словесная подпись под числом, если она есть. */
  caption: string | null;
};

export type CheckState = "ok" | "warn" | "missing" | "unknown";

export type CheckItem = {
  label: string;
  note: string;
  state: CheckState;
};

/** Шкала колонки «Оценка»: A от 85, B от 70, C от 50. */
export function scoreGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

/** Шкала колонки «Контент»: A от 85, B от 70, C от 50. */
export function contentGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  return "D";
}

function gradeWord(letter: "A" | "B" | "C" | "D"): string {
  switch (letter) {
    case "A":
      return "Отлично";
    case "B":
      return "Норма";
    case "C":
      return "Внимание";
    case "D":
      return "Риск";
    default: {
      const unexpected: never = letter;
      return unexpected;
    }
  }
}

/** Одно слово на букву и для оценки, и для контента. */
export function gradeTitle(scale: "index" | "content", score: number): string {
  switch (scale) {
    case "index":
      return gradeWord(scoreGrade(score));
    case "content":
      return gradeWord(contentGrade(score));
    default: {
      const unexpected: never = scale;
      return unexpected;
    }
  }
}

export type ContentAction = "visual" | "description" | "card";

export type ContentBlock = {
  title: string;
  points: number;
  max: number;
  lines: string[];
  advice: string | null;
  adviceTone?: "danger";
  action: ContentAction | null;
};

export function qtyDelta(current: number, prior: number | undefined): PeriodDelta | null {
  if (prior == null) return null;
  if (prior === 0 && current === 0) return null;
  if (prior <= 0) {
    return current > 0
      ? { text: "↑ с нуля", tone: "ok", direction: "up", mark: "", caption: "с нуля" }
      : null;
  }
  const pct = ((current - prior) / prior) * 100;
  if (Math.abs(pct) < 1) return null;
  const digits = Math.abs(pct).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  if (pct > 0) {
    return { text: `↑ +${digits}%`, tone: "ok", direction: "up", mark: `+${digits}%`, caption: null };
  }
  return { text: `↓ −${digits}%`, tone: "danger", direction: "down", mark: `−${digits}%`, caption: null };
}

export type ReadoutSectionId = "index" | "card" | "stock" | "margin" | "capital" | "status";

export type ReceiptRole = "line" | "gain" | "loss" | "warn";

export type ReceiptRow = {
  label: string;
  value: string;
  role: ReceiptRole;
};

export type ReadoutSection = {
  id: ReadoutSectionId;
  title: string;
  figure: string | null;
  about: string;
  method: string;
  facts: string[];
  next: string | null;
  receipt: ReceiptRow[];
  checklist: CheckItem[];
  blocks: ContentBlock[];
};

/** Потолок показа дней. Считаем точно, в ячейке не пишем десятки тысяч. */
export const STOCK_DAY_CAP = 180;

export function stockColumn(input: {
  ready: boolean;
  stock: number | null;
  soldQty: number | null;
  burnDays: number | null;
  fallbackDays: number | null;
}): { text: string; tone: "danger" | "ok" | "warn" | "muted" } {
  if (!input.ready) {
    if (input.fallbackDays == null) return { text: "—", tone: "muted" };
    if (input.fallbackDays > STOCK_DAY_CAP) return { text: `> ${STOCK_DAY_CAP} дн.`, tone: "warn" };
    if (input.fallbackDays <= 28) return { text: `${input.fallbackDays} дн.`, tone: "danger" };
    return { text: `${input.fallbackDays} дн.`, tone: "ok" };
  }
  if ((input.stock ?? 0) <= 0) return { text: "—", tone: "muted" };
  if ((input.soldQty ?? 0) <= 0 || input.burnDays == null) return { text: "Нет продаж", tone: "muted" };
  if (input.burnDays > STOCK_DAY_CAP) return { text: `> ${STOCK_DAY_CAP} дн.`, tone: "warn" };
  if (input.burnDays <= 28) return { text: `${input.burnDays} дн.`, tone: "danger" };
  return { text: `${input.burnDays} дн.`, tone: "ok" };
}

function rub(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function percent(value: number): string {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function runOutLabel(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function keepRate(
  own: SellerRealizationNm | undefined,
  realization: SellerRealizationSnapshot,
): { rate: number; source: MarginSource } | null {
  if (own && own.retail > 0 && own.qty > 0) return { rate: own.net / own.retail, source: "sku" };
  if (realization.accountRetail > 0) return { rate: realization.accountNet / realization.accountRetail, source: "account" };
  return null;
}

/** Маржа на 1 продажу (90д доставки). Факт окна 28д — отдельно в fact28. */
export function saleMargin(input: {
  realization: SellerRealizationSnapshot | null | undefined;
  paidStorage?: SellerPaidStorageSnapshot | null;
  externalId: string;
  cost: number | null | undefined;
  sale: number | null | undefined;
  taxRatePercent?: number | null;
  stockFbo?: number | null;
}): {
  rub: number;
  percent: number;
  floor: number;
  source: MarginSource;
  storageExcluded?: boolean;
  breakdown?: ProductMarginBreakdown;
  fact28?: ProductMarginFact28 | null;
  gap?: ProductMarginGap;
} | null {
  if (!input.realization || input.realization.error) return null;
  if (input.sale == null || input.sale <= 0) return null;

  // v5+: маржа на 1 продажу по доставкам 90д.
  if ((input.realization.version ?? 0) >= 5 || input.realization.shopDelivery90) {
    const unitSale = productUnitSaleEconomics({
      realization: input.realization,
      paidStorage: input.paidStorage,
      nmId: input.externalId,
      costPerUnit: input.cost,
      taxRatePercent: input.taxRatePercent ?? null,
      currentPrice: input.sale,
      stockFbo: input.stockFbo ?? null,
    });
    if (!unitSale) {
      return { rub: 0, percent: 0, floor: 0, source: "sku", gap: "no-deliveries" };
    }
    if (input.cost == null || !(input.cost > 0) || unitSale.u == null || unitSale.m == null) {
      return {
        rub: 0,
        percent: 0,
        floor: 0,
        source: "sku",
        gap: "no-cost",
        breakdown: {
          p: unitSale.p,
          k: unitSale.k,
          l: unitSale.l,
          d: unitSale.d,
          rReturn: unitSale.r,
          b: unitSale.b,
          D: unitSale.D,
          s: unitSale.s,
          a: unitSale.a,
          c: 0,
          taxPerSale: 0,
          storageExcluded: unitSale.storageExcluded,
          taxSpecified: false,
        },
      };
    }
    const factEcon = productUnitEconomics({
      realization: input.realization,
      paidStorage: input.paidStorage,
      nmId: input.externalId,
      costPerUnit: input.cost,
      taxRatePercent: null,
      currentPrice: input.sale,
      stockFbo: input.stockFbo ?? null,
      which: "current",
    });
    const fact28: ProductMarginFact28 | null = factEcon
      ? {
          accrued: Math.round(factEcon.Pay),
          logistics: Math.round(factEcon.L),
          storage: Math.round(factEcon.St ?? 0),
          acceptance: Math.round(factEcon.A),
          cost: Math.round(factEcon.C),
          tax: 0,
          total: Math.round(factEcon.P),
        }
      : null;
    return {
      rub: unitSale.u,
      percent: Math.round(unitSale.m * 1000) / 10,
      floor: unitSale.breakEvenPrice ?? 0,
      source: "sku",
      storageExcluded: unitSale.storageExcluded,
      breakdown: {
        p: unitSale.p,
        k: unitSale.k,
        l: unitSale.l,
        d: unitSale.d,
        rReturn: unitSale.r,
        b: unitSale.b,
        D: unitSale.D,
        s: unitSale.s,
        a: unitSale.a,
        c: input.cost,
        taxPerSale: 0,
        storageExcluded: unitSale.storageExcluded,
        taxSpecified: false,
      },
      fact28,
    };
  }

  if (input.cost == null || input.cost <= 0) return null;

  // v4: операционная маржа P/S (fallback без delivery90).
  if ((input.realization.version ?? 0) >= 4) {
    const econ = productUnitEconomics({
      realization: input.realization,
      paidStorage: input.paidStorage,
      nmId: input.externalId,
      costPerUnit: input.cost,
      taxRatePercent: input.taxRatePercent ?? null,
      currentPrice: input.sale,
      stockFbo: input.stockFbo ?? null,
      which: "current",
    });
    if (econ) {
      return {
        rub: econ.uNow ?? econ.u,
        percent: Math.round(((econ.uNow ?? econ.u) / input.sale) * 1000) / 10,
        floor: econ.breakEvenPrice ?? Math.ceil(input.cost / Math.max(1e-9, 1 - econ.k)),
        source: "sku",
        storageExcluded: econ.storageExcluded,
      };
    }
    const avg = accountUnitAverages(input.realization);
    if (avg && avg.k < 1) {
      const F = avg.logisticsPerUnit + avg.storagePerUnit + avg.acceptancePerUnit + input.cost;
      const denom = 1 - avg.k;
      if (denom > 0) {
        const rubVal = input.sale * denom - F;
        return {
          rub: rubVal,
          percent: Math.round((rubVal / input.sale) * 1000) / 10,
          floor: Math.ceil(F / denom),
          source: "account",
        };
      }
    }
    return null;
  }

  const own = input.realization.byNm[input.externalId];
  const kept = keepRate(own, input.realization);
  if (!kept || kept.rate <= 0) return null;
  const rubVal = input.sale * kept.rate - input.cost;
  return {
    rub: rubVal,
    percent: Math.round((rubVal / input.sale) * 1000) / 10,
    floor: Math.ceil(input.cost / kept.rate),
    source: kept.source,
  };
}

function promoLine(
  externalId: string,
  cost: number,
  rate: number,
  promotions: SellerPromotionRow[] | undefined,
  terms: SellerCatalogSnapshot["promotionEntryTerms"],
): { text: string; negative: boolean } | null {
  if (!terms) return null;
  let negative: { text: string } | null = null;
  let positive: { text: string } | null = null;
  for (const [promoId, byNm] of Object.entries(terms)) {
    const plan = byNm[externalId]?.planPrice;
    if (plan == null) continue;
    const left = plan * rate - cost;
    const name = promotions?.find((promo) => promo.id === promoId)?.name ?? "акцию WB";
    if (left < 0 && !negative) {
      negative = {
        text: `В «${name}» не входить: на пороге ${rub(plan)} после списаний WB минус ${rub(Math.abs(left))} на штуку.`,
      };
    }
    if (left >= 0 && !positive) {
      positive = {
        text: `Можно в «${name}»: порог ${rub(plan)}, после списаний останется ${rub(left)} на штуку.`,
      };
    }
  }
  if (negative) return { text: negative.text, negative: true };
  if (positive) return { text: positive.text, negative: false };
  return null;
}

function paceCaption(own: SellerRealizationNm | undefined): string {
  if (!own) return "Темп продаж из отчёта неизвестен.";
  const recent = own.recentQty;
  if (recent == null) {
    return own.qty > 0
      ? `Темп по всем 28 дням: ${own.qty.toLocaleString("ru-RU")} шт.`
      : "Продаж в отчёте не было.";
  }
  if (recent > 0) return `Темп по последним 7 дням отчёта: ${recent.toLocaleString("ru-RU")} шт.`;
  if (own.qty > 0) {
    return `За последние 7 дней продаж не было. Темп по всем 28 дням: ${own.qty.toLocaleString("ru-RU")} шт.`;
  }
  return "Продаж в отчёте не было.";
}

/** Окно темпа из отчёта реализации: 7 дней при продажах в них, иначе все 28, иначе темпа нет. */
export type StockPaceWindow = "recent" | "span" | "none";

export type StockPace = {
  daily: number;
  expected: number;
  /** null — нет остатка, нет темпа или оба. Не дата обнуления. */
  days: number | null;
  excessUnits: number;
  window: StockPaceWindow;
};

/**
 * Темп и дни запаса по отчёту реализации.
 * recentQty > 0 → шт./день = recentQty/7; иначе qty > 0 → qty/28; иначе темпа нет.
 * days = round(stock / daily) только при stock > 0 и daily > 0.
 */
export function stockPace(stock: number | null, own: SellerRealizationNm | undefined): StockPace {
  const units = stock ?? 0;
  const recent = own?.recentQty;
  const qty = own?.qty ?? 0;
  const window: StockPaceWindow = recent != null && recent > 0 ? "recent" : qty > 0 ? "span" : "none";
  const daily = recent != null && recent > 0 ? recent / 7 : qty > 0 ? qty / 28 : 0;
  const expected = daily * 28;
  return {
    daily,
    expected,
    days: units > 0 && daily > 0 ? Math.max(0, Math.round(units / daily)) : null,
    excessUnits: Math.max(0, units - expected),
    window,
  };
}

/** Дни запаса по темпу отчёта реализации: 7 дней, если в них были продажи, иначе 28. */
export function stockCoverDays(stock: number | null, own: SellerRealizationNm | undefined): number | null {
  if (stock == null || stock <= 0) return null;
  return stockPace(stock, own).days;
}

function paceDays(stock: number | null, own: SellerRealizationNm | undefined): number | null {
  return stockCoverDays(stock, own);
}

function oneDecimal(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function marginTrend(
  own: SellerRealizationNm | undefined,
  sale: number | null,
  cost: number | null,
): "up" | "down" | "flat" | null {
  if (!own || sale == null || sale <= 0 || cost == null) return null;
  const earlyRetail = own.earlyRetail ?? 0;
  const lateRetail = own.lateRetail ?? 0;
  if (earlyRetail <= 0 || lateRetail <= 0) return null;
  const early = ((sale * ((own.earlyNet ?? 0) / earlyRetail) - cost) / sale) * 100;
  const late = ((sale * ((own.lateNet ?? 0) / lateRetail) - cost) / sale) * 100;
  const delta = late - early;
  if (delta >= 1) return "up";
  if (delta <= -1) return "down";
  return "flat";
}

const FUNCTION_WORDS = new Set([
  "и", "в", "во", "на", "для", "с", "со", "по", "из", "от", "до", "или", "а", "но", "что", "это", "не",
  "к", "ко", "у", "о", "об", "за", "при", "без", "под", "над", "же", "ли", "бы", "как", "так", "его",
  "её", "ее", "их", "мы", "вы", "он", "она", "они",
]);

function photoPoints(count: number): number {
  if (count >= 7) return 25;
  if (count >= 5) return 20;
  if (count >= 3) return 14;
  if (count >= 1) return 6;
  return 0;
}

function lengthPoints(length: number): number {
  if (length >= 800) return 10;
  if (length >= 400) return 6;
  if (length >= 150) return 3;
  return 0;
}

function symbolWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "символ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "символа";
  return "символов";
}

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, "е");
}

function hasReadableBreaks(text: string): boolean {
  if (/\n\s*\n/.test(text)) return true;
  return /(^|\n)\s*(?:[•\-–]|\d+[.)])\s+\S/.test(text);
}

function shoutingCaps(text: string): boolean {
  const letters = text.match(/[А-ЯЁA-Zа-яёa-z]/g) ?? [];
  if (letters.length < 20) return false;
  const upper = letters.filter((char) => char === char.toUpperCase() && char !== char.toLowerCase()).length;
  if (upper / letters.length > 0.3) return true;
  return /[А-ЯЁA-Z]{12,}/.test(text);
}

function keywordDump(text: string): boolean {
  if (/([а-яеa-z0-9-]{3,}\s*[,;]\s*){6,}/i.test(text.toLowerCase().replace(/ё/g, "е"))) return true;
  for (const line of text.split(/\n+/)) {
    const lineWords = line.toLowerCase().replace(/ё/g, "е").match(/[а-яa-z0-9]+/g) ?? [];
    if (lineWords.length < 6) continue;
    if (/[.,!?:;]/.test(line)) continue;
    if (lineWords.every((word) => !FUNCTION_WORDS.has(word))) return true;
  }
  return false;
}

function wordNausea(text: string): boolean {
  const words = text.toLowerCase().replace(/ё/g, "е").match(/[а-яa-z0-9]+/g) ?? [];
  if (words.length < 20) return false;
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 4 || FUNCTION_WORDS.has(word)) continue;
    const stem = word.slice(0, 4);
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count >= 5 && count / words.length > 0.05) return true;
  }
  return false;
}

const KEY_RULES: Array<{ test: RegExp }> = [
  { test: /объем|литраж|емкост/ },
  { test: /размер|рост/ },
  { test: /мощност/ },
  { test: /возраст/ },
  { test: /диагонал/ },
  { test: /памят/ },
];

function isPackageSide(name: string): boolean {
  return /упаков/.test(name) && /длина|ширина|высота|глубина|габарит/.test(name);
}

function isExtraName(name: string, keyName: string | null): boolean {
  if (keyName && name === normName(keyName)) return false;
  if (/цвет/.test(name)) return false;
  if (/материал|состав|ткан/.test(name)) return false;
  if (/комплектац/.test(name)) return false;
  if (/вес/.test(name)) return false;
  if (isPackageSide(name)) return false;
  if (/^(длина|ширина|высота|глубина)$/.test(name)) return false;
  return true;
}

function pickKey(dictionary: string[], filled: Set<string>): { name: string; filled: boolean } | null {
  const matches: string[] = [];
  for (const rule of KEY_RULES) {
    for (const name of dictionary) {
      const normalized = normName(name);
      if (/упаков/.test(normalized)) continue;
      if (!rule.test.test(normalized) || matches.includes(name)) continue;
      matches.push(name);
    }
  }
  const filledMatch = matches.find((name) => filled.has(normName(name)));
  if (filledMatch) return { name: filledMatch, filled: true };
  if (matches[0]) return { name: matches[0], filled: false };
  return null;
}

function dictionaryHit(dictionary: string[] | null, test: RegExp): string | null {
  if (!dictionary) return null;
  return dictionary.find((name) => test.test(normName(name))) ?? null;
}

function slotFilled(filled: Set<string>, name: string | null, test: RegExp): boolean {
  if (name && filled.has(normName(name))) return true;
  for (const value of filled) {
    if (test.test(value)) return true;
  }
  return false;
}

function contentHeadline(score: number): string {
  const left = Math.max(0, 100 - score);
  const tail = left > 0 ? ` До идеала: +${left} б.` : "";
  const grade = contentGrade(score);
  switch (grade) {
    case "A":
      return `Карточка оптимизирована для поиска.${tail}`;
    case "B":
      return `Хорошая база.${tail}`;
    case "C":
      return `Средний уровень.${tail}`;
    case "D":
      return `Критический недобор.${tail}`;
    default: {
      const unexpected: never = grade;
      return unexpected;
    }
  }
}

/** Обложка не измеряется → слот вне шкалы (как «поля в категории нет»). */
export const CONTENT_COVER_POINTS = 5;
/** Медиа 40 − обложка 5 + фильтры 35 + описание 25. */
export const CONTENT_APPLICABLE_MAX = 100 - CONTENT_COVER_POINTS;

export type ContentGap = {
  points: number;
  line: string;
  block: "media" | "filters" | "copy" | "required";
};

export type ContentSlots = {
  photos: number;
  photosPoints: number;
  videoPoints: number;
  cover: "na";
  sides: number;
  weight: number;
  key: number;
  color: number;
  material: number;
  kit: number;
  extras: number;
  volume: number;
  breaks: number;
  caps: number;
  keywords: number;
};

export type ContentScoreResult = {
  score: number;
  earned: number;
  applicableMax: number;
  grade: "A" | "B" | "C" | "D";
  parts: { media: number; filters: number; copy: number };
  slots: ContentSlots;
  gaps: ContentGap[];
  gapLines: string[];
  requiredMissing: string[];
  lines: string[];
  blocks: ContentBlock[];
  headline: string;
};

function displayCharcLabel(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Первые N строк недобора для рычагов в задачах спроса. */
export function contentLeverSuffix(gapLines: string[] | null | undefined, limit = 3): string {
  if (!gapLines || gapLines.length === 0) return "";
  const top = gapLines.slice(0, limit);
  return ` Контент: ${top.join("; ")}.`;
}

export function contentScore(input: {
  photos: number;
  hasVideo: boolean;
  description: string | null;
  characteristicNames: string[] | null;
  categoryCharcNames: string[] | null;
  categoryCharcRequiredNames?: string[] | null;
  dimensions: { length?: number; width?: number; height?: number; weightKg?: number } | null;
}): ContentScoreResult {
  const photos = photoPoints(input.photos);
  const video = input.hasVideo ? 10 : 0;
  /** Обложка не измерена → не в earned и не в знаменателе. */
  const media = photos + video;
  const mediaMax = 40 - CONTENT_COVER_POINTS;
  const filled = new Set((input.characteristicNames ?? []).map(normName));
  const dictionary = input.categoryCharcNames && input.categoryCharcNames.length > 0 ? input.categoryCharcNames : null;
  const dimensions = input.dimensions;
  const sidesFromCard =
    (dimensions?.length ?? 0) > 0 && (dimensions?.width ?? 0) > 0 && (dimensions?.height ?? 0) > 0;
  const sidesFromCharcs = (["длина", "ширина", "высота"] as const).every((side) =>
    [...filled].some((name) => name.includes(side) && (name.includes("упаков") || name === side)),
  );
  const sidePoints = sidesFromCard || sidesFromCharcs ? 5 : 0;
  const weightPoints =
    (dimensions?.weightKg ?? 0) > 0 || [...filled].some((name) => name.includes("вес") && !name.includes("без упаков"))
      ? 5
      : 0;
  const key = dictionary ? pickKey(dictionary, filled) : null;
  const filledKey = !dictionary
    ? [...filled].find((name) => !/упаков/.test(name) && KEY_RULES.some((rule) => rule.test.test(name)))
    : null;
  const keyPoints = dictionary ? (key == null || key.filled ? 8 : 0) : filledKey ? 8 : 0;
  const keyLabel = key?.name ?? (filledKey ? "ключевой параметр" : "объем, размер или емкость");

  function namedSlot(test: RegExp, pointsIfFilled: number): { points: number; label: string; applicable: boolean } {
    const dictName = dictionaryHit(dictionary, test);
    if (dictionary && !dictName) return { points: pointsIfFilled, label: "", applicable: false };
    const filledNow = slotFilled(filled, dictName, test);
    return {
      points: filledNow ? pointsIfFilled : 0,
      label: dictName ?? "",
      applicable: true,
    };
  }

  const color = namedSlot(/цвет/, 3);
  const material = namedSlot(/материал|состав|ткан/, 2);
  const kit = namedSlot(/комплектац/, 2);
  const basic = sidePoints + weightPoints + keyPoints + color.points + material.points + kit.points;
  const basicNames = [
    sidePoints + weightPoints === 10 ? "габариты и вес" : sidePoints > 0 ? "габариты" : weightPoints > 0 ? "вес" : null,
    keyPoints > 0 && (key?.filled || filledKey) ? key?.name ?? "ключевой параметр" : null,
    color.points > 0 && color.applicable && (dictionary ? Boolean(dictionaryHit(dictionary, /цвет/)) : true) ? "цвет" : null,
    material.points > 0 && material.applicable && (dictionary ? Boolean(dictionaryHit(dictionary, /материал|состав|ткан/)) : true)
      ? "материал"
      : null,
    kit.points > 0 && kit.applicable && (dictionary ? Boolean(dictionaryHit(dictionary, /комплектац/)) : true)
      ? "комплектация"
      : null,
  ].filter((name): name is string => Boolean(name));

  const scoredGaps: ContentGap[] = [];
  if (input.photos < 7) {
    const need = 7 - input.photos;
    scoredGaps.push({
      points: 25 - photos,
      block: "media",
      line: `Фото: ${input.photos} → добавьте ещё ${need} (+${25 - photos} б.)`,
    });
  }
  if (video === 0) {
    scoredGaps.push({ points: 10, block: "media", line: "Видео: нет (+10 б.)" });
  }
  if (sidePoints === 0) {
    scoredGaps.push({ points: 5, block: "filters", line: "Габариты упаковки: нет (+5 б.)" });
  }
  if (weightPoints === 0) {
    scoredGaps.push({ points: 5, block: "filters", line: "Вес: нет (+5 б.)" });
  }
  if (keyPoints === 0) {
    scoredGaps.push({
      points: 8,
      block: "filters",
      line: `Ключевой фильтр: ${displayCharcLabel(keyLabel)} (+8 б.)`,
    });
  }
  const missingNamed: Array<{ label: string; points: number }> = [];
  if (color.applicable && color.points === 0) {
    missingNamed.push({ label: displayCharcLabel(color.label || "Цвет"), points: 3 });
  }
  if (material.applicable && material.points === 0) {
    missingNamed.push({ label: displayCharcLabel(material.label || "Материал"), points: 2 });
  }
  if (kit.applicable && kit.points === 0) {
    missingNamed.push({ label: displayCharcLabel(kit.label || "Комплектация"), points: 2 });
  }
  /**
   * Группа «Не заполнены» остаётся одной строкой (формат 1.6),
   * но в сортировке — по максимальному слоту внутри, иначе «+5 б.» абзацев
   * оказывается ниже видимых «+3» / «+2».
   */
  if (missingNamed.length > 0) {
    scoredGaps.push({
      points: Math.max(...missingNamed.map((row) => row.points)),
      block: "filters",
      line: `Не заполнены: ${missingNamed.map((row) => `${row.label} (+${row.points} б.)`).join(", ")}`,
    });
  }

  const keyName = key?.name ?? null;
  const extraNames = dictionary
    ? dictionary.filter((name) => isExtraName(normName(name), keyName))
    : [...filled].filter((name) => isExtraName(name, filledKey ?? null));
  const extraFilled = dictionary
    ? extraNames.filter((name) => filled.has(normName(name))).length
    : extraNames.length;
  const extraTarget = dictionary ? Math.min(3, extraNames.length) : 3;
  const extrasComplete = dictionary
    ? extraNames.length === 0 || extraFilled >= 3 || extraFilled >= extraNames.length
    : extraFilled >= 3;
  const extraPoints = extrasComplete ? 10 : extraFilled > 0 ? 5 : 0;
  if (!extrasComplete) {
    scoredGaps.push({
      points: 10 - extraPoints,
      block: "filters",
      line: `дополнительные поля категории: ${extraFilled} из ${Math.max(extraTarget, 1)} (+${10 - extraPoints} б.)`,
    });
  }
  const filters = basic + extraPoints;

  const text = input.description?.trim() ?? null;
  const length = text?.length ?? 0;
  const volumePoints = text == null ? 0 : lengthPoints(length);
  const breakPoints = text && length > 0 && hasReadableBreaks(text) ? 5 : 0;
  const capsPoints = text && length > 0 && !shoutingCaps(text) ? 2 : 0;
  const spam = Boolean(text && length > 0 && (keywordDump(text) || wordNausea(text)));
  const spamPoints = text && length > 0 ? (spam ? 2 : 8) : 0;
  const copy = volumePoints + breakPoints + capsPoints + spamPoints;
  if (text == null || volumePoints < 10) {
    const gain = 10 - volumePoints;
    scoredGaps.push({
      points: gain,
      block: "copy",
      line:
        text == null
          ? `Описание: нет → до 800 (+${gain} б.)`
          : `Описание: ${length} знаков → до 800 (+${gain} б.)`,
    });
  }
  if (text && length > 0 && breakPoints === 0) {
    scoredGaps.push({ points: 5, block: "copy", line: "нет абзацев или списков (+5 б.)" });
  }
  if (text && length > 0 && capsPoints === 0) {
    scoredGaps.push({ points: 2, block: "copy", line: "сплошные заглавные (+2 б.)" });
  }
  if (text && length > 0 && spam) {
    scoredGaps.push({ points: 6, block: "copy", line: "ключи распределены неестественно (+6 б.)" });
  }

  /** Обязательные по WB — факт поверх шкалы, без новых весов. */
  const requiredMissing = (input.categoryCharcRequiredNames ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !filled.has(normName(name)));

  scoredGaps.sort((a, b) => b.points - a.points || a.line.localeCompare(b.line, "ru"));

  const requiredGap: ContentGap | null =
    requiredMissing.length > 0
      ? {
          points: 0,
          block: "required",
          line: `Не заполнено обязательное по WB: ${requiredMissing.map(displayCharcLabel).join(", ")}`,
        }
      : null;

  const gaps: ContentGap[] = requiredGap ? [requiredGap, ...scoredGaps] : scoredGaps;
  const gapLines = gaps.map((gap) => gap.line);

  const mediaAdvice = scoredGaps.find((gap) => gap.block === "media")?.line ?? null;
  const charAdvice =
    scoredGaps.find((gap) => gap.block === "filters")?.line ??
    (dictionary ? null : "Справочник категории подтянется после выгрузки. Уже заполненные поля в балле.");
  const textAdvice = scoredGaps.find((gap) => gap.block === "copy")?.line ?? null;

  const blocks: ContentBlock[] = [
    {
      title: "Медиаконтент",
      points: media,
      max: mediaMax,
      lines: [
        `Фотографии: ${input.photos} шт (${photos} из 25 б.)`,
        input.hasVideo ? "Видеообложка: загружена (10 из 10 б.)" : "Видеообложка: 0 из 10 б.",
        "Обложка: не измеряется (вне шкалы)",
      ],
      advice: mediaAdvice,
      action: "visual",
    },
    {
      title: "Характеристики и фильтры",
      points: filters,
      max: 35,
      lines: [
        `Базовые параметры${basicNames.length > 0 ? `: ${basicNames.join(", ")}` : ""} (${basic} из 25 б.)`,
        dictionary && extraNames.length === 0
          ? "Дополнительные фильтры: 10 из 10 б."
          : `Дополнительные фильтры: заполнено ${extraFilled} (${extraPoints} из 10 б.)`,
      ],
      advice: charAdvice,
      action: "card",
    },
    {
      title: "Описание и SEO",
      points: copy,
      max: 25,
      lines: [
        text == null
          ? "Объем: текста в карточке нет (0 из 10 б.)"
          : `Объем: ${length.toLocaleString("ru-RU")} ${symbolWord(length)} (${volumePoints} из 10 б.)`,
        `Структура: абзацы ${breakPoints} из 5 б., регистр ${capsPoints} из 2 б.`,
        spam
          ? "SEO-безопасность: риск пессимизации алгоритмом WB за переспам ключевыми словами (2 из 8 б.)"
          : spamPoints === 8
            ? "SEO-безопасность: ключи распределены естественно (8 из 8 б.)"
            : "SEO-безопасность: 0 из 8 б.",
      ],
      advice: textAdvice,
      action: "description",
    },
  ];
  const earned = media + filters + copy;
  const score = Math.max(0, Math.min(100, Math.round((earned / CONTENT_APPLICABLE_MAX) * 100)));
  const slots: ContentSlots = {
    photos: input.photos,
    photosPoints: photos,
    videoPoints: video,
    cover: "na",
    sides: sidePoints,
    weight: weightPoints,
    key: keyPoints,
    color: color.applicable ? color.points : -1,
    material: material.applicable ? material.points : -1,
    kit: kit.applicable ? kit.points : -1,
    extras: extraPoints,
    volume: volumePoints,
    breaks: breakPoints,
    caps: capsPoints,
    keywords: spamPoints,
  };
  return {
    score,
    earned,
    applicableMax: CONTENT_APPLICABLE_MAX,
    grade: contentGrade(score),
    parts: { media, filters, copy },
    slots,
    gaps,
    gapLines,
    requiredMissing,
    lines: blocks.flatMap((block) => block.lines),
    blocks,
    headline: contentHeadline(score),
  };
}

const NEWBIE_MS = 14 * 24 * 60 * 60 * 1000;

type PillarId = "demand" | "warehouse" | "content" | "reviews";

type FunnelRead = "loading" | "absent" | "error" | "ready" | "unknown";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isNewbie(createdAt: string | null): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created < NEWBIE_MS;
}

function factPoints(orders: number, newbie: boolean): { points: number; lifted: boolean } {
  const real = orders >= 28 ? 20 : orders >= 5 ? 14 : orders >= 1 ? 7 : 0;
  if (newbie && real < 12) return { points: 12, lifted: true };
  return { points: real, lifted: false };
}

function trendPoints(orders: number, prior: number): number {
  if (prior === 0) return orders > 0 ? 15 : 10;
  const delta = ((orders - prior) / prior) * 100;
  if (delta > 5) return 15;
  if (delta >= -5) return 10;
  if (delta >= -25) return 5;
  return 0;
}

function orderLine(orders: number, prior: number | null): string {
  const base = `Заказы: ${orders.toLocaleString("ru-RU")} шт за 28 дней`;
  if (prior == null) return `${base}. Прошлые 28 дней воронка не отдала.`;
  if (prior === 0 && orders > 0) return `${base} (с нуля к прошлым 28 дням).`;
  if (prior === 0) return `${base} (и в прошлых 28 днях заказов не было).`;
  const delta = ((orders - prior) / prior) * 100;
  const sign = delta > 0 ? "+" : "−";
  const pct = Math.abs(delta).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  return `${base} (${sign}${pct}% к прошлым 28 дням).`;
}

function fbsPoints(stock: number): number {
  if (stock >= 10) return 25;
  if (stock >= 1) return 15;
  return 0;
}

function fboPoints(stock: number, perDay: number): number {
  if (stock <= 0) return 0;
  if (perDay <= 0) return 8;
  const days = stock / perDay;
  if (days > 120) return 8;
  if (days < 5) return 6;
  if (days < 15) return 12;
  if (days <= 60) return 25;
  if (days <= 90) return 18;
  return 12;
}

function orderPace(row: SellerFunnelNm): number {
  if (row.ordersPerDay > 0) return row.ordersPerDay;
  if (row.orders > 0) return row.orders / 28;
  return 0;
}

function fboDayText(stock: number, perDay: number): string {
  if (perDay <= 0) return "заказов нет, запас лежит";
  const days = stock / perDay;
  if (days > 180) return "дольше 180 дн. по темпу заказов";
  return `около ${Math.round(days)} дн. по темпу заказов`;
}

function warehouseTitle(fbo: number | null, fbs: number | null): string {
  const onFbo = (fbo ?? 0) > 0;
  const onFbs = (fbs ?? 0) > 0;
  if (onFbo && onFbs) return "Склад (FBO и FBS)";
  if (onFbs) return "Склад (FBS)";
  if (onFbo) return "Склад (FBO)";
  return "Склад";
}

function warehousePillar(
  fbo: number | null,
  fbs: number | null,
  pace: number | null,
): { points: number | null; lines: string[] } {
  if (fbo == null && fbs == null) {
    return { points: null, lines: ["Остатки FBO и FBS ещё не прочитаны."] };
  }
  const lines: string[] = [];
  const parts: Array<{ units: number; points: number }> = [];
  const fboBlocked = fbo != null && fbo > 0 && pace == null;

  if (fbo == null) lines.push("FBO: остаток не прочитан.");
  else if (fbo === 0) lines.push("FBO: 0 шт.");
  else if (pace == null) lines.push(`FBO: ${fbo.toLocaleString("ru-RU")} шт. Дни запаса не считаем, пока не прочитаны заказы.`);
  else {
    const points = fboPoints(fbo, pace);
    lines.push(`FBO: ${fbo.toLocaleString("ru-RU")} шт, ${fboDayText(fbo, pace)}.`);
    parts.push({ units: fbo, points });
  }

  if (fbs == null) lines.push("FBS: остаток не прочитан.");
  else if (fbs === 0) lines.push("FBS: 0 шт.");
  else {
    const points = fbsPoints(fbs);
    lines.push(`FBS: ${fbs.toLocaleString("ru-RU")} шт на своём складе.`);
    parts.push({ units: fbs, points });
  }

  if (fboBlocked) return { points: null, lines };
  if (parts.length > 0) {
    const weight = parts.reduce((sum, part) => sum + part.units, 0);
    const points = round1(parts.reduce((sum, part) => sum + part.units * part.points, 0) / weight);
    return { points, lines };
  }
  if (fbo === 0 && fbs === 0) return { points: 0, lines: ["Остатка нет ни на складе WB, ни на своём."] };
  return { points: null, lines };
}

function reviewPoints(rating: number): number {
  if (rating <= 0) return 14;
  if (rating >= 4.8) return 20;
  if (rating >= 4.5) return 15;
  if (rating >= 4) return 8;
  return 2;
}

function funnelRead(
  externalId: string,
  funnel: SellerFunnelSnapshot | null,
  funnelLoading: boolean,
): { state: FunnelRead; row: SellerFunnelNm | null; error: string | null } {
  if (funnelLoading && (!funnel || (funnel.error && Object.keys(funnel.byNm).length === 0))) {
    return { state: "loading", row: null, error: null };
  }
  if (!funnel) return { state: "absent", row: null, error: null };
  const row = funnel.byNm[externalId];
  if (row) return { state: "ready", row, error: null };
  if (funnel.error) return { state: "error", row: null, error: funnel.error };
  /** Нет строки в byNm — неизвестно, не ноль. Раньше stub подставлял 0 и завышал индекс. */
  return { state: "unknown", row: null, error: null };
}

function missingHeadline(state: FunnelRead, error: string | null, warehouseKnown: boolean): string {
  switch (state) {
    case "loading":
    case "absent":
      return "Заказы и отзывы ещё не в числе: воронка читается.";
    case "error":
      return error ?? "Воронка заказов не прочиталась. Эти баллы в оценку не входят.";
    case "unknown":
      return "Этот артикул не попал в прочитанную часть воронки. Заказы и отзывы в оценку не входят.";
    case "ready":
      return warehouseKnown
        ? "Оценка соберётся, когда все четыре столпа будут прочитаны."
        : "Склад в оценку не вошёл: остаток не прочитан целиком.";
    default: {
      const unexpected: never = state;
      return unexpected;
    }
  }
}

function pillarHeadline(
  id: PillarId,
  points: number,
  max: number,
  orders: number,
  trend: number,
): string {
  const shown = `${points.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из ${max}`;
  switch (id) {
    case "demand":
      if (orders === 0) return "За 28 дней заказов не было.";
      if (trend === 0) return "Заказы упали сильнее чем на 25% к прошлым 28 дням.";
      return `Главная недоборка — заказы: ${shown}.`;
    case "warehouse":
      return `Главная недоборка — склад: ${shown}.`;
    case "content":
      return `Главная недоборка — упаковка карточки: ${shown}.`;
    case "reviews":
      return `Главная недоборка — рейтинг: ${shown}.`;
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function productIndex(input: {
  content: number;
  sale: number | null;
  cost: number | null;
  floor: number | null;
  margin: ProductMargin | null;
  stockFbo: number | null;
  stockFbs: number | null;
  createdAt: string | null;
  externalId: string;
  funnel: SellerFunnelSnapshot | null;
  funnelLoading: boolean;
}): {
  index: number | null;
  indexDetail: string;
  blocks: ContentBlock[];
  headline: string;
} {
  const read = funnelRead(input.externalId, input.funnel, input.funnelLoading);
  const newbie = isNewbie(input.createdAt);
  let demandPoints: number | null = null;
  let demandLines = ["Заказы ещё не прочитаны."];
  let trend = 0;
  let orders = 0;
  if (read.state === "ready" && read.row) {
    orders = read.row.orders;
    const factScore = factPoints(orders, newbie);
    if (read.row.priorOrders == null) {
      demandLines = [orderLine(orders, null)];
    } else {
      trend = trendPoints(orders, read.row.priorOrders);
      demandPoints = factScore.points + trend;
      demandLines = [orderLine(orders, read.row.priorOrders)];
      if (factScore.lifted) demandLines.push("Карточке меньше 14 дней: за факт заказов не меньше 12.");
    }
  } else if (read.state === "error") {
    demandLines = [read.error ?? "Воронка заказов не прочиталась."];
  } else if (read.state === "unknown") {
    demandLines = ["Этого артикула нет в прочитанной части воронки. Ноль заказов из этого не следует."];
  }

  const pace = read.state === "ready" && read.row ? orderPace(read.row) : null;
  const warehouse = warehousePillar(input.stockFbo, input.stockFbs, pace);
  const contentPoints = round1(input.content * 0.2);
  let reviewScore: number | null = null;
  let reviewLines = ["Рейтинг ещё не прочитан."];
  if (read.state === "ready" && read.row) {
    const rating = read.row.feedbackRating ?? 0;
    reviewScore = reviewPoints(rating);
    reviewLines =
      rating <= 0
        ? ["Отзывов нет: 14 из 20, чтобы карточка без оценок не падала в ноль."]
        : [`Рейтинг: ${rating.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из 5.`];
  } else if (read.state === "error") {
    reviewLines = [read.error ?? "Рейтинг не прочитан."];
  } else if (read.state === "unknown") {
    reviewLines = ["Этого артикула нет в прочитанной части воронки. Отсутствие отзывов из этого не следует."];
  }

  const scored = demandPoints != null && warehouse.points != null && reviewScore != null;
  const belowFloor = input.floor != null && input.sale != null && input.sale < input.floor;
  const veto = scored && belowFloor;
  const sum =
    (demandPoints ?? 0) + (warehouse.points ?? 0) + contentPoints + (reviewScore ?? 0);
  const index = scored ? Math.max(0, Math.min(100, Math.round(veto ? Math.min(sum, 25) : sum))) : null;

  const economyLines: string[] = [];
  let economyAdvice: string | null = null;
  if (input.cost == null) {
    economyLines.push("Себестоимость не введена. Маржа в эти 100 баллов не входит.");
  } else if (!input.margin || input.floor == null || input.sale == null) {
    economyLines.push("Долю списаний из отчёта реализации приложить не к чему. Маржа в оценку не входит.");
  } else {
    economyLines.push(
      `Маржинальность: ${oneDecimal(input.margin.percent)}% (с 1 продажи ${signedRub(input.margin.rub)}).`,
    );
    const headroom = input.sale - input.floor;
    economyLines.push(
      headroom >= 0
        ? `Запас до порога безубыточности: ${rub(headroom)}.`
        : `До порога безубыточности не хватает ${rub(Math.abs(headroom))}.`,
    );
    if (veto) {
      economyAdvice = `Критический убыток: товар продаётся на ${rub(input.floor - input.sale)} ниже порога, на котором после списаний WB закупка покрыта. Высокие баллы заблокированы, пока цена не выше этого порога.`;
    }
  }

  const blocks: ContentBlock[] = [
    {
      title: "Спрос и динамика заказов",
      points: demandPoints ?? 0,
      max: demandPoints == null ? 0 : 35,
      lines: demandLines,
      advice: null,
      action: null,
    },
    {
      title: warehouseTitle(input.stockFbo, input.stockFbs),
      points: warehouse.points ?? 0,
      max: warehouse.points == null ? 0 : 25,
      lines: warehouse.lines,
      advice: null,
      action: null,
    },
    {
      title: "Качество упаковки",
      points: contentPoints,
      max: 20,
      lines: [`Контент-скор карточки: ${input.content} из 100.`],
      advice: null,
      action: null,
    },
    {
      title: "Репутация и отзывы",
      points: reviewScore ?? 0,
      max: reviewScore == null ? 0 : 20,
      lines: reviewLines,
      advice: null,
      action: null,
    },
    {
      title: "Юнит-экономика",
      points: 0,
      max: 0,
      lines: economyLines,
      advice: economyAdvice,
      adviceTone: economyAdvice ? "danger" : undefined,
      action: null,
    },
  ];

  let headline = missingHeadline(read.state, read.error, warehouse.points != null);
  if (scored && demandPoints != null && warehouse.points != null && reviewScore != null) {
    if (veto && input.floor != null && input.sale != null) {
      headline = `Товар продаётся на ${rub(input.floor - input.sale)} ниже порога, на котором после списаний WB закупка покрыта. Баллы выше 25 закрыты.`;
    } else {
      const ranked: Array<{ id: PillarId; ratio: number; points: number; max: number }> = [
        { id: "demand", ratio: demandPoints / 35, points: demandPoints, max: 35 },
        { id: "warehouse", ratio: warehouse.points / 25, points: warehouse.points, max: 25 },
        { id: "content", ratio: contentPoints / 20, points: contentPoints, max: 20 },
        { id: "reviews", ratio: reviewScore / 20, points: reviewScore, max: 20 },
      ];
      let worst = ranked[0];
      if (!worst) {
        headline = "Заказы, склад, упаковка и рейтинг держатся.";
      } else {
        for (const item of ranked) {
          if (item.ratio < worst.ratio) worst = item;
        }
        headline =
          worst.ratio >= 0.85
            ? "Заказы, склад, упаковка и рейтинг держатся."
            : pillarHeadline(worst.id, worst.points, worst.max, orders, trend);
      }
    }
  }

  const detail = scored
    ? `${blocks
        .filter((block) => block.max > 0)
        .map((block) => `${block.title} ${block.points} из ${block.max}`)
        .join(". ")}${veto ? ". Цена ниже порога, оценка не выше 25." : ""}`
    : headline;
  return { index, indexDetail: detail, blocks, headline };
}

function promoMark(
  externalId: string,
  promotionIds: string[] | undefined,
  promotions: SellerPromotionRow[] | undefined,
  terms: SellerCatalogSnapshot["promotionEntryTerms"],
): string | null {
  const ids = promotionIds ?? [];
  const linked = (promotions ?? []).filter((promo) => ids.includes(promo.id));
  if (linked.some((promo) => promo.type === "auto")) return "автоакция";
  if (linked.length > 0) return "в акции";
  const now = Date.now();
  const upcoming = (promotions ?? []).find((promo) => {
    if (!promo.startAt || Date.parse(promo.startAt) <= now) return false;
    return Boolean(terms?.[promo.id]?.[externalId]?.planPrice != null);
  });
  if (upcoming) return `скоро «${upcoming.name}»`;
  return null;
}

export function sittingRub(
  item: { externalId: string; costPrice?: number | null; totalStock?: number | null },
  realization: SellerRealizationSnapshot | null,
): number | null {
  if (!realization || realization.error) return null;
  const math = stockPace(item.totalStock ?? 0, realization.byNm[item.externalId]);
  const cost = item.costPrice ?? null;
  if (math.excessUnits > 0 && cost != null && cost > 0) return math.excessUnits * cost;
  return 0;
}

export function frozenPurchase(
  items: Array<{ externalId: string; costPrice?: number | null; totalStock?: number | null }>,
  realization: SellerRealizationSnapshot | null,
): number | null {
  if (!realization || realization.error) return null;
  let sum = 0;
  for (const item of items) {
    const math = stockPace(item.totalStock ?? 0, realization.byNm[item.externalId]);
    const cost = item.costPrice ?? null;
    if (math.excessUnits > 0 && cost != null && cost > 0) sum += math.excessUnits * cost;
  }
  return sum;
}

export type SupplySource = "orders" | "sales-recent" | "sales-span";

/** Сколько уйдёт и сколько довезти по темпу этого артикула. Срок до склада WB сюда не входит. */
export type SupplyPace = {
  source: SupplySource | null;
  /** Штук в день. */
  daily: number | null;
  /** На сколько дней хватит текущего остатка. */
  days: number | null;
  /** Сколько уйдёт за 7 дней при этом темпе. */
  weekUse: number | null;
  /** Сколько уйдёт за 28 дней при этом темпе. Окно отчёта, не календарный месяц. */
  spanUse: number | null;
  /** Сколько ещё довезти, чтобы хватило на 7 дней. 0 — уже хватает. */
  shipWeek: number | null;
  /** Сколько ещё довезти, чтобы хватило на 28 дней. */
  shipSpan: number | null;
};

export function supplyPace(input: {
  stock: number | null;
  /** null — заказы этого артикула неизвестны. 0 — воронка прочитана, заказов не было. */
  ordersPerDay: number | null;
  realization: SellerRealizationNm | undefined;
  reportReady: boolean;
}): SupplyPace {
  const stock = input.stock ?? 0;
  let daily: number | null = null;
  let source: SupplySource | null = null;
  if (input.ordersPerDay != null && input.ordersPerDay > 0) {
    daily = input.ordersPerDay;
    source = "orders";
  } else if (input.reportReady) {
    const math = stockPace(input.stock, input.realization);
    if (math.daily > 0 && math.window !== "none") {
      daily = math.daily;
      source = math.window === "recent" ? "sales-recent" : "sales-span";
    }
  }
  if (daily == null || daily <= 0) {
    return {
      source: null,
      daily: null,
      days: null,
      weekUse: null,
      spanUse: null,
      shipWeek: null,
      shipSpan: null,
    };
  }
  const weekUse = daily * 7;
  const spanUse = daily * 28;
  return {
    source,
    daily,
    days: stock > 0 ? Math.max(0, Math.round(stock / daily)) : 0,
    weekUse,
    spanUse,
    shipWeek: piecesShort(weekUse, stock),
    shipSpan: piecesShort(spanUse, stock),
  };
}

/** Целых штук не хватает до горизонта. Дробь меньше погрешности не округляем вверх. */
function piecesShort(need: number, stock: number): number {
  const gap = need - stock;
  if (gap <= 0.001) return 0;
  return Math.ceil(gap - 1e-9);
}

const READOUT_COPY: Record<ReadoutSectionId, { title: string; about: string; method: string }> = {
  index: {
    title: "Индекс SKU",
    about: "Четыре столпа: заказы, склад, упаковка и рейтинг. Себестоимость в сотню не входит. Если цена ниже порога убытка, оценка не поднимается выше 25.",
    method:
      "Спрос — 35. Факт заказов за 28 дней: от 28 шт. — 20, от 5 до 27 — 14, от 1 до 4 — 7, ноль — 0. Карточка младше 14 дней получает за факт не меньше 12, если дата создания пришла из кабинета. Сравнение с прошлыми 28 днями: рост больше 5% — 15, от −5% до +5% включая края — 10, падение от −5% не включая до −25% включая — 5, глубже −25% — 0. Ноль к нулю — стабильность. Рост с нуля — 15. Это заказы воронки, не продажи отчёта реализации. Склад — 25. FBS: 10 шт. и больше — 25, от 1 до 9 — 15, ноль — 0. Ровно 10 шт. стоит вместе с безопасным остатком: отдельной ступени для десятка не было. FBO по дням от темпа заказов: 15–60 — 25, 61–90 — 18, 5–14 и 91–120 — 12, меньше 5 — 6, дольше 120 или нет заказов при остатке — 8, ноль — 0. Ступени 5–14 и 91–120 в сетке не были заданы, их балл стоит между соседними. Если оба канала с остатком, балл — среднее по штукам. Нулевой канал вес не тянет. Контент — контент-скор × 0,2, максимум 20. Рейтинг воронки: 4,8 и выше — 20, от 4,5 до 4,8 — 15, от 4,0 до 4,5 — 8, ниже 4 — 2, отзывов нет — 14. Если воронка не прочитана или артикул в неё не попал, заказы и рейтинг в сумму не входят и оставшиеся столпы до 100 не растягиваются. Буква: A от 85, B от 70, C от 50, ниже — D. Реклама в число не входит. Число негативных отзывов без ответа воронка не отдаёт.",
  },
  card: {
    title: "Контент",
    about: "Насколько карточка убедительна для покупателя и для поиска. Одна шкала для любой категории.",
    method:
      "100 баллов: медиа 40, фильтры 35, описание 25. Фото: 7 и больше — 25, 5–6 — 20, 3–4 — 14, 1–2 — 6. Видео — 10. Обложка — 5, и эти 5 остаются нулём, пока кадр не измерен: ссылка WB уже размера площадки, резкость, долю товара и плашки по ней не снять. Характеристики не требуют заполнить весь справочник. Габариты упаковки — 5, вес с упаковкой — 5, ключевой фильтр ниши (объем, размер, емкость, а если их нет в категории — мощность, возраст, диагональ или память) — 8, цвет — 3, материал или состав — 2, комплектация — 2. Если такого поля в категории нет, за него баллы не снимаются. Три любых других поля категории — 10, одно или два — 5. Описание: от 800 знаков — 10, 400–799 — 6, 150–399 — 3, короче — 0. Текст длиннее 2 500 знаков этот балл не теряет. Абзацы — 5. Нет сплошных заглавных — 2. Естественные ключи — 8. Повтор корня 3–4 раза на 1 000 знаков балл не режет. Если доля одного корня выше 5% слов или в тексте список ключей через запятую, из этих 8 остаётся 2. Буква контента: A от 85, B от 70, C от 50, ниже — D.",
  },
  stock: {
    title: "Запас",
    about: "На сколько дней хватит остатка, если продажи пойдут тем же темпом, что уже был в отчёте.",
    method:
      "Если за последние 7 дней отчёта продажи были, продажи в день = эти штуки / 7. Если неделя пустая, а за 28 дней продажи есть, день = штуки за 28 дней / 28. Дни запаса = остаток / продажи в день. Это прогноз по уже прошедшим продажам.",
  },
  margin: {
    title: "Маржа на 1 продажу",
    about: "Сколько остаётся с одной продажи после логистики по доставкам за 90 дней, удержаний WB и вашей закупки. Факт за 28 дней — отдельно в рублях, без процента.",
    method:
      "Логистика на 1 продажу из D/R доставок за 90 дней: l = d/b + r·(1−b)/b + прочая/(D−R), выкуп b сглажен с магазином. Удержания k = (S−Pay)/S. u = p·(1−k) − l − s − a − c − налог. Маржа m = u/p. Факт окна 28 дней: начислено, логистика, хранение, приёмка, себестоимость, итог — только рубли.",
  },
  capital: {
    title: "Зависший капитал",
    about: "Закупка на штуки, которые по текущему темпу не продадутся за 28 дней.",
    method:
      "Ожидаемые продажи = продажи в день × 28. Лишние штуки = остаток минус ожидаемые, если остаток больше. Сумма = лишние штуки × себестоимость. Будущее хранение и упущенная выручка из-за нуля сюда не входят: день обнуления и тариф на лежащий остаток отчёт не отдаёт. Хранение, уже списанное с продаж этих 28 дней, показывается отдельно, если оно было.",
  },
  status: {
    title: "Статус",
    about: "Самый острый факт по строке. Индексы стоят в своих колонках, плашка их не заменяет.",
    method:
      "Сначала отчёт и закупка, затем цена ниже порога, минус на штуку, пустой остаток, акция в минус, запас короче 28 дней, отсутствие продаж. Если острого факта нет, плашка «В норме».",
  },
};

export function indexGuide(): ReadoutSection[] {
  return (Object.keys(READOUT_COPY) as ReadoutSectionId[]).map((id) => ({
    id,
    title: READOUT_COPY[id].title,
    figure: null,
    about: READOUT_COPY[id].about,
    method: READOUT_COPY[id].method,
    facts: [],
    next: null,
    receipt: [],
    checklist: [],
    blocks: [],
  }));
}

function buildReadout(args: {
  label: string;
  detail: string;
  card: { score: number; blocks: ContentBlock[]; headline: string };
  indexed: {
    index: number | null;
    blocks: ContentBlock[];
    headline: string;
  };
  burnDays: number | null;
  floor: number | null;
  trend: "up" | "down" | "flat" | null;
  margin: ProductMargin | null;
  marginGap: ProductMarginGap | null;
  soldQty: number | null;
  own: SellerRealizationNm | undefined;
  kept?: { rate: number; source: MarginSource } | null;
  ready: boolean;
  sale: number | null;
  cost: number | null;
  stock: number | null;
  stockFbo: number | null;
  stockFbs: number | null;
  promoMark: string | null;
  reviewRatingAvg: number | null;
  reviewCount180: number | null;
  unansweredReviews: number | null;
  unansweredNegativeReviews: number | null;
  unansweredQuestions: number | null;
}): ReadoutSection[] {
  const math = args.ready ? stockPace(args.stock, args.own) : null;
  const excessRub = math && args.cost != null && args.cost > 0 && math.excessUnits > 0 ? math.excessUnits * args.cost : null;
  const priceNext =
    args.floor != null && args.sale != null && args.sale < args.floor
      ? `Поставьте цену от ${rub(args.floor)}. На ней после списаний WB закупка покрыта, прибыль ноль. Сейчас ${rub(args.sale)}.`
      : null;
  const stockLabel = stockColumn({
    ready: args.ready,
    stock: args.stock,
    soldQty: args.soldQty,
    burnDays: args.burnDays,
    fallbackDays: null,
  });
  const stockNext =
    args.stock === 0
      ? args.soldQty != null && args.soldQty > 0
        ? `Остатка нет. За 28 дней продано ${args.soldQty.toLocaleString("ru-RU")} шт.`
        : "Остатка нет."
      : args.burnDays != null && args.burnDays <= 28
        ? `Запаса хватит примерно на ${args.burnDays} дн. Это внутри тех же 28 дней, по которым посчитан темп.`
        : args.burnDays != null && args.burnDays > STOCK_DAY_CAP
          ? `По этому темпу остатка хватает дольше ${STOCK_DAY_CAP} дней. В колонке «> ${STOCK_DAY_CAP} дн.», остаток и продажи — в чеке.`
          : args.burnDays != null
            ? `Запаса хватит примерно на ${args.burnDays} дн.`
            : "Продаж, от которых можно делить остаток, в отчёте нет. Дни не выводим.";
  let trendFact = "Две половины отчёта ещё не сравнить.";
  if (args.trend && args.own && args.sale != null && args.sale > 0 && args.cost != null) {
    const earlyRetail = args.own.earlyRetail ?? 0;
    const lateRetail = args.own.lateRetail ?? 0;
    const early = ((args.sale * ((args.own.earlyNet ?? 0) / earlyRetail) - args.cost) / args.sale) * 100;
    const late = ((args.sale * ((args.own.lateNet ?? 0) / lateRetail) - args.cost) / args.sale) * 100;
    const arrow = args.trend === "up" ? "выше" : args.trend === "down" ? "ниже" : "почти та же";
    trendFact = `Первая половина: маржа ${oneDecimal(early)}%. Вторая: ${oneDecimal(late)}%. Вторая ${arrow}. Считается на текущую цену, доля списаний у каждой половины своя.`;
  }
  const section = (
    id: ReadoutSectionId,
    figure: string | null,
    facts: string[],
    next: string | null,
    receipt: ReceiptRow[] = [],
    checklist: CheckItem[] = [],
    blocks: ContentBlock[] = [],
  ): ReadoutSection => ({
    id,
    title: READOUT_COPY[id].title,
    figure,
    about: READOUT_COPY[id].about,
    method: READOUT_COPY[id].method,
    facts,
    next,
    receipt,
    checklist,
    blocks,
  });
  const impliedKeep =
    args.kept?.rate ??
    (args.sale != null &&
    args.sale > 0 &&
    args.cost != null &&
    args.margin != null
      ? (args.margin.rub + args.cost) / args.sale
      : null);
  const wbTake =
    args.sale != null && impliedKeep != null ? args.sale * (1 - impliedKeep) : null;
  const marginReceipt: ReceiptRow[] = [];
  const bd = args.margin?.breakdown;
  if (bd) {
    marginReceipt.push({ label: "Цена", value: rub(bd.p), role: "line" });
    marginReceipt.push({
      label: "Удержания WB",
      value: `${signedRub(-(bd.p * bd.k))} (${oneDecimal(bd.k * 100)}%)`,
      role: "line",
    });
    marginReceipt.push({ label: "Логистика на 1 продажу", value: signedRub(-bd.l), role: "line" });
    marginReceipt.push({
      label: "· доставка / обратная / выкуп",
      value: `${rub(bd.d)} / ${rub(bd.rReturn)} / ${oneDecimal(bd.b * 100)}% · ${bd.D.toLocaleString("ru-RU")} дост. за 90 дн.`,
      role: "line",
    });
    if (bd.s != null) marginReceipt.push({ label: "Хранение", value: signedRub(-bd.s), role: "line" });
    else if (bd.storageExcluded) marginReceipt.push({ label: "Хранение", value: "нет данных", role: "warn" });
    marginReceipt.push({ label: "Приёмка", value: signedRub(-bd.a), role: "line" });
    if (bd.c > 0) marginReceipt.push({ label: "Себестоимость", value: signedRub(-bd.c), role: "line" });
  } else {
    if (args.sale != null) marginReceipt.push({ label: "Цена со скидкой", value: rub(args.sale), role: "line" });
    if (args.cost != null) marginReceipt.push({ label: "Закупка", value: signedRub(-args.cost), role: "line" });
    if (wbTake != null) marginReceipt.push({ label: "Списания WB", value: signedRub(-wbTake), role: "line" });
  }
  if (args.margin && !args.marginGap) {
    marginReceipt.push({
      label: "Итог на 1 продажу",
      value: `${signedRub(args.margin.rub)}  (${oneDecimal(args.margin.percent)}%)`,
      role: args.margin.rub < 0 ? "loss" : "gain",
    });
  }
  if (args.floor != null && args.floor > 0) marginReceipt.push({ label: "Безубыточность", value: rub(args.floor), role: "warn" });
  if (args.floor != null && args.floor > 0 && args.sale != null) {
    const gap = args.sale - args.floor;
    marginReceipt.push({
      label: gap >= 0 ? "Запас до порога" : "Ниже порога на",
      value: rub(Math.abs(gap)),
      role: gap >= 0 ? "gain" : "loss",
    });
  }
  const f28 = args.margin?.fact28;
  if (f28) {
    marginReceipt.push({ label: "Факт за 28 дней", value: "", role: "line" });
    marginReceipt.push({ label: "· начислено", value: rub(f28.accrued), role: "line" });
    marginReceipt.push({ label: "· логистика", value: signedRub(-f28.logistics), role: "line" });
    marginReceipt.push({ label: "· хранение", value: signedRub(-f28.storage), role: "line" });
    marginReceipt.push({ label: "· приёмка", value: signedRub(-f28.acceptance), role: "line" });
    marginReceipt.push({ label: "· себестоимость", value: signedRub(-f28.cost), role: "line" });
    if (f28.tax !== 0) marginReceipt.push({ label: "· налог", value: signedRub(-f28.tax), role: "line" });
    marginReceipt.push({
      label: "· итог окна",
      value: signedRub(f28.total),
      role: f28.total < 0 ? "loss" : "gain",
    });
  }
  const capitalReceipt: ReceiptRow[] = [];
  if (excessRub != null) capitalReceipt.push({ label: "Зависший капитал", value: rub(excessRub), role: "loss" });
  if (args.stock != null) capitalReceipt.push({ label: "Остаток", value: `${args.stock.toLocaleString("ru-RU")} шт.`, role: "line" });
  if (args.soldQty != null) capitalReceipt.push({ label: "Продано за 28 дней", value: `${args.soldQty.toLocaleString("ru-RU")} шт.`, role: "line" });
  if (math) capitalReceipt.push({ label: "Уйдёт за 28 дней", value: `${oneDecimal(math.expected)} шт.`, role: "line" });
  if (math && math.excessUnits > 0) {
    capitalReceipt.push({ label: "Сверх темпа", value: `${oneDecimal(math.excessUnits)} шт.`, role: "warn" });
  }
  if ((args.own?.storage ?? 0) > 0) {
    capitalReceipt.push({ label: "Хранение в этих продажах", value: rub(args.own?.storage ?? 0), role: "line" });
  }
  const soldMove = args.soldQty == null ? null : qtyDelta(args.soldQty, args.own?.priorQty);
  return [
    section(
      "index",
      args.indexed.index == null
        ? "—"
        : `${gradeTitle("index", args.indexed.index)} · ${args.indexed.index} / 100`,
      [],
      args.indexed.headline,
      [],
      [],
      args.indexed.blocks,
    ),
    section(
      "card",
      `${gradeTitle("content", args.card.score)} · ${args.card.score} / 100`,
      [],
      args.card.headline,
      [],
      [],
      args.card.blocks,
    ),
    section(
      "stock",
      stockLabel.text === "—" ? null : stockLabel.text,
      [args.ready ? paceCaption(args.own) : "Отчёт ещё не прочитан."],
      stockNext,
      [
        ...(args.stock != null ? [{ label: "Остаток", value: `${args.stock.toLocaleString("ru-RU")} шт.`, role: "line" as const }] : []),
        ...(args.stockFbs != null ? [{ label: "FBS, ваш склад", value: `${args.stockFbs.toLocaleString("ru-RU")} шт.`, role: "line" as const }] : []),
        ...(args.stockFbo != null ? [{ label: "FBO, склад WB", value: `${args.stockFbo.toLocaleString("ru-RU")} шт.`, role: "line" as const }] : []),
        ...(args.soldQty != null ? [{ label: "Продано за 28 дней", value: `${args.soldQty.toLocaleString("ru-RU")} шт.`, role: "line" as const }] : []),
        ...(math ? [{ label: "Уйдёт за 28 дней", value: `${oneDecimal(math.expected)} шт.`, role: "line" as const }] : []),
      ],
    ),
    section(
      "margin",
      args.marginGap === "no-deliveries"
        ? "Нет доставок за 90 дней"
        : args.marginGap === "no-cost"
          ? "Без себестоимости"
          : args.margin
            ? `${oneDecimal(args.margin.percent)}%`
            : null,
      [
        args.marginGap === "no-deliveries"
          ? "Нет доставок за 90 дней — маржу на 1 продажу не считаем."
          : args.marginGap === "no-cost"
            ? "Себестоимость не введена — процент маржи на 1 продажу без закупки не показываем."
            : bd
              ? `Маржа на 1 продажу по ${bd.D.toLocaleString("ru-RU")} доставкам за 90 дней.`
              : args.kept
                ? `Доля, которую WB оставил, ${shareText(args.kept.rate)}. ${args.kept.source === "sku" ? "Она из продаж этого артикула." : "У артикула продаж не было, доля взята по всему кабинету."}`
                : "Долю списаний приложить не к чему.",
        f28 ? "Факт за 28 дней — только рубли окна, без процента." : trendFact,
        args.promoMark ? `Акция: ${args.promoMark}.` : "В связанной акции этот артикул не отмечен.",
        soldMove
          ? `Продажи к прошлым 28 дням: ${soldMove.text}.`
          : "Стрелка к прошлым 28 дням появится, когда отчёт прочитается за два окна.",
      ],
      priceNext ??
        (args.margin && !args.marginGap && args.margin.rub >= 0
          ? `На 1 продажу после списаний остаётся ${rub(args.margin.rub)}.`
          : null),
      marginReceipt,
    ),
    section(
      "capital",
      excessRub != null ? rub(excessRub) : "0 ₽",
      (args.own?.storage ?? 0) > 0
        ? ["Хранение в строке — уже списанное с продаж за эти 28 дней."]
        : [],
      excessRub != null
        ? `Не везите ${oneDecimal(math?.excessUnits ?? 0)} шт. повторно, пока темп не вырастет. Это ${rub(excessRub)} закупки.`
        : "Сверх темпа закупки нет.",
      capitalReceipt,
    ),
    section(
      "status",
      args.label,
      [
        args.detail,
        args.reviewCount180 != null
          ? `Отзывы за 180 дней: ${
              args.reviewRatingAvg != null
                ? `${args.reviewRatingAvg.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}★`
                : "—"
            }, ${args.reviewCount180.toLocaleString("ru-RU")} шт.`
          : "Отзывы Seller Hub ещё не прочитаны.",
        args.unansweredReviews != null
          ? `Без ответа: ${args.unansweredReviews.toLocaleString("ru-RU")} отзывов${
              args.unansweredNegativeReviews != null && args.unansweredNegativeReviews > 0
                ? ` (негатив ${args.unansweredNegativeReviews.toLocaleString("ru-RU")})`
                : ""
            }.`
          : "",
        args.unansweredQuestions != null
          ? `Вопросов без ответа: ${args.unansweredQuestions.toLocaleString("ru-RU")}.`
          : "",
      ].filter(Boolean),
      args.detail,
    ),
  ];
}

function shareText(rate: number): string {
  return `${oneDecimal(rate * 100)}%`;
}

function signedRub(value: number): string {
  if (value < 0) return `− ${rub(Math.abs(value))}`;
  if (value > 0) return `+ ${rub(value)}`;
  return rub(0);
}

export function readProduct(input: {
  sale: number | null;
  cost: number | null;
  stock: number | null;
  days: number | null;
  periodDays: number;
  externalId: string;
  promotionIds?: string[];
  photos: number;
  hasVideo: boolean;
  description: string | null;
  characteristicNames: string[] | null;
  categoryCharcNames: string[] | null;
  categoryCharcRequiredNames?: string[] | null;
  dimensions: { length?: number; width?: number; height?: number; weightKg?: number } | null;
  realization: SellerRealizationSnapshot | null;
  paidStorage?: SellerPaidStorageSnapshot | null;
  taxRatePercent?: number | null;
  loading: boolean;
  stockFbo: number | null;
  stockFbs: number | null;
  createdAt: string | null;
  funnel: SellerFunnelSnapshot | null;
  funnelLoading: boolean;
  promotions?: SellerPromotionRow[];
  promotionEntryTerms?: SellerCatalogSnapshot["promotionEntryTerms"];
  activeAdCampaigns: number | null;
  feedbacks?: SellerCatalogSnapshot["feedbacks"];
}): ProductRead {
  const own = input.realization?.byNm[input.externalId];
  const soldQty = input.realization && !input.realization.error ? (own?.qty ?? 0) : null;
  const fbNm = input.feedbacks?.byNm[input.externalId];
  const reviewRatingAvg = fbNm?.ratingAvg ?? null;
  const reviewCount180 = fbNm ? fbNm.reviewCount180 : null;
  const unansweredReviews = fbNm ? fbNm.unansweredTotal : null;
  const unansweredNegativeReviews = fbNm ? fbNm.unansweredNegative : null;
  const unansweredQuestions = fbNm ? fbNm.unansweredQuestions : null;
  // Та же экономика, что у задач: маржа на 1 продажу (90д) через saleMargin.
  const priced = saleMargin({
    realization: input.realization,
    paidStorage: input.paidStorage,
    externalId: input.externalId,
    cost: input.cost,
    sale: input.sale,
    taxRatePercent: input.taxRatePercent,
    stockFbo: input.stockFbo,
  });
  const marginGap: ProductMarginGap | null = priced?.gap ?? (input.cost == null ? "no-cost" : null);
  const floor = priced && !priced.gap ? priced.floor : null;
  const margin =
    priced && !priced.gap
      ? {
          percent: priced.percent,
          rub: priced.rub,
          source: priced.source,
          breakdown: priced.breakdown,
          fact28: priced.fact28,
        }
      : priced?.breakdown
        ? {
            percent: 0,
            rub: 0,
            source: priced.source,
            breakdown: priced.breakdown,
            fact28: priced.fact28 ?? null,
          }
        : null;

  function emit(
    read: Omit<
      ProductRead,
      | "floor"
      | "burnDays"
      | "trend"
      | "index"
      | "indexDetail"
      | "cardScore"
      | "cardParts"
      | "excessUnits"
      | "excessRub"
      | "promoMark"
      | "soldDelta"
      | "reviewRatingAvg"
      | "reviewCount180"
      | "unansweredReviews"
      | "unansweredNegativeReviews"
      | "unansweredQuestions"
      | "readout"
      | "marginGap"
    >,
    nextFloor: number | null,
  ): ProductRead {
    const burnDays = paceDays(input.stock, own);
    const ready = Boolean(input.realization && !input.realization.error);
    const card = contentScore({
      photos: input.photos,
      hasVideo: input.hasVideo,
      description: input.description,
      characteristicNames: input.characteristicNames,
      categoryCharcNames: input.categoryCharcNames,
      categoryCharcRequiredNames: input.categoryCharcRequiredNames ?? null,
      dimensions: input.dimensions,
    });
    const indexed = productIndex({
      content: card.score,
      sale: input.sale,
      cost: input.cost,
      floor: nextFloor,
      margin: marginGap ? null : margin,
      stockFbo: input.stockFbo,
      stockFbs: input.stockFbs,
      createdAt: input.createdAt,
      externalId: input.externalId,
      funnel: input.funnel,
      funnelLoading: input.funnelLoading,
    });
    const trend = ready ? marginTrend(own, input.sale, input.cost) : null;
    const promo = promoMark(input.externalId, input.promotionIds, input.promotions, input.promotionEntryTerms);
    const math = ready ? stockPace(input.stock, own) : null;
    const excessRub = math && input.cost != null && input.cost > 0 && math.excessUnits > 0 ? math.excessUnits * input.cost : null;
    return {
      ...read,
      marginGap,
      floor: nextFloor,
      burnDays,
      trend,
      index: indexed.index,
      indexDetail: indexed.indexDetail,
      cardScore: card.score,
      cardParts: card.parts,
      excessUnits: math ? math.excessUnits : null,
      excessRub,
      promoMark: promo,
      soldDelta: ready && soldQty != null ? qtyDelta(soldQty, own?.priorQty) : null,
      reviewRatingAvg,
      reviewCount180,
      unansweredReviews,
      unansweredNegativeReviews,
      unansweredQuestions,
      readout: buildReadout({
        label: read.label,
        detail: read.detail,
        card,
        indexed,
        burnDays,
        floor: nextFloor,
        trend,
        margin: priced && !priced.gap ? margin : margin,
        marginGap,
        soldQty,
        own,
        kept:
          priced && input.sale != null && input.sale > 0 && input.cost != null
            ? {
                rate: (priced.rub + input.cost) / input.sale,
                source: priced.source,
              }
            : null,
        ready,
        sale: input.sale,
        cost: input.cost,
        stock: input.stock,
        stockFbo: input.stockFbo,
        stockFbs: input.stockFbs,
        promoMark: promo,
        reviewRatingAvg,
        reviewCount180,
        unansweredReviews,
        unansweredNegativeReviews,
        unansweredQuestions,
      }),
    };
  }

  if (input.loading && !input.realization) {
    return emit({ margin: null, soldQty: null, label: "Считаю", detail: "Читаю отчёт реализации WB за 28 дней.", tone: "muted", opensEdit: false }, null);
  }
  if (!input.realization) {
    return emit({ margin: null, soldQty: null, label: "Жду отчёт", detail: "Отчёт реализации ещё не прочитан.", tone: "muted", opensEdit: false }, null);
  }
  if (input.realization.error) {
    return emit({ margin: null, soldQty: null, label: "Нет отчёта", detail: input.realization.error, tone: "warn", opensEdit: false }, null);
  }
  if (input.cost == null) {
    return emit({
      margin: null,
      soldQty,
      label: "Нет закупки",
      detail: "Впишите себестоимость. Без неё порог убытка и маржу не посчитать.",
      tone: "warn",
      opensEdit: true,
    }, null);
  }
  if (marginGap === "no-deliveries") {
    return emit({
      margin: null,
      soldQty,
      label: "Нет доставок",
      detail: "Нет доставок за 90 дней — маржу на 1 продажу не считаем.",
      tone: "muted",
      opensEdit: false,
    }, null);
  }
  if (floor != null && input.sale != null && input.sale < floor) {
    const underCost =
      input.sale < input.cost ? ` Цена ещё и ниже закупки на ${rub(input.cost - input.sale)}.` : "";
    return emit({
      margin,
      soldQty,
      label: "Ниже порога",
      detail: `Убыток ниже ${rub(floor)}. Поставьте цену от ${rub(floor)}: на ней после списаний WB закупка покрыта, прибыль ноль. Сейчас ${rub(input.sale)}.${underCost}`,
      tone: "danger",
      opensEdit: true,
    }, floor);
  }
  if (input.sale != null && input.sale < input.cost) {
    return emit({
      margin,
      soldQty,
      label: "Ниже закупки",
      detail: `Цена ниже закупки на ${rub(input.cost - input.sale)}. Поднимите её в режиме правки.`,
      tone: "danger",
      opensEdit: true,
    }, floor);
  }
  if (input.stock === 0 && margin && margin.rub < 0) {
    return emit({
      margin,
      soldQty,
      label: "Не возвращать",
      detail: "Остатка нет, и после списаний WB цена в минусе. По этой цене на витрину не возвращать.",
      tone: "danger",
      opensEdit: true,
    }, floor);
  }
  if (margin && margin.rub < 0) {
    return emit({
      margin,
      soldQty,
      label: "Минус на шт.",
      detail: `После списаний WB с 1 продажи ${rub(Math.abs(margin.rub))} в минусе (${percent(margin.percent)}).`,
      tone: "danger",
      opensEdit: true,
    }, floor);
  }
  if (input.stock === 0) {
    return emit({
      margin,
      soldQty,
      label: "Нет остатка",
      detail: margin ? `Остатка нет. По этой цене после списаний WB остаётся ${rub(margin.rub)} на штуку.` : "Остатка нет.",
      tone: "danger",
      opensEdit: false,
    }, floor);
  }

  const promoRate =
    priced && input.sale != null && input.sale > 0
      ? (priced.rub + input.cost) / input.sale
      : null;
  const promo =
    promoRate != null && promoRate > 0
      ? promoLine(input.externalId, input.cost, promoRate, input.promotions, input.promotionEntryTerms)
      : null;
  if (promo?.negative) {
    return emit({ margin, soldQty, label: "Акция в минус", detail: promo.text, tone: "danger", opensEdit: false }, floor);
  }

  const reportReady = Boolean(input.realization && !input.realization.error);
  const burn = paceDays(input.stock, own);
  if (reportReady && burn != null && burn <= 28 && (input.stock ?? 0) > 0) {
    return emit({
      margin,
      soldQty,
      label: `Запас ${burn} дн.`,
      detail: `${paceCaption(own)} Остатка хватит примерно на ${burn} дн. Это прогноз по уже прошедшим продажам.`,
      tone: "warn",
      opensEdit: true,
    }, floor);
  }
  if (!reportReady && input.days != null && input.periodDays > 0 && input.days <= input.periodDays && (input.stock ?? 0) > 0) {
    return emit({
      margin,
      soldQty,
      label: `Запас ${input.days} дн.`,
      detail: `Отчёт ещё не прочитан. По заказам в снимке запас до ${runOutLabel(input.days)}.`,
      tone: "warn",
      opensEdit: true,
    }, floor);
  }

  if ((soldQty ?? 0) <= 0 && (input.stock ?? 0) > 0 && margin && margin.rub >= 0) {
    return emit({
      margin,
      soldQty,
      label: "Нет продаж",
      detail:
        input.activeAdCampaigns === 0
          ? "За 28 дней продаж этого артикула не было, остаток есть, по списаниям кабинета маржа держится, активных кампаний нет. Рекламу по фразам можно включать в разделе продвижения."
          : "За 28 дней продаж этого артикула не было, остаток при этом есть.",
      tone: "warn",
      opensEdit: false,
    }, floor);
  }

  if (margin) {
    const burnCover = paceDays(input.stock, own);
    const cover = burnCover != null
      ? ` Запас примерно на ${burnCover} дн. ${paceCaption(own)}`
      : !reportReady && input.days != null
        ? ` Запас до ${runOutLabel(input.days)} по заказам снимка.`
        : "";
    const promoNote = promo && !promo.negative ? ` ${promo.text}` : "";
    return emit({
      margin,
      soldQty,
      label: "В норме",
      detail: `На текущей цене после списаний WB остаётся ${rub(margin.rub)} на штуку, ${percent(margin.percent)}.${cover}${promoNote}`,
      tone: "ok",
      opensEdit: false,
    }, floor);
  }

  return emit({
    margin: null,
    soldQty,
    label: "Нет базы",
    detail: "Маржу на 1 продажу посчитать не из чего: нет доставок за 90 дней или нет продаж для удержаний WB.",
    tone: "muted",
    opensEdit: false,
  }, floor);
}
