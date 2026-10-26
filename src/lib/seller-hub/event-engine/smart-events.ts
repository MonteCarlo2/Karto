import { EVENT_GROUP, type SellerEventKind, type SellerProductEvent } from "./types";

/**
 * «Умные» уведомления: пороги не фиксированные, а подстраиваются под самого продавца.
 *  - Ожидаемый уровень заказов за день берётся из собственной истории магазина (медиана за 28 дней, с поправкой на день недели,
 *    если он стабильно отличается), а допустимый разброс — из того, насколько сам магазин колеблется (устойчивая оценка MAD, не меньше
 *    естественной «пуассоновской» шумности √ожидаемого). Магазин с ровными продажами получает уведомление при малом отклонении,
 *    магазин с рваными — только при большом.
 *  - Тенденции: несколько дней подряд ниже или выше ожидаемого — одно уведомление в начале эпизода и одно, когда показатель вернулся.
 *  - Конверсии воронки сравниваются статистическим критерием (разность долей), а не «на столько-то процентов».
 *  - Товар «замолчал» — когда нулевая серия заказов маловероятна при его обычном спросе (модель Пуассона).
 * Чувствительность задаёт пользователь. Все события строятся только из сохранённой истории WB в нашей базе.
 */

export type Sensitivity = "low" | "normal" | "high";
export const SENSITIVITIES: readonly Sensitivity[] = ["low", "normal", "high"];
export const DEFAULT_SENSITIVITY: Sensitivity = "normal";
export const isSensitivity = (v: unknown): v is Sensitivity => typeof v === "string" && (SENSITIVITIES as readonly string[]).includes(v);

type Params = {
  /** Во сколько разбросов должно отличаться значение дня, чтобы это было событием. */
  zDay: number;
  /** Минимальная абсолютная разница в заказах: доля ожидаемого и пол. */
  minDiffShare: number;
  minDiffFloor: number;
  /** Сколько дней подряд «ниже или выше обычного» считается тенденцией и насколько (в разбросах) день должен отклоняться, чтобы входить в серию. */
  trendDays: number;
  trendZ: number;
  /** Порог критерия для конверсий воронки. */
  zFunnel: number;
  /** Вероятность, ниже которой нулевая серия заказов считается «затишьем». */
  silentAlpha: number;
  /** Минимальный обычный спрос товара (заказов в день), чтобы вообще следить за затишьем. */
  silentMinRate: number;
};

const PARAMS: Record<Sensitivity, Params> = {
  low: { zDay: 2.8, minDiffShare: 0.35, minDiffFloor: 4, trendDays: 4, trendZ: 1.0, zFunnel: 3.5, silentAlpha: 0.02, silentMinRate: 1.5 },
  normal: { zDay: 2.0, minDiffShare: 0.25, minDiffFloor: 3, trendDays: 3, trendZ: 0.8, zFunnel: 2.8, silentAlpha: 0.05, silentMinRate: 1.0 },
  high: { zDay: 1.5, minDiffShare: 0.2, minDiffFloor: 2, trendDays: 3, trendZ: 0.6, zFunnel: 2.0, silentAlpha: 0.1, silentMinRate: 0.7 },
};

export const paramsFor = (s: Sensitivity): Params => PARAMS[s];

const WINDOW_DAYS = 28;
const MIN_WINDOW_POINTS = 10;
/** Новые события ищем только в последних днях: старая история событий не создаёт. */
const RECENT_DAYS = 3;
const DAY_MS = 86_400_000;

export type StoreDay = { date: string; orders: number | null; opens: number | null; carts: number | null };
export type ProductDay = { date: string; nmId: string; orders: number | null };

