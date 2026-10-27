import { median } from "@/lib/seller-hub/event-engine/smart-events";

/**
 * Измерение результата действия агента: что стало с заказами товара после изменения.
 * Метод тот же, что в стандарте правил (§2): тест Пуассона для счётных величин плюс существенность изменения.
 * Честное ограничение: это сравнение «до» и «после», а не доказательство причины. На заказы влияют реклама, акции, сезон, остатки.
 * Поэтому вердикт говорит «заказы выросли/упали/заметного изменения нет», а не «цена помогла». Агент использует вердикты для памяти магазина,
 * но не делает из одного вердикта вывод «так делать всегда».
 */

export type OutcomeVerdict = "improved" | "worse" | "no_visible_effect" | "too_early" | "unknown";

const DAY_MS = 86_400_000;
const shift = (date: string, delta: number) => new Date(Date.parse(`${date}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);

/** Сколько законченных дней после изменения нужно, чтобы судить. */
export const MIN_DAYS_AFTER = 7;
/** Наблюдаем не дольше: дальше на заказы влияет слишком многое другое. */
export const MAX_DAYS_AFTER = 14;
/** Окно «до»: 28 законченных дней перед днём изменения (ровно 4 недели, дни недели не искажают сравнение). */
export const BASELINE_DAYS = 28;
export const MIN_BASELINE_DAYS = 14;
/** Существенность (стандарт §2): изменение не меньше 20% ожидаемого и не меньше 3 заказов за период. */
export const MATERIAL_SHARE = 0.2;
export const MATERIAL_FLOOR = 3;
/** Порог критерия (примерно 95% достоверности). */
export const Z_THRESHOLD = 2;
/** Если ожидаемых заказов за период меньше, судить нельзя: случайность перекрывает любой эффект. */
export const MIN_EXPECTED_ORDERS = 5;

export type OutcomeInput = {
  /** День, когда изменение вступило в силу (дата выполнения по Москве). Этот день в сравнение не входит: изменение случилось посреди дня. */
  changeDate: string;
  /** Сегодняшняя дата по Москве: неполный день не входит. */
  todayKey: string;
  ordersByDate: Map<string, number>;
  /** Сумма заказов по дням, ₽ (если есть): показываем, что стало с выручкой, потому что при смене цены заказы и деньги расходятся. */
  revenueByDate?: Map<string, number>;
};

export type Outcome = {
  verdict: OutcomeVerdict;
  daysAfter: number;
  daysBefore: number;
  /** Заказов в день до и после. */
  rateBefore: number | null;
  rateAfter: number | null;
  /** Сколько заказов ожидалось за период после изменения при прежнем темпе и сколько было. */
  expectedOrders: number | null;
  actualOrders: number | null;
  z: number | null;
  /** Изменение заказов в день, доля (0,25 = +25%). */
  ordersChange: number | null;
  /** Изменение выручки в день, доля. */
  revenueChange: number | null;
  /** Пояснение человеку простым языком. */
  note: string;
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;

export function measureOutcome(input: OutcomeInput): Outcome {
  const empty = (verdict: OutcomeVerdict, note: string, extra: Partial<Outcome> = {}): Outcome => ({
    verdict,
    daysAfter: 0,
    daysBefore: 0,
    rateBefore: null,
    rateAfter: null,
    expectedOrders: null,
    actualOrders: null,
    z: null,
    ordersChange: null,
    revenueChange: null,
    note,
    ...extra,
  });

  const before: number[] = [];
  const beforeRevenue: number[] = [];
  for (let back = 1; back <= BASELINE_DAYS; back += 1) {
    const date = shift(input.changeDate, -back);
    const v = input.ordersByDate.get(date);
    if (v != null) before.push(v);
    const r = input.revenueByDate?.get(date);
    if (r != null) beforeRevenue.push(r);
  }
  const after: number[] = [];
  const afterRevenue: number[] = [];
  for (let ahead = 1; ahead <= MAX_DAYS_AFTER; ahead += 1) {
    const date = shift(input.changeDate, ahead);
    if (date >= input.todayKey) break;
    const v = input.ordersByDate.get(date);
    if (v != null) after.push(v);
    const r = input.revenueByDate?.get(date);
    if (r != null) afterRevenue.push(r);
  }

  if (after.length < MIN_DAYS_AFTER) {
    return empty("too_early", `Прошло ${after.length} из ${MIN_DAYS_AFTER} дней наблюдения: результат пока оценивать рано.`, { daysAfter: after.length, daysBefore: before.length });
  }
  if (before.length < MIN_BASELINE_DAYS) {
    return empty("unknown", `До изменения в истории всего ${before.length} дней (нужно не меньше ${MIN_BASELINE_DAYS}): сравнивать не с чем.`, { daysAfter: after.length, daysBefore: before.length });
  }

  const rateBefore = before.reduce((s, v) => s + v, 0) / before.length;
  const rateAfter = after.reduce((s, v) => s + v, 0) / after.length;
  const expected = rateBefore * after.length;
  const actual = after.reduce((s, v) => s + v, 0);
  const base = { daysAfter: after.length, daysBefore: before.length, rateBefore, rateAfter, expectedOrders: expected, actualOrders: actual };

  const avg = (list: number[]) => (list.length > 0 ? list.reduce((s, v) => s + v, 0) / list.length : null);
  const revBefore = avg(beforeRevenue);
  const revAfter = avg(afterRevenue);
  const revenueChange = revBefore != null && revBefore > 0 && revAfter != null ? revAfter / revBefore - 1 : null;
  const revenueNote = revenueChange != null ? ` Выручка в день: ${pct(revenueChange)}.` : "";

  if (expected < MIN_EXPECTED_ORDERS) {
    return { ...base, verdict: "unknown", z: null, ordersChange: null, revenueChange, note: `Заказов у товара слишком мало (при прежнем темпе ждали бы около ${expected.toFixed(1)} за ${after.length} дн.), чтобы отличить эффект от случайности.${revenueNote}` };
  }

  const z = (actual - expected) / Math.sqrt(Math.max(expected, 1));
  const diff = actual - expected;
  const material = Math.abs(diff) >= Math.max(MATERIAL_FLOOR, MATERIAL_SHARE * expected);
  const ordersChange = rateBefore > 0 ? rateAfter / rateBefore - 1 : null;
  const detail = `Заказов в день: ${rateBefore.toFixed(1)} → ${rateAfter.toFixed(1)} (${ordersChange != null ? pct(ordersChange) : "—"}).${revenueNote}`;
  const caveat = " Это сравнение до и после, а не доказательство причины: на заказы влияют реклама, акции и сезон.";

  if (z >= Z_THRESHOLD && material && diff > 0) return { ...base, verdict: "improved", z, ordersChange, revenueChange, note: `Заказы заметно выше прежнего уровня. ${detail}${caveat}` };
  if (z <= -Z_THRESHOLD && material && diff < 0) return { ...base, verdict: "worse", z, ordersChange, revenueChange, note: `Заказы заметно ниже прежнего уровня. ${detail}${caveat}` };
  return { ...base, verdict: "no_visible_effect", z, ordersChange, revenueChange, note: `Заметного изменения заказов нет. ${detail}${caveat}` };
}

/** Медиана для устойчивой оценки базового уровня, если понадобится в отчётах. */
export const medianOf = median;

/**
 * Окно наблюдения: до какого момента ждём результата после выполнения. 7 законченных дней после дня изменения плюс запас,
 * чтобы проверка шла уже на следующие сутки после 7-го дня.
 */
export function observeUntil(executedAtMs: number): string {
  return new Date(executedAtMs + (MIN_DAYS_AFTER + 2) * DAY_MS).toISOString();
}