const shift = (date: string, delta: number) => new Date(Date.parse(`${date}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Устойчивая оценка разброса: 1,4826 × медиана абсолютных отклонений (для нормального закона совпадает с σ). */
export function scaledMad(values: number[]): number {
  const m = median(values);
  return 1.4826 * median(values.map((v) => Math.abs(v - m)));
}

export type Expectation = { expected: number; sigma: number; points: number; weekdayAdjusted: boolean };

/**
 * Ожидаемое число заказов на дату `date` по предыдущим 28 дням. Меньше 10 наблюдений — null (мало истории, не гадаем).
 * Поправка на день недели применяется, только если у этого дня недели есть хотя бы 3 наблюдения и он стабильно отличается.
 */
export function expectedFor(byDate: Map<string, number>, date: string): Expectation | null {
  const window: Array<[number, number]> = [];
  for (let back = 1; back <= WINDOW_DAYS; back += 1) {
    const v = byDate.get(shift(date, -back));
    if (v != null) window.push([back, v]);
  }
  if (window.length < MIN_WINDOW_POINTS) return null;
  const values = window.map(([, v]) => v);
  const level = median(values);
  let factor = 1;
  let adjusted = false;
  const same = window.filter(([back]) => back % 7 === 0).map(([, v]) => v);
  if (same.length >= 3 && level > 0) {
    factor = Math.min(2, Math.max(0.5, median(same) / level));
    adjusted = Math.abs(factor - 1) >= 0.1;
    if (!adjusted) factor = 1;
  }
  const expected = level * factor;
  const sigma = Math.max(scaledMad(values) * factor, Math.sqrt(Math.max(expected, 1)), 1);
  return { expected, sigma, points: window.length, weekdayAdjusted: adjusted };
}

const make = (kind: SellerEventKind, severity: SellerProductEvent["severity"], title: string, detail: string, now: string, key: string, nmId: string | null = null, productTitle: string | null = null): SellerProductEvent => ({
  id: `${kind}:${nmId ?? "store"}:${key}`,
  createdAt: now,
  kind,
  group: EVENT_GROUP[kind],
  severity,
  title,
  detail,
  productTitle,
  vendorCode: null,
  nmId,
  itemId: null,
});

const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const num = (n: number, digits = 1) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });

type Run = { start: string; end: string; length: number };

/** Непрерывные серии подряд идущих дат, где флаг истинный. */
function runs(dates: string[], flag: Map<string, boolean>): Run[] {
  const out: Run[] = [];
  let start: string | null = null;
  let end: string | null = null;
  let length = 0;
  const close = () => {
    if (start != null && end != null) out.push({ start, end, length });
    start = null;
    end = null;
    length = 0;
  };
  for (const date of dates) {
    if (flag.get(date) !== true) {
      close();
      continue;
    }
    if (end != null && diffDays(date, end) !== 1) close();
    if (start == null) start = date;
    end = date;
    length += 1;
  }
  close();
  return out;
}

export type SmartInput = {
  now: string;
  /** Сегодняшняя дата по Москве: неполный день в расчёт не входит. */
  todayKey: string;
  store: StoreDay[];
  products: ProductDay[];
  titleOf: (nmId: string) => string | null;
  /** Товары без остатка: затишье объяснено отсутствием товара, по ним не сообщаем. */
  outOfStock: Set<string>;
  sensitivity: Sensitivity;
};

/** Двухвыборочный критерий разности долей: z-статистика и относительное изменение. */
export function proportionShift(successA: number, totalA: number, successB: number, totalB: number): { z: number; pA: number; pB: number } | null {
  if (totalA <= 0 || totalB <= 0) return null;
  const pA = successA / totalA;
  const pB = successB / totalB;
  const pooled = (successA + successB) / (totalA + totalB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / totalA + 1 / totalB));
  if (se === 0) return null;
  return { z: (pA - pB) / se, pA, pB };
}

export function smartEvents(input: SmartInput): SellerProductEvent[] {
  const p = paramsFor(input.sensitivity);
  const out: SellerProductEvent[] = [];
  const complete = input.store.filter((d) => d.date < input.todayKey).sort((a, b) => a.date.localeCompare(b.date));
  const recentFrom = shift(input.todayKey, -RECENT_DAYS);
  const isRecent = (date: string) => date >= recentFrom;

  // 1. Заказы магазина за день и тенденции.
  const ordersByDate = new Map(complete.filter((d) => d.orders != null).map((d) => [d.date, d.orders as number]));
  const dates = [...ordersByDate.keys()].sort();
  const z = new Map<string, { z: number; e: Expectation; x: number }>();
  for (const date of dates) {
    const e = expectedFor(ordersByDate, date);
    if (e) z.set(date, { z: (ordersByDate.get(date)! - e.expected) / e.sigma, e, x: ordersByDate.get(date)! });
  }
  for (const [date, r] of z) {
    if (!isRecent(date)) continue;
    const diff = r.x - r.e.expected;
    const minDiff = Math.max(p.minDiffFloor, p.minDiffShare * r.e.expected);
    if (Math.abs(r.z) < p.zDay || Math.abs(diff) < minDiff) continue;
    const range = `обычный разброс ±${num(r.e.sigma)}`;
    const base = r.e.weekdayAdjusted ? "для этого дня недели" : "за последние недели";
    const detail = `Заказов за день: ${r.x}. Ожидали около ${num(r.e.expected)} (${base}, ${range}).`;
    if (diff < 0) out.push(make("day_orders_drop", "important", `${dayLabel(date)}: заказов заметно меньше обычного`, detail, input.now, date));
    else out.push(make("day_orders_spike", "info", `${dayLabel(date)}: заказов заметно больше обычного`, detail, input.now, date));
  }
  for (const dir of ["down", "up"] as const) {
    const flag = new Map([...z].map(([d, r]) => [d, dir === "down" ? r.z <= -p.trendZ : r.z >= p.trendZ]));
    for (const run of runs([...z.keys()].sort(), flag)) {
      if (run.length < p.trendDays) continue;
      const span = [...z].filter(([d]) => d >= run.start && d <= run.end);
      const actual = span.reduce((s, [, r]) => s + r.x, 0);
      const expected = span.reduce((s, [, r]) => s + r.e.expected, 0);
      // Серия должна быть ощутимой по сумме: отклонение суммарно не меньше 15% ожидаемого.
      const material = expected > 0 && Math.abs(actual - expected) / expected >= 0.15;
      // Сообщаем, пока эпизод продолжается (или только что закончился): идентификатор по дате начала не даёт дублей при повторной проверке.
      if (isRecent(run.end) && material) {
        const pct = expected > 0 ? Math.round(((actual - expected) / expected) * 100) : 0;
        const title = dir === "down" ? `Заказы ниже обычного ${run.length} ${run.length < 5 ? "дня" : "дней"} подряд` : `Заказы выше обычного ${run.length} ${run.length < 5 ? "дня" : "дней"} подряд`;
        out.push(make(dir === "down" ? "trend_orders_down" : "trend_orders_up", dir === "down" ? "important" : "info", title, `С ${dayLabel(run.start)}: ${actual} заказов вместо ожидаемых около ${num(expected, 0)} (${pct > 0 ? "+" : ""}${pct}%). Это тенденция, а не случайный день.`, input.now, `${dir}:${run.start}`));
      }
      // Возврат к обычному: два дня подряд после эпизода без отклонения.
      const afterDates = [...z.keys()].sort().filter((d) => d > run.end).slice(0, 2);
      const back = afterDates.length === 2 && diffDays(afterDates[0]!, run.end) === 1 && afterDates.every((d) => (dir === "down" ? z.get(d)!.z > -0.3 : z.get(d)!.z < 0.3));
      if (back && isRecent(afterDates[1]!)) {
        out.push(make("trend_recovered", "info", dir === "down" ? "Заказы вернулись к обычному уровню" : "Заказы вернулись с повышенного уровня к обычному", `Эпизод с ${dayLabel(run.start)} по ${dayLabel(run.end)} закончился.`, input.now, `${dir}:${run.start}`));
      }
    }
  }

  // 2. Конверсии воронки: последние 7 дней против предыдущих 21, критерий разности долей.
  const byDay = new Map(complete.map((d) => [d.date, d]));
  const funnelDates = complete.map((d) => d.date).filter((d) => d >= shift(input.todayKey, -10));
  for (const metric of ["cart", "order"] as const) {
    const flags = new Map<string, boolean>();
    const info = new Map<string, { pA: number; pB: number; z: number }>();
    for (const date of funnelDates) {
      let a = [0, 0];
      let b = [0, 0];
      let na = 0;
      let nb = 0;
      for (let back = 0; back < 28; back += 1) {
        const d = byDay.get(shift(date, -back));
        if (!d || d.opens == null || d.carts == null || d.orders == null) continue;
        const [succ, tot] = metric === "cart" ? [d.carts, d.opens] : [d.orders, d.carts];
        if (back < 7) {
          a = [a[0]! + succ, a[1]! + tot];
          na += 1;
        } else {
          b = [b[0]! + succ, b[1]! + tot];
          nb += 1;
        }
      }
      if (na < 7 || nb < 14 || a[1]! < 300 || b[1]! < 600) continue;
      const r = proportionShift(a[0]!, a[1]!, b[0]!, b[1]!);
      if (!r) continue;
      info.set(date, { pA: r.pA, pB: r.pB, z: r.z });
      flags.set(date, Math.abs(r.z) >= p.zFunnel && Math.abs(r.pA - r.pB) / Math.max(r.pB, 1e-9) >= 0.12);
    }
    for (const run of runs(funnelDates, flags)) {
      if (run.length < 2) continue;
      if (!isRecent(run.end)) continue;
      const r = info.get(run.end)!;
      const down = r.pA < r.pB;
      const label = metric === "cart" ? "из просмотра в корзину" : "из корзины в заказ";
      out.push(make("funnel_shift", down ? "important" : "info", `Конверсия ${label} ${down ? "снизилась" : "выросла"}`, `За последние 7 дней ${num(r.pA * 100)}% против ${num(r.pB * 100)}% за предыдущие 3 недели. Различие устойчивое: случайно такое бывает реже, чем в одном случае из ${num(Math.min(1000, Math.round(1 / Math.max(2 * (1 - normalCdf(Math.abs(r.z))), 0.001))), 0)}.`, input.now, `${metric}:${run.start}`));
    }
  }

  // 3. Товар «замолчал»: нулевая серия заказов маловероятна при его обычном спросе (Пуассон).
  const byNm = new Map<string, Map<string, number>>();
  for (const row of input.products) {
    if (row.orders == null || row.date >= input.todayKey) continue;
    if (!byNm.has(row.nmId)) byNm.set(row.nmId, new Map());
    byNm.get(row.nmId)!.set(row.date, row.orders);
  }
  const lastDay = shift(input.todayKey, -1);
  for (const [nmId, days] of byNm) {
    if (input.outOfStock.has(nmId) || !days.has(lastDay)) continue;
    let streak = 0;
    while (days.get(shift(lastDay, -streak)) === 0) streak += 1;
    // Меньше трёх дней тишины не сообщаем, какой бы маловероятной она ни была: это ещё не картина.
    if (streak < 3) continue;
    const base: number[] = [];
    for (let back = streak; back < streak + 21; back += 1) {
      const v = days.get(shift(lastDay, -back));
      if (v != null) base.push(v);
    }
    if (base.length < 14) continue;
    const rate = base.reduce((s, v) => s + v, 0) / base.length;
    if (rate < p.silentMinRate) continue;
    const prob = Math.exp(-rate * streak);
    if (prob >= p.silentAlpha) continue;
    const start = shift(lastDay, -(streak - 1));
    // Эпизод фиксируем, когда серия впервые стала достаточно маловероятной.
    let triggerLen = 3;
    while (triggerLen < streak && Math.exp(-rate * triggerLen) >= p.silentAlpha) triggerLen += 1;
    // Тишина — переход, пока она свежая: серия, затянувшаяся больше недели, уже состояние (раздел «Задачи», «Нет продаж»).
    if (shift(start, triggerLen - 1) < shift(input.todayKey, -7)) continue;
    out.push(make("product_silent", "important", "Товар перестал получать заказы", `${streak} ${streak < 5 ? "дня" : "дней"} подряд без заказов, а обычно было около ${num(rate)} в день. При обычном спросе такая тишина бывает примерно в ${num(prob * 100, prob < 0.01 ? 2 : 1)}% случаев.`, input.now, start, nmId, input.titleOf(nmId)));
  }

  return out;
}

/** Функция стандартного нормального распределения (приближение Абрамовица и Стиган, ошибка < 1e-7 · порядка). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
